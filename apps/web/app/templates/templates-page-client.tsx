'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import type {
  CreateTemplateRequest,
  DraftScope,
  TemplateStatus,
  TemplateSummary,
  TemplateVisibility,
} from '@jira-idea-studio/shared';
import { Plus, Trash2 } from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import { createTemplate, deleteTemplate, updateTemplate } from '@/lib/api';
import { deriveLevelsFromScopes, DRAFT_SCOPE_DETAILS } from '@/lib/draft-scopes';

type TemplatesPageClientProps = {
  initialTemplates: TemplateSummary[];
  currentUserId?: string;
  currentUserDisplayName?: string;
};

type TemplateFormState = {
  name: string;
  description: string;
  systemContext: string;
  persona: string;
  visibility: TemplateVisibility;
  status: TemplateStatus;
  supportedScopes: DraftScope[];
  labels: string;
  components: string;
};

const INPUT_CLASS = 'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm';
const TEXTAREA_CLASS = 'min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm';
const EMPTY_FORM: TemplateFormState = {
  name: '',
  description: '',
  systemContext: '',
  persona: '',
  visibility: 'TEAM',
  status: 'DRAFT',
  supportedScopes: ['EPIC_WITH_FEATURES_AND_STORIES'],
  labels: '',
  components: '',
};

export function TemplatesPageClient({ initialTemplates, currentUserId, currentUserDisplayName }: TemplatesPageClientProps) {
  const [templates, setTemplates] = useState<TemplateSummary[]>(() => sortTemplates(initialTemplates));
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialTemplates[0]?.id ?? null);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>(initialTemplates.length ? 'edit' : 'create');
  const [form, setForm] = useState<TemplateFormState>(() => toFormState(initialTemplates[0]));
  const [busy, setBusy] = useState<'create' | 'update' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );
  const isOwnedByCurrentUser = Boolean(selectedTemplate && currentUserId && selectedTemplate.owner.userId === currentUserId);
  const canCreateOrEdit = Boolean(currentUserId);
  const isReadOnly = editorMode === 'edit' && !isOwnedByCurrentUser;
  const derivedLevels = useMemo(() => deriveLevelsFromScopes(form.supportedScopes), [form.supportedScopes]);

  const openTemplate = (template: TemplateSummary) => {
    setSelectedTemplateId(template.id);
    setEditorMode('edit');
    setForm(toFormState(template));
    setError(null);
    setNotice(null);
  };

  const startNewTemplate = () => {
    setSelectedTemplateId(null);
    setEditorMode('create');
    setForm(EMPTY_FORM);
    setError(null);
    setNotice(null);
  };

  const handleFieldChange = <K extends keyof TemplateFormState>(key: K, value: TemplateFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleScopeToggle = (scope: DraftScope) => {
    setForm((current) => {
      const supportedScopes = current.supportedScopes.includes(scope)
        ? current.supportedScopes.filter((entry) => entry !== scope)
        : [...current.supportedScopes, scope];

      return {
        ...current,
        supportedScopes,
      };
    });
  };

  const handleSave = async () => {
    if (!canCreateOrEdit) {
      setError('Template create/edit requires a synced Jira-backed app user.');
      return;
    }

    if (!form.name.trim()) {
      setError('Template name is required.');
      return;
    }

    if (!form.supportedScopes.length) {
      setError('Select at least one supported scope.');
      return;
    }

    const payload: CreateTemplateRequest = {
      name: form.name.trim(),
      description: normalizeOptionalString(form.description),
      systemContext: normalizeOptionalString(form.systemContext),
      persona: normalizeOptionalString(form.persona),
      visibility: form.visibility,
      status: form.status,
      supportedScopes: form.supportedScopes,
      supportedLevels: derivedLevels,
      labels: parseCsv(form.labels),
      components: parseCsv(form.components),
    };

    try {
      setBusy(editorMode === 'create' ? 'create' : 'update');
      setError(null);
      setNotice(null);

      const saved = editorMode === 'create' || !selectedTemplate ? await createTemplate(payload) : await updateTemplate(selectedTemplate.id, payload);

      setTemplates((current) => sortTemplates(upsertTemplate(current, saved)));
      setSelectedTemplateId(saved.id);
      setEditorMode('edit');
      setForm(toFormState(saved));
      setNotice(editorMode === 'create' ? 'Template created.' : 'Template updated.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save template.');
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate || !isOwnedByCurrentUser) {
      return;
    }

    if (!window.confirm(`Delete template \"${selectedTemplate.name}\"?`)) {
      return;
    }

    try {
      setBusy('delete');
      setError(null);
      setNotice(null);
      await deleteTemplate(selectedTemplate.id);
      const remainingTemplates = templates.filter((template) => template.id !== selectedTemplate.id);
      setTemplates(sortTemplates(remainingTemplates));
      startNewTemplate();
      setNotice('Template deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete template.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Templates</h1>
          <p className="text-slate-600">
            Create reusable guidance packs for draft generation. Public or shared templates can still guide the LLM path, while heuristic fallback keeps the lights on when no model is configured.
          </p>
        </div>
        <button
          type="button"
          onClick={startNewTemplate}
          disabled={!canCreateOrEdit || busy !== null}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          New template
        </button>
      </header>

      {!canCreateOrEdit ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          A synced Jira-backed user is required before template create/edit/delete becomes available. Listing still works, but the sharp objects stay locked away.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Available templates" subtitle="Ownership is enforced server-side, and shown here so nobody accidentally edits the boss’s template.">
          <div className="space-y-3">
            {templates.map((template) => {
              const owned = Boolean(currentUserId && template.owner.userId === currentUserId);
              const active = template.id === selectedTemplateId && editorMode === 'edit';

              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => openTemplate(template)}
                  className={[
                    'w-full rounded-2xl border p-4 text-left transition',
                    active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:border-slate-400',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{template.name}</div>
                      <div className={active ? 'text-sm text-slate-300' : 'text-sm text-slate-500'}>
                        v{template.version} · {template.visibility} · {template.status}
                      </div>
                    </div>
                    <span
                      className={[
                        'rounded-full px-2.5 py-1 text-xs font-medium',
                        active
                          ? 'bg-white/10 text-white'
                          : owned
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-600',
                      ].join(' ')}
                    >
                      {owned ? 'You own this' : 'Read only'}
                    </span>
                  </div>
                  {template.description ? (
                    <p className={active ? 'mt-3 text-sm text-slate-200' : 'mt-3 text-sm text-slate-600'}>{template.description}</p>
                  ) : null}
                  <div className={active ? 'mt-3 text-xs text-slate-300' : 'mt-3 text-xs text-slate-500'}>
                    Owner: {template.owner.displayName}
                  </div>
                  <div className={active ? 'mt-2 text-xs text-slate-300' : 'mt-2 text-xs text-slate-500'}>
                    Scopes: {template.supportedScopes.join(', ')}
                  </div>
                </button>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard
          title={editorMode === 'create' ? 'Create template' : selectedTemplate?.name ?? 'Template details'}
          subtitle={
            editorMode === 'create'
              ? `Owner will be set to ${currentUserDisplayName ?? 'the current synced user'} when saved.`
              : isOwnedByCurrentUser
                ? 'Update the fields below, then save a new version.'
                : 'Viewing a template you do not own. Edit/delete actions stay disabled.'
          }
        >
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Name</label>
                <input
                  value={form.name}
                  onChange={(event) => handleFieldChange('name', event.target.value)}
                  disabled={isReadOnly || busy !== null}
                  className={INPUT_CLASS}
                  placeholder="Platform delivery starter"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Visibility</label>
                <select
                  value={form.visibility}
                  onChange={(event) => handleFieldChange('visibility', event.target.value as TemplateVisibility)}
                  disabled={isReadOnly || busy !== null}
                  className={INPUT_CLASS}
                  title="Visibility"
                >
                  <option value="TEAM">TEAM</option>
                  <option value="PUBLIC">PUBLIC</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Description</label>
                <textarea
                  value={form.description}
                  onChange={(event) => handleFieldChange('description', event.target.value)}
                  disabled={isReadOnly || busy !== null}
                  className={TEXTAREA_CLASS}
                  placeholder="When to use this template and what it optimizes for."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Persona</label>
                <textarea
                  value={form.persona}
                  onChange={(event) => handleFieldChange('persona', event.target.value)}
                  disabled={isReadOnly || busy !== null}
                  className={TEXTAREA_CLASS}
                  placeholder="Platform PM, tech lead, delivery manager..."
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">System context</label>
              <textarea
                value={form.systemContext}
                onChange={(event) => handleFieldChange('systemContext', event.target.value)}
                disabled={isReadOnly || busy !== null}
                className="min-h-36 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                placeholder="High-level rules for how generated Jira items should be structured, named, and constrained."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Status</label>
                <select
                  value={form.status}
                  onChange={(event) => handleFieldChange('status', event.target.value as TemplateStatus)}
                  disabled={isReadOnly || busy !== null}
                  className={INPUT_CLASS}
                  title="Status"
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="PUBLISHED">PUBLISHED</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Derived levels</label>
                <div className="flex min-h-11 flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {derivedLevels.length ? derivedLevels.map((level) => <Badge key={level}>{level}</Badge>) : <span>Select at least one scope.</span>}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium">Supported scopes</label>
                <span className="text-xs text-slate-500">Used to validate which hierarchy shapes this template can generate.</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {DRAFT_SCOPE_DETAILS.map((scope) => {
                  const checked = form.supportedScopes.includes(scope.value);
                  return (
                    <label
                      key={scope.value}
                      className={[
                        'flex gap-3 rounded-2xl border p-4 text-sm',
                        checked ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white',
                        isReadOnly || busy !== null ? 'opacity-80' : 'cursor-pointer hover:border-slate-400',
                      ].join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleScopeToggle(scope.value)}
                        disabled={isReadOnly || busy !== null}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">{scope.label}</div>
                        <div className={checked ? 'mt-1 text-xs text-slate-300' : 'mt-1 text-xs text-slate-500'}>{scope.creates}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Labels</label>
                <input
                  value={form.labels}
                  onChange={(event) => handleFieldChange('labels', event.target.value)}
                  disabled={isReadOnly || busy !== null}
                  className={INPUT_CLASS}
                  placeholder="platform, ai-assisted"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Components</label>
                <input
                  value={form.components}
                  onChange={(event) => handleFieldChange('components', event.target.value)}
                  disabled={isReadOnly || busy !== null}
                  className={INPUT_CLASS}
                  placeholder="workflow, jira-sync"
                />
              </div>
            </div>

            {(error || notice) ? (
              <div className="space-y-2">
                {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
                {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div> : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {!isReadOnly ? (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={busy !== null || !canCreateOrEdit}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {busy === 'create' ? 'Creating…' : busy === 'update' ? 'Saving…' : editorMode === 'create' ? 'Create template' : 'Save changes'}
                </button>
              ) : null}

              {editorMode === 'edit' && isOwnedByCurrentUser ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  {busy === 'delete' ? 'Deleting…' : 'Delete template'}
                </button>
              ) : null}
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm">{children}</span>;
}

function toFormState(template?: TemplateSummary | null): TemplateFormState {
  if (!template) {
    return EMPTY_FORM;
  }

  return {
    name: template.name,
    description: template.description ?? '',
    systemContext: template.systemContext ?? '',
    persona: template.persona ?? '',
    visibility: template.visibility,
    status: template.status,
    supportedScopes: template.supportedScopes,
    labels: template.labels.join(', '),
    components: template.components.join(', '),
  };
}

function upsertTemplate(templates: TemplateSummary[], nextTemplate: TemplateSummary) {
  const withoutCurrent = templates.filter((template) => template.id !== nextTemplate.id);
  return [...withoutCurrent, nextTemplate];
}

function sortTemplates(templates: TemplateSummary[]) {
  return [...templates].sort((left, right) => {
    if (left.isSeeded !== right.isSeeded) {
      return left.isSeeded ? -1 : 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt) || left.name.localeCompare(right.name);
  });
}

function parseCsv(value: string) {
  return Array.from(new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean)));
}

function normalizeOptionalString(value: string) {
  const normalized = value.trim();
  return normalized || undefined;
}
