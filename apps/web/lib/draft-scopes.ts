import type { DraftScope, WorkItemLevel } from '@jira-idea-studio/shared';

export const REQUIRED_LEVELS_BY_SCOPE: Record<DraftScope, WorkItemLevel[]> = {
  EPIC_ONLY: ['EPIC'],
  EPIC_WITH_FEATURES: ['EPIC', 'FEATURE'],
  EPIC_WITH_FEATURES_AND_STORIES: ['EPIC', 'FEATURE', 'STORY'],
  FEATURE_ONLY: ['FEATURE'],
  FEATURE_WITH_STORIES: ['FEATURE', 'STORY'],
  STORY_ONLY: ['STORY'],
};

export const DRAFT_SCOPE_DETAILS: Array<{
  value: DraftScope;
  label: string;
  description: string;
  creates: string;
}> = [
  {
    value: 'EPIC_ONLY',
    label: 'Epic only',
    description: 'Create a single Epic from your brief, template guidance, and optional attachments.',
    creates: 'Creates one Epic in Jira.',
  },
  {
    value: 'EPIC_WITH_FEATURES_AND_STORIES',
    label: 'Epic + Features + Stories',
    description: 'Generate a full hierarchy when the project supports all three issue levels.',
    creates: 'Creates an Epic with child Features and Stories.',
  },
  {
    value: 'EPIC_WITH_FEATURES',
    label: 'Epic + Features',
    description: 'Start the hierarchy at the Epic level and stop one rung before stories.',
    creates: 'Creates an Epic with child Features.',
  },
  {
    value: 'FEATURE_ONLY',
    label: 'Feature only',
    description: 'Add a new Feature beneath an existing Epic.',
    creates: 'Creates a Feature under the selected Epic.',
  },
  {
    value: 'FEATURE_WITH_STORIES',
    label: 'Feature + Stories',
    description: 'Break a new Feature into stories while attaching it to an existing Epic.',
    creates: 'Creates a Feature and child Stories under the selected Epic.',
  },
  {
    value: 'STORY_ONLY',
    label: 'Story only',
    description: 'Draft one or more Stories for an existing Feature while preserving Epic context.',
    creates: 'Creates Stories under the selected Feature and Epic.',
  },
];

export const DRAFT_SCOPES = DRAFT_SCOPE_DETAILS.map((detail) => detail.value);

export function getDraftScopeDetail(scope: DraftScope) {
  return DRAFT_SCOPE_DETAILS.find((detail) => detail.value === scope) ?? DRAFT_SCOPE_DETAILS[0];
}

export function deriveLevelsFromScopes(scopes: DraftScope[]) {
  return Array.from(new Set(scopes.flatMap((scope) => REQUIRED_LEVELS_BY_SCOPE[scope] ?? [])));
}

export function scopeRequiresExistingEpic(scope: DraftScope) {
  return scope === 'FEATURE_ONLY' || scope === 'FEATURE_WITH_STORIES' || scope === 'STORY_ONLY';
}

export function scopeRequiresExistingFeature(scope: DraftScope) {
  return scope === 'STORY_ONLY';
}
