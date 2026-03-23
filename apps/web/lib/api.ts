import type {
  AcceptDraftSelection,
  AppUsersResponse,
  AttachmentExtractionResponse,
  AuthSessionResponse,
  CreateTemplateRequest,
  CreateDraftRequest,
  DraftWorkItemSet,
  JiraIntegrationStatus,
  JiraIssueSearchResponse,
  JiraParentIssueListResponse,
  JiraUserSyncResponse,
  ParentIssueLevel,
  ProjectSummary,
  RefineDraftRequest,
  SubmissionSet,
  TemplateSummary,
  UpdateDraftItemRequest,
  UpdateTemplateRequest,
  WorkItemHistoryResponse,
} from '@jira-idea-studio/shared';

const DEFAULT_API_BASE_URL = 'http://localhost:4000/api';

function getApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;

  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: init?.cache ?? 'no-store',
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const errorBody = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
      const message = Array.isArray(errorBody?.message)
        ? errorBody.message.join('; ')
        : typeof errorBody?.message === 'string'
          ? errorBody.message
          : undefined;

      throw new Error(message || `API request failed: ${response.status}`);
    }

    throw new Error((await response.text()) || `API request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return (await response.text()) as T;
  }

  return (await response.json()) as T;
}

export function getProjects() {
  return apiFetch<ProjectSummary[]>('/jira/projects');
}

export function getJiraStatus() {
  return apiFetch<JiraIntegrationStatus>('/jira/status');
}

export function getSyncedUsers() {
  return apiFetch<JiraUserSyncResponse>('/jira/users/sync');
}

export function getAppUsers() {
  return apiFetch<AppUsersResponse>('/users');
}

export function getSession() {
  return apiFetch<AuthSessionResponse>('/auth/session');
}

export function getTemplates() {
  return apiFetch<TemplateSummary[]>('/templates');
}

export function createTemplate(body: CreateTemplateRequest) {
  return apiFetch<TemplateSummary>('/templates', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateTemplate(templateId: string, body: UpdateTemplateRequest) {
  return apiFetch<TemplateSummary>(`/templates/${encodeURIComponent(templateId)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteTemplate(templateId: string) {
  return apiFetch<{ deletedTemplateId: string; deleted: true }>(`/templates/${encodeURIComponent(templateId)}`, {
    method: 'DELETE',
  });
}

export function searchJiraIssues(projectKey: string, query: string) {
  const params = new URLSearchParams({ projectKey, query });
  return apiFetch<JiraIssueSearchResponse>(`/jira/search?${params.toString()}`);
}

export function listJiraParentIssues(projectKey: string, parentLevel: ParentIssueLevel, query?: string) {
  const params = new URLSearchParams({ projectKey, parentLevel });

  if (query?.trim()) {
    params.set('query', query.trim());
  }

  return apiFetch<JiraParentIssueListResponse>(`/jira/parents?${params.toString()}`);
}

export function extractAttachments(files: File[]) {
  const body = new FormData();
  files.forEach((file) => body.append('files', file));

  return apiFetch<AttachmentExtractionResponse>('/ingestion/extract', {
    method: 'POST',
    body,
  });
}

export function createDraft(request: CreateDraftRequest) {
  return apiFetch<DraftWorkItemSet>('/work-items/drafts', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export function updateDraftItem(draftId: string, draftItemId: string, body: UpdateDraftItemRequest) {
  return apiFetch<DraftWorkItemSet>(`/work-items/drafts/${encodeURIComponent(draftId)}/items/${encodeURIComponent(draftItemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function refineDraft(draftId: string, body: RefineDraftRequest) {
  return apiFetch<DraftWorkItemSet>(`/work-items/drafts/${encodeURIComponent(draftId)}/refine`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function submitDraft(draftId: string, body: AcceptDraftSelection) {
  return apiFetch<SubmissionSet>(`/work-items/drafts/${encodeURIComponent(draftId)}/submit`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getHistory() {
  return apiFetch<WorkItemHistoryResponse>('/work-items/history');
}