import type {
  AcceptDraftSelection,
  AppUsersResponse,
  AuthSessionResponse,
  CreateDraftRequest,
  DraftWorkItemSet,
  JiraIssueSearchResponse,
  JiraUserSyncResponse,
  ProjectSummary,
  SubmissionSet,
  TemplateSummary,
  WorkItemHistoryResponse,
} from '@jira-idea-studio/shared';

const DEFAULT_API_BASE_URL = 'http://localhost:4000/api';

function getApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
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

  return (await response.json()) as T;
}

export function getProjects() {
  return apiFetch<ProjectSummary[]>('/jira/projects');
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

export function searchJiraIssues(projectKey: string, query: string) {
  const params = new URLSearchParams({ projectKey, query });
  return apiFetch<JiraIssueSearchResponse>(`/jira/search?${params.toString()}`);
}

export function createDraft(request: CreateDraftRequest) {
  return apiFetch<DraftWorkItemSet>('/work-items/drafts', {
    method: 'POST',
    body: JSON.stringify(request),
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