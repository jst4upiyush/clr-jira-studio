'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type {
  AttachmentExtractionResponse,
  DraftScope,
  DraftWorkItem,
  DraftWorkItemSet,
  JiraIssueSearchResponse,
  JiraParentIssueListResponse,
  ParentIssueLevel,
  ProjectSummary,
  SubmissionSet,
  TemplateSummary,
  UpdateDraftItemRequest,
} from '@jira-idea-studio/shared';
import { Download, FileUp, RefreshCcw, Search, Sparkles } from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import { ScopeCardSelector } from '@/components/scope-card-selector';
import {
  createDraft,
  extractAttachments,
  listJiraParentIssues,
  refineDraft,
  searchJiraIssues,
  submitDraft,
  updateDraftItem,
} from '@/lib/api';
import {
  getDraftScopeDetail,
  REQUIRED_LEVELS_BY_SCOPE,
  scopeRequiresExistingEpic,
  scopeRequiresExistingFeature,
} from '@/lib/draft-scopes';

const INPUT_CLASS = 'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm';

type CreatePageClientProps = {
  initialProjects: ProjectSummary[];
  initialTemplates: TemplateSummary[];
};

type FormState = {
  projectId: string;
  templateId: string;
  scope: DraftScope;
  textInput: string;
  existingEpicKey: string;
  existingFeatureKey: string;
  searchQuery: string;
  labels: string;
  components: string;
  defaultStoryPoints: string;
  targetStartDate: string;
  targetEndDate: string;
};

type DraftItemFormState = {
  title: string;
  description: string;
  storyPoints: string;
  labels: string;
  components: string;
  targetStartDate: string;
  targetEndDate: string;
};

const initialForm = (projects: ProjectSummary[]): FormState => ({
  projectId: projects[0]?.id ?? '',
  templateId: '',
  scope: 'EPIC_WITH_FEATURES_AND_STORIES',
  textInput: '',
  existingEpicKey: '',
  existingFeatureKey: '',
  searchQuery: '',
  labels: '',
  components: '',
  defaultStoryPoints: '',
  targetStartDate: '',
  targetEndDate: '',
});

export function CreatePageClient({ initialProjects, initialTemplates }: CreatePageClientProps) {
  const [form, setForm] = useState<FormState>(() => initialForm(initialProjects));
  const [searchResults, setSearchResults] = useState<JiraIssueSearchResponse | null>(null);
  const [draft, setDraft] = useState<DraftWorkItemSet | null>(null);
  const [submission, setSubmission] = useState<SubmissionSet | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<'search' | 'extract' | 'draft' | 'submit' | 'refine' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [extraction, setExtraction] = useState<AttachmentExtractionResponse | null>(null);
  const [epicParentQuery, setEpicParentQuery] = useState('');
  const [featureParentQuery, setFeatureParentQuery] = useState('');
  const [epicParents, setEpicParents] = useState<JiraParentIssueListResponse | null>(null);
  const [featureParents, setFeatureParents] = useState<JiraParentIssueListResponse | null>(null);
  const [parentLoading, setParentLoading] = useState<Record<ParentIssueLevel, boolean>>({ EPIC: false, FEATURE: false });
  const [parentErrors, setParentErrors] = useState<Partial<Record<ParentIssueLevel, string>>>({});
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => initialProjects.find((project) => project.id === form.projectId),
    [form.projectId, initialProjects],
  );
  const selectedTemplate = useMemo(
    () => initialTemplates.find((template) => template.id === form.templateId),
    [form.templateId, initialTemplates],
  );
  const scopeDetail = useMemo(() => getDraftScopeDetail(form.scope), [form.scope]);
  const requiresEpicParent = useMemo(() => scopeRequiresExistingEpic(form.scope), [form.scope]);
  const requiresFeatureParent = useMemo(() => scopeRequiresExistingFeature(form.scope), [form.scope]);
  const projectSupportsEpic = Boolean(selectedProject?.supportedLevels.includes('EPIC'));
  const projectSupportsFeature = Boolean(selectedProject?.supportedLevels.includes('FEATURE'));
  const missingProjectLevels = useMemo(
    () =>
      selectedProject
        ? REQUIRED_LEVELS_BY_SCOPE[form.scope].filter((level) => !selectedProject.supportedLevels.includes(level))
        : [],
    [form.scope, selectedProject],
  );
  const scopeSupportMessage =
    selectedProject && missingProjectLevels.length
      ? `Project ${selectedProject.jiraProjectKey} does not currently support ${missingProjectLevels.join(', ')} issue types required for ${form.scope}.`
      : null;

  useEffect(() => {
    if (!selectedProject || !requiresEpicParent || !projectSupportsEpic) {
      setEpicParents(null);
      return;
    }

    void loadParentIssues({
      projectKey: selectedProject.jiraProjectKey,
      parentLevel: 'EPIC',
      query: epicParentQuery,
      setParentLoading,
      setParentErrors,
      setParentResults: setEpicParents,
    });
  }, [epicParentQuery, projectSupportsEpic, requiresEpicParent, selectedProject]);

  useEffect(() => {
    if (!selectedProject || !requiresFeatureParent || !projectSupportsFeature) {
      setFeatureParents(null);
      return;
    }

    void loadParentIssues({
      projectKey: selectedProject.jiraProjectKey,
      parentLevel: 'FEATURE',
      query: featureParentQuery,
      setParentLoading,
      setParentErrors,
      setParentResults: setFeatureParents,
    });
  }, [featureParentQuery, projectSupportsFeature, requiresFeatureParent, selectedProject]);

  const handleChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleProjectChange = (projectId: string) => {
    setForm((current) => ({
      ...current,
      projectId,
      existingEpicKey: '',
      existingFeatureKey: '',
      searchQuery: '',
    }));
    setSearchResults(null);
    setDraft(null);
    setSubmission(null);
    setSelectedIds([]);
    setEpicParentQuery('');
    setFeatureParentQuery('');
    setEpicParents(null);
    setFeatureParents(null);
    setParentErrors({});
    setError(null);
  };

  const handleScopeChange = (scope: DraftScope) => {
    setForm((current) => ({
      ...current,
      scope,
      templateId: supportsScope(initialTemplates, current.templateId, scope) ? current.templateId : '',
      existingEpicKey: scopeRequiresExistingEpic(scope) ? current.existingEpicKey : '',
      existingFeatureKey: scopeRequiresExistingFeature(scope) ? current.existingFeatureKey : '',
    }));
    setDraft(null);
    setSubmission(null);
    setSelectedIds([]);
    setError(null);
  };

  const handleSearch = async () => {
    if (!selectedProject?.jiraProjectKey || !form.searchQuery.trim()) {
      return;
    }

    try {
      setBusy('search');
      setError(null);
      setSearchResults(await searchJiraIssues(selectedProject.jiraProjectKey, form.searchQuery.trim()));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Failed to search Jira issues.');
    } finally {
      setBusy(null);
    }
  };

  const handleGenerateDraft = async () => {
    if (scopeSupportMessage) {
      setError(scopeSupportMessage);
      return;
    }

    try {
      setError(null);
      setSubmission(null);

      let extractedFiles = extraction?.files ?? [];

      if (selectedFiles.length > 0) {
        setBusy('extract');
        const extractionResponse = await extractAttachments(selectedFiles);
        setExtraction(extractionResponse);
        extractedFiles = extractionResponse.files;
      } else {
        setExtraction(null);
        extractedFiles = [];
      }

      setBusy('draft');

      const nextDraft = await createDraft({
        projectId: form.projectId,
        templateId: form.templateId || undefined,
        scope: form.scope,
        textInput: form.textInput,
        existingEpicKey: form.existingEpicKey || undefined,
        existingFeatureKey: form.existingFeatureKey || undefined,
        queryContext: searchResults
          ? {
              query: searchResults.query,
              matchedIssueKeys: searchResults.issues.map((issue) => issue.key),
              matchedIssues: searchResults.issues,
              note: `Generated with Jira search '${searchResults.query}'.`,
            }
          : undefined,
        defaults: {
          defaultStoryPoints: form.defaultStoryPoints ? Number(form.defaultStoryPoints) : undefined,
          targetStartDate: form.targetStartDate || undefined,
          targetEndDate: form.targetEndDate || undefined,
          labels: parseCsv(form.labels),
          components: parseCsv(form.components),
        },
        files: extractedFiles,
      });

      setDraft(nextDraft);
      setSelectedIds(flattenDraftIds(nextDraft.items));
      setRefineInstruction('');
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : 'Failed to generate draft.');
    } finally {
      setBusy(null);
    }
  };

  const handleSaveDraftItem = async (draftItemId: string, body: UpdateDraftItemRequest) => {
    if (!draft) {
      return;
    }

    try {
      setSavingItemId(draftItemId);
      setError(null);
      const nextDraft = await updateDraftItem(draft.id, draftItemId, body);
      setDraft(nextDraft);
      setSubmission(null);
      setSelectedIds((current) => syncSelectedIds(nextDraft, current));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update the draft item.');
    } finally {
      setSavingItemId(null);
    }
  };

  const handleRefineDraft = async () => {
    if (!draft) {
      return;
    }

    if (!refineInstruction.trim()) {
      setError('Add a refinement instruction before running refine.');
      return;
    }

    try {
      setBusy('refine');
      setError(null);
      const nextDraft = await refineDraft(draft.id, { instruction: refineInstruction.trim() });
      setDraft(nextDraft);
      setSubmission(null);
      setSelectedIds((current) => syncSelectedIds(nextDraft, current));
    } catch (refineError) {
      setError(refineError instanceof Error ? refineError.message : 'Failed to refine the draft.');
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadMarkdown = () => {
    if (!draft) {
      return;
    }

    const markdown = toDraftMarkdown(draft, selectedIds);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${draft.projectKey ?? draft.projectId}-${draft.scope}-${draft.id}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async () => {
    if (!draft || selectedIds.length === 0) {
      return;
    }

    try {
      setBusy('submit');
      setError(null);
      setSubmission(await submitDraft(draft.id, { draftItemIds: selectedIds }));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to submit draft.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Create work items</h1>
        <p className="text-slate-600">
          Generate or refine a Jira hierarchy using your project context, selected template, and any attached docs. If no LLM path is available, heuristic fallback still assembles a usable draft instead of shrugging dramatically.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <SectionCard title="Draft generation request" subtitle="Scope-specific parent requirements, template guidance, Jira context, and file extraction are all wired into the request.">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Project</label>
                <select
                  value={form.projectId}
                  onChange={(event) => handleProjectChange(event.target.value)}
                  title="Project"
                  className={INPUT_CLASS}
                >
                  {initialProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} ({project.jiraProjectKey})
                    </option>
                  ))}
                </select>
                {selectedProject ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Visible levels: {selectedProject.supportedLevels.join(', ')} · Your role: {selectedProject.role}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Template</label>
                <select
                  value={form.templateId}
                  onChange={(event) => handleChange('templateId', event.target.value)}
                  title="Template"
                  className={INPUT_CLASS}
                >
                  <option value="">No template</option>
                  {initialTemplates.map((template) => {
                    const supported = template.supportedScopes.includes(form.scope);

                    return (
                      <option key={template.id} value={template.id} disabled={!supported}>
                        {template.name} v{template.version}{supported ? '' : ' · unsupported for selected scope'}
                      </option>
                    );
                  })}
                </select>
                {selectedTemplate ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {selectedTemplate.owner.displayName} · {selectedTemplate.visibility} · {selectedTemplate.status}
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium">Scope</label>
                <span className="text-xs text-slate-500">Selected scope sends the exact backend DraftScope value.</span>
              </div>
              <ScopeCardSelector value={form.scope} onChange={handleScopeChange} disabled={busy !== null} />
              <p className="mt-2 text-sm text-slate-600">{scopeDetail.creates}</p>
              {scopeSupportMessage ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{scopeSupportMessage}</div>
              ) : null}
            </div>

            {(requiresEpicParent || requiresFeatureParent) && selectedProject ? (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <div className="text-sm font-medium">Choose existing Jira parents</div>
                  <p className="text-xs text-slate-500">
                    Parent selections are loaded from live Jira data via the parents API so the final submission can reuse the right hierarchy anchors.
                  </p>
                </div>

                {requiresEpicParent ? (
                  <ParentIssuePicker
                    title="Existing Epic"
                    description="Required for feature scopes, and still shown for story scope because the backend keeps Epic context explicit."
                    projectKey={selectedProject.jiraProjectKey}
                    query={epicParentQuery}
                    onQueryChange={setEpicParentQuery}
                    response={epicParents}
                    selectedKey={form.existingEpicKey}
                    onSelect={(key) => handleChange('existingEpicKey', key)}
                    loading={parentLoading.EPIC}
                    error={parentErrors.EPIC}
                    emptyMessage="No Epic matches were found. Try a broader search term or create the Epic in Jira first."
                    unsupportedMessage={
                      projectSupportsEpic ? undefined : 'This Jira project does not expose Epic creation/search metadata, so no Epic parent list is available.'
                    }
                  />
                ) : null}

                {requiresFeatureParent ? (
                  <ParentIssuePicker
                    title="Existing Feature"
                    description="Required for story-only scope so new stories can anchor to a real Jira Feature."
                    projectKey={selectedProject.jiraProjectKey}
                    query={featureParentQuery}
                    onQueryChange={setFeatureParentQuery}
                    response={featureParents}
                    selectedKey={form.existingFeatureKey}
                    onSelect={(key) => handleChange('existingFeatureKey', key)}
                    loading={parentLoading.FEATURE}
                    error={parentErrors.FEATURE}
                    emptyMessage="No Feature matches were found. If this project never had Feature support enabled, story-only flow will stay blocked until Jira is configured for it."
                    unsupportedMessage={
                      projectSupportsFeature
                        ? undefined
                        : 'This Jira project does not currently support Feature issues, so story-only flow cannot select a valid Feature parent here.'
                    }
                  />
                ) : null}
              </div>
            ) : null}

            <div>
              <label className="mb-1 block text-sm font-medium">Context text</label>
              <textarea
                value={form.textInput}
                onChange={(event) => handleChange('textInput', event.target.value)}
                className="min-h-40 w-full rounded-xl border border-slate-300 px-3 py-2"
                placeholder="Paste business context, target users, constraints, architecture notes, acceptance criteria, or initiative brief."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <input
                value={form.defaultStoryPoints}
                onChange={(event) => handleChange('defaultStoryPoints', event.target.value)}
                className={INPUT_CLASS}
                placeholder="Default story points"
                inputMode="numeric"
              />
              <input
                value={form.targetStartDate}
                onChange={(event) => handleChange('targetStartDate', event.target.value)}
                title="Target start date"
                placeholder="Target start date"
                className={INPUT_CLASS}
                type="date"
              />
              <input
                value={form.targetEndDate}
                onChange={(event) => handleChange('targetEndDate', event.target.value)}
                title="Target end date"
                placeholder="Target end date"
                className={INPUT_CLASS}
                type="date"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={form.labels}
                onChange={(event) => handleChange('labels', event.target.value)}
                className={INPUT_CLASS}
                placeholder="Default labels (comma separated)"
              />
              <input
                value={form.components}
                onChange={(event) => handleChange('components', event.target.value)}
                className={INPUT_CLASS}
                placeholder="Default components (comma separated)"
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileUp className="h-4 w-4" />
                Attach supporting docs
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Attached text, markdown, and JSON files are extracted before draft generation, then reused for refinement too. No LLM key? No problem—the heuristic path still uses the extracted snippets.
              </p>

              <input
                type="file"
                multiple
                accept=".txt,.md,.markdown,.json,text/plain,text/markdown,application/json"
                title="Attach supporting documents"
                onChange={(event) => {
                  setSelectedFiles(Array.from(event.target.files ?? []));
                  setExtraction(null);
                }}
                className="mt-3 block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
              />

              {selectedFiles.length ? (
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {selectedFiles.map((file) => (
                    <div key={`${file.name}-${file.size}-${file.lastModified}`} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="font-medium text-slate-800">{file.name}</div>
                      <div className="text-xs text-slate-500">
                        {formatBytes(file.size)} · {file.type || 'unknown type'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {extraction ? <AttachmentExtractionSummary extraction={extraction} /> : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 text-sm font-medium">Search Jira in {selectedProject?.jiraProjectKey ?? 'the selected project'}</div>
              <div className="flex gap-3">
                <input
                  value={form.searchQuery}
                  onChange={(event) => handleChange('searchQuery', event.target.value)}
                  className={`${INPUT_CLASS} flex-1`}
                  placeholder="Search by summary, description, or key terms"
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={busy !== null || !form.searchQuery.trim() || !selectedProject}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
                >
                  <Search className="h-4 w-4" />
                  {busy === 'search' ? 'Searching…' : 'Search'}
                </button>
              </div>
              {searchResults ? (
                <div className="mt-3 space-y-2 text-sm">
                  <div className="text-slate-500">{searchResults.total} issues matched.</div>
                  {searchResults.issues.map((issue) => (
                    <div key={issue.key} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="font-medium">{issue.key} · {issue.summary}</div>
                      <div className="text-xs text-slate-500">{issue.issueType} · {issue.status ?? 'Unknown status'}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleGenerateDraft}
                disabled={busy !== null || !form.projectId || Boolean(scopeSupportMessage)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
              >
                {busy === 'extract'
                  ? 'Extracting attachments…'
                  : busy === 'draft'
                    ? 'Generating…'
                    : 'Generate draft'}
              </button>
            </div>

            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
          </div>
        </SectionCard>

        <SectionCard title="Generated hierarchy" subtitle="Curate the draft inline, refine it with more guidance, download markdown, then submit the selected nodes to Jira.">
          {draft ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <div className="font-medium text-slate-800">Draft {draft.id}</div>
                <div>Project {draft.projectKey} · Scope {draft.scope}</div>
                <div>
                  Generation mode: {draft.generationContext.mode}
                  {draft.generationContext.fallbackReason ? ` · ${draft.generationContext.fallbackReason}` : ''}
                </div>
                <div>
                  Source files: {draft.sourceFiles.length} · Template: {draft.templateId ? `${draft.templateId} v${draft.templateVersion ?? '—'}` : 'None'}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <Sparkles className="h-4 w-4" />
                  Refine this draft
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Refinement reuses the current draft, template guidance, attached docs, and Jira context. Think: “make titles more concise”, not “summon a perfect roadmap from the void”.
                </p>
                <textarea
                  value={refineInstruction}
                  onChange={(event) => setRefineInstruction(event.target.value)}
                  className="mt-3 min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Example: tighten Epic wording, split stories by API and UI, add labels for rollout and telemetry, keep IDs and hierarchy intact."
                />
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleRefineDraft}
                    disabled={busy !== null || !refineInstruction.trim()}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    {busy === 'refine' ? 'Refining…' : 'Refine draft'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadMarkdown}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium"
                  >
                    <Download className="h-4 w-4" />
                    Download markdown
                  </button>
                </div>
              </div>

              <DraftTree
                items={draft.items}
                selectedIds={selectedIds}
                onToggle={(draftItemId) => {
                  setSelectedIds((current) =>
                    current.includes(draftItemId) ? current.filter((entry) => entry !== draftItemId) : [...current, draftItemId],
                  );
                }}
                onSaveItem={handleSaveDraftItem}
                savingItemId={savingItemId}
              />

              <button
                type="button"
                onClick={handleSubmit}
                disabled={busy !== null || selectedIds.length === 0}
                className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
              >
                {busy === 'submit' ? 'Submitting…' : `Submit ${selectedIds.length} selected item(s) to Jira`}
              </button>

              {submission ? (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                  <div className="font-medium">Submission {submission.id}</div>
                  <div>Status: {submission.status}</div>
                  {submission.links.map((link) => (
                    <div key={link.localDraftId} className="rounded-lg border border-slate-200 p-2">
                      <div className="font-medium">{link.localDraftId} · {link.jiraIssueType}</div>
                      <div>{link.status}{link.jiraKey ? ` · ${link.jiraKey}` : ''}</div>
                      {link.jiraUrl ? (
                        <a href={link.jiraUrl} target="_blank" rel="noreferrer" className="text-sky-700 underline">
                          Open in Jira
                        </a>
                      ) : null}
                      {link.errorMessage ? <div className="text-rose-700">{link.errorMessage}</div> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              Generate a draft to review the hierarchy before Jira creation.
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function ParentIssuePicker({
  title,
  description,
  projectKey,
  query,
  onQueryChange,
  response,
  selectedKey,
  onSelect,
  loading,
  error,
  emptyMessage,
  unsupportedMessage,
}: {
  title: string;
  description: string;
  projectKey: string;
  query: string;
  onQueryChange: (value: string) => void;
  response: JiraParentIssueListResponse | null;
  selectedKey: string;
  onSelect: (key: string) => void;
  loading: boolean;
  error?: string;
  emptyMessage: string;
  unsupportedMessage?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        {selectedKey ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">Selected: {selectedKey}</span> : null}
      </div>

      <div className="mt-3">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className={INPUT_CLASS}
          placeholder={`Search ${title.toLowerCase()}s in ${projectKey}`}
        />
      </div>

      {unsupportedMessage ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{unsupportedMessage}</div>
      ) : error ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
      ) : response ? (
        response.issues.length ? (
          <div className="mt-3 space-y-2">
            {response.issues.map((issue) => {
              const selected = issue.key === selectedKey;

              return (
                <button
                  key={issue.key}
                  type="button"
                  onClick={() => onSelect(issue.key)}
                  className={[
                    'w-full rounded-xl border p-3 text-left transition',
                    selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:border-slate-400',
                  ].join(' ')}
                >
                  <div className="font-medium">{issue.key} · {issue.summary}</div>
                  <div className={selected ? 'text-xs text-slate-300' : 'text-xs text-slate-500'}>
                    {issue.issueType} · {issue.status ?? 'Unknown status'}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">{emptyMessage}</div>
        )
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">
          {loading ? 'Loading available parent issues from Jira…' : 'Start typing to search existing parent issues in Jira.'}
        </div>
      )}
    </div>
  );
}

function AttachmentExtractionSummary({ extraction }: { extraction: AttachmentExtractionResponse }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
        {extraction.supportedFiles} of {extraction.totalFiles} file(s) extracted for generation context.
      </div>

      {extraction.warnings.length ? (
        <div className="space-y-2">
          {extraction.warnings.map((warning) => (
            <div key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {warning}
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        {extraction.files.map((file) => (
          <div key={file.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <div className="font-medium text-slate-800">{file.filename}</div>
            <div className="text-xs text-slate-500">
              {file.extractionStatus ?? 'UNKNOWN'} · {formatBytes(file.sizeBytes)}
            </div>
            {file.excerpt ? <p className="mt-2 text-xs text-slate-600">{file.excerpt}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function DraftTree({
  items,
  selectedIds,
  onToggle,
  onSaveItem,
  savingItemId,
}: {
  items: DraftWorkItem[];
  selectedIds: string[];
  onToggle: (draftItemId: string) => void;
  onSaveItem: (draftItemId: string, body: UpdateDraftItemRequest) => Promise<void>;
  savingItemId: string | null;
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <DraftItemEditorCard
          key={item.id}
          item={item}
          selectedIds={selectedIds}
          onToggle={onToggle}
          onSaveItem={onSaveItem}
          savingItemId={savingItemId}
        />
      ))}
    </div>
  );
}

function DraftItemEditorCard({
  item,
  selectedIds,
  onToggle,
  onSaveItem,
  savingItemId,
}: {
  item: DraftWorkItem;
  selectedIds: string[];
  onToggle: (draftItemId: string) => void;
  onSaveItem: (draftItemId: string, body: UpdateDraftItemRequest) => Promise<void>;
  savingItemId: string | null;
}) {
  const [form, setForm] = useState<DraftItemFormState>(() => toDraftItemForm(item));
  const selected = selectedIds.includes(item.id);
  const saving = savingItemId === item.id;
  const dirty = JSON.stringify(form) !== JSON.stringify(toDraftItemForm(item));

  useEffect(() => {
    setForm(toDraftItemForm(item));
  }, [item]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(item.id)}
          className="mt-1"
          title={`Select draft item ${item.title}`}
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{item.level}</span>
            <span className="text-xs text-slate-500">Draft id: {item.id}</span>
          </div>

          <input
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            className={INPUT_CLASS}
            placeholder="Title"
          />

          <textarea
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            className="min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Description"
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <input
              value={form.storyPoints}
              onChange={(event) => setForm((current) => ({ ...current, storyPoints: event.target.value }))}
              className={INPUT_CLASS}
              type="number"
              min={0}
              placeholder="Story points"
            />
            <input
              value={form.labels}
              onChange={(event) => setForm((current) => ({ ...current, labels: event.target.value }))}
              className={INPUT_CLASS}
              placeholder="Labels (comma separated)"
            />
            <input
              value={form.components}
              onChange={(event) => setForm((current) => ({ ...current, components: event.target.value }))}
              className={INPUT_CLASS}
              placeholder="Components (comma separated)"
            />
            <input
              value={form.targetStartDate}
              onChange={(event) => setForm((current) => ({ ...current, targetStartDate: event.target.value }))}
              className={INPUT_CLASS}
              type="date"
              title="Target start date"
            />
            <input
              value={form.targetEndDate}
              onChange={(event) => setForm((current) => ({ ...current, targetEndDate: event.target.value }))}
              className={INPUT_CLASS}
              type="date"
              title="Target end date"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setForm(toDraftItemForm(item))}
              disabled={!dirty || saving}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => onSaveItem(item.id, toUpdateDraftItemRequest(form))}
              disabled={!dirty || saving || !form.title.trim()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save item edits'}
            </button>
          </div>

          {item.children?.length ? (
            <div className="border-l border-slate-200 pl-4">
              <DraftTree
                items={item.children}
                selectedIds={selectedIds}
                onToggle={onToggle}
                onSaveItem={onSaveItem}
                savingItemId={savingItemId}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function toDraftItemForm(item: DraftWorkItem): DraftItemFormState {
  return {
    title: item.title,
    description: item.description ?? '',
    storyPoints: item.storyPoints === undefined ? '' : String(item.storyPoints),
    labels: (item.labels ?? []).join(', '),
    components: (item.components ?? []).join(', '),
    targetStartDate: item.targetStartDate ?? '',
    targetEndDate: item.targetEndDate ?? '',
  };
}

function toUpdateDraftItemRequest(form: DraftItemFormState): UpdateDraftItemRequest {
  return {
    title: form.title.trim(),
    description: form.description,
    storyPoints: parseNumericOrNull(form.storyPoints),
    labels: parseCsv(form.labels),
    components: parseCsv(form.components),
    targetStartDate: form.targetStartDate || null,
    targetEndDate: form.targetEndDate || null,
  };
}

function supportsScope(templates: TemplateSummary[], templateId: string, scope: DraftScope) {
  if (!templateId) {
    return true;
  }

  return templates.find((template) => template.id === templateId)?.supportedScopes.includes(scope) ?? false;
}

async function loadParentIssues({
  projectKey,
  parentLevel,
  query,
  setParentLoading,
  setParentErrors,
  setParentResults,
}: {
  projectKey: string;
  parentLevel: ParentIssueLevel;
  query: string;
  setParentLoading: Dispatch<SetStateAction<Record<ParentIssueLevel, boolean>>>;
  setParentErrors: Dispatch<SetStateAction<Partial<Record<ParentIssueLevel, string>>>>;
  setParentResults: Dispatch<SetStateAction<JiraParentIssueListResponse | null>>;
}) {
  try {
    setParentLoading((current) => ({ ...current, [parentLevel]: true }));
    setParentErrors((current) => ({ ...current, [parentLevel]: undefined }));
    const response = await listJiraParentIssues(projectKey, parentLevel, query);
    setParentResults(response);
  } catch (error) {
    setParentErrors((current) => ({
      ...current,
      [parentLevel]: error instanceof Error ? error.message : `Failed to load ${parentLevel.toLowerCase()} parents.`,
    }));
    setParentResults(null);
  } finally {
    setParentLoading((current) => ({ ...current, [parentLevel]: false }));
  }
}

function parseCsv(value: string) {
  return Array.from(new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean)));
}

function parseNumericOrNull(value: string) {
  const normalized = value.trim();
  return normalized ? Number(normalized) : null;
}

function flattenDraftIds(items: DraftWorkItem[]): string[] {
  return items.flatMap((item) => [item.id, ...(item.children ? flattenDraftIds(item.children) : [])]);
}

function syncSelectedIds(nextDraft: DraftWorkItemSet, currentSelectedIds: string[]) {
  const available = new Set(flattenDraftIds(nextDraft.items));
  return currentSelectedIds.filter((draftItemId) => available.has(draftItemId));
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toDraftMarkdown(draft: DraftWorkItemSet, selectedIds: string[]) {
  const selected = new Set(selectedIds);

  return [
    `# Draft ${draft.id}`,
    '',
    `- Project: ${draft.projectKey ?? draft.projectId}`,
    `- Scope: ${draft.scope}`,
    `- Status: ${draft.status}`,
    `- Provider: ${draft.providerName} ${draft.providerVersion}`,
    `- Generation mode: ${draft.generationContext.mode}`,
    draft.generationContext.fallbackReason ? `- Fallback reason: ${draft.generationContext.fallbackReason}` : undefined,
    draft.sourceFiles.length ? `- Source files: ${draft.sourceFiles.map((file) => file.filename).join(', ')}` : '- Source files: none',
    '',
    ...draft.items.flatMap((item) => renderDraftMarkdownItem(item, 2, selected)),
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

function renderDraftMarkdownItem(item: DraftWorkItem, depth: number, selected: Set<string>): string[] {
  const heading = `${'#'.repeat(Math.min(depth, 6))} ${selected.has(item.id) ? '[selected] ' : ''}${item.level}: ${item.title}`;
  const metadata = [
    item.description ? item.description : undefined,
    item.storyPoints !== undefined ? `- Story points: ${item.storyPoints}` : undefined,
    item.labels?.length ? `- Labels: ${item.labels.join(', ')}` : undefined,
    item.components?.length ? `- Components: ${item.components.join(', ')}` : undefined,
    item.targetStartDate ? `- Target start: ${item.targetStartDate}` : undefined,
    item.targetEndDate ? `- Target end: ${item.targetEndDate}` : undefined,
    '',
  ].filter((line): line is string => Boolean(line));

  return [heading, ...metadata, ...(item.children ?? []).flatMap((child) => renderDraftMarkdownItem(child, depth + 1, selected))];
}