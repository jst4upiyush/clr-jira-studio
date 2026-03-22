'use client';

import { useMemo, useState } from 'react';
import type {
  DraftScope,
  DraftWorkItem,
  DraftWorkItemSet,
  JiraIssueSearchResponse,
  ProjectSummary,
  SubmissionSet,
  TemplateSummary,
} from '@jira-idea-studio/shared';
import { SectionCard } from '@/components/section-card';
import { createDraft, searchJiraIssues, submitDraft } from '@/lib/api';

const scopes: DraftScope[] = [
  'EPIC_ONLY',
  'EPIC_WITH_FEATURES_AND_STORIES',
  'EPIC_WITH_FEATURES',
  'FEATURE_ONLY',
  'FEATURE_WITH_STORIES',
  'STORY_ONLY',
];

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
  const [busy, setBusy] = useState<'search' | 'draft' | 'submit' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => initialProjects.find((project) => project.id === form.projectId),
    [form.projectId, initialProjects],
  );

  const scopeHints = useMemo(() => {
    if (form.scope === 'FEATURE_ONLY' || form.scope === 'FEATURE_WITH_STORIES') {
      return 'This scope requires an existing Epic key.';
    }

    if (form.scope === 'STORY_ONLY') {
      return 'This scope requires both an existing Epic key and an existing Feature key.';
    }

    return 'New hierarchy roots will be created in Jira when you submit accepted items.';
  }, [form.scope]);

  const handleChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
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
    try {
      setBusy('draft');
      setError(null);
      setSubmission(null);
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
        files: [],
      });
      setDraft(nextDraft);
      setSelectedIds(flattenDraftIds(nextDraft.items));
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : 'Failed to generate draft.');
    } finally {
      setBusy(null);
    }
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
          Generate a draft, search live Jira context, and submit accepted items to Jira when the hierarchy looks right.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <SectionCard title="Draft generation request" subtitle="Uses live Jira projects and validates scope-specific parent requirements.">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Project</label>
                <select
                  value={form.projectId}
                  onChange={(event) => handleChange('projectId', event.target.value)}
                  title="Project"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  {initialProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} ({project.jiraProjectKey})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Template</label>
                <select
                  value={form.templateId}
                  onChange={(event) => handleChange('templateId', event.target.value)}
                  title="Template"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="">No template</option>
                  {initialTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} v{template.version}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Scope</label>
              <select
                value={form.scope}
                onChange={(event) => handleChange('scope', event.target.value as DraftScope)}
                title="Scope"
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              >
                {scopes.map((scope) => (
                  <option key={scope}>{scope}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">{scopeHints}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={form.existingEpicKey}
                onChange={(event) => handleChange('existingEpicKey', event.target.value.toUpperCase())}
                className="rounded-xl border border-slate-300 px-3 py-2"
                placeholder="Existing Epic key (required for feature/story scopes)"
              />
              <input
                value={form.existingFeatureKey}
                onChange={(event) => handleChange('existingFeatureKey', event.target.value.toUpperCase())}
                className="rounded-xl border border-slate-300 px-3 py-2"
                placeholder="Existing Feature key (required for STORY_ONLY)"
              />
            </div>

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
                className="rounded-xl border border-slate-300 px-3 py-2"
                placeholder="Default story points"
              />
              <input
                value={form.targetStartDate}
                onChange={(event) => handleChange('targetStartDate', event.target.value)}
                title="Target start date"
                placeholder="Target start date"
                className="rounded-xl border border-slate-300 px-3 py-2"
                type="date"
              />
              <input
                value={form.targetEndDate}
                onChange={(event) => handleChange('targetEndDate', event.target.value)}
                title="Target end date"
                placeholder="Target end date"
                className="rounded-xl border border-slate-300 px-3 py-2"
                type="date"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={form.labels}
                onChange={(event) => handleChange('labels', event.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2"
                placeholder="Default labels (comma separated)"
              />
              <input
                value={form.components}
                onChange={(event) => handleChange('components', event.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2"
                placeholder="Default components (comma separated)"
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 text-sm font-medium">Search Jira in {selectedProject?.jiraProjectKey ?? 'the selected project'}</div>
              <div className="flex gap-3">
                <input
                  value={form.searchQuery}
                  onChange={(event) => handleChange('searchQuery', event.target.value)}
                  className="flex-1 rounded-xl border border-slate-300 px-3 py-2"
                  placeholder="Search by summary, description, or key terms"
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={busy !== null || !form.searchQuery.trim() || !selectedProject}
                  className="rounded-xl border border-slate-300 px-4 py-2 disabled:opacity-50"
                >
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
                disabled={busy !== null || !form.projectId}
                className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
              >
                {busy === 'draft' ? 'Generating…' : 'Generate draft'}
              </button>
            </div>

            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
          </div>
        </SectionCard>

        <SectionCard title="Generated hierarchy" subtitle="Select the draft nodes you want to create in Jira.">
          {draft ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Draft {draft.id} · Project {draft.projectKey} · Scope {draft.scope}
              </div>
              <DraftTree items={draft.items} selectedIds={selectedIds} onToggle={setSelectedIds} />
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

function DraftTree({
  items,
  selectedIds,
  onToggle,
}: {
  items: DraftWorkItem[];
  selectedIds: string[];
  onToggle: (next: string[]) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const checked = selectedIds.includes(item.id);
        return (
          <div key={item.id} className="rounded-xl border border-slate-200 p-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  onToggle(checked ? selectedIds.filter((id) => id !== item.id) : [...selectedIds, item.id]);
                }}
                className="mt-1"
              />
              <div>
                <div className="font-medium">{item.level} · {item.title}</div>
                {item.description ? <div className="text-sm text-slate-500">{item.description}</div> : null}
                {item.children?.length ? (
                  <div className="mt-3 border-l border-slate-200 pl-4">
                    <DraftTree items={item.children} selectedIds={selectedIds} onToggle={onToggle} />
                  </div>
                ) : null}
              </div>
            </label>
          </div>
        );
      })}
    </div>
  );
}

function parseCsv(value: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function flattenDraftIds(items: DraftWorkItem[]): string[] {
  return items.flatMap((item) => [item.id, ...(item.children ? flattenDraftIds(item.children) : [])]);
}