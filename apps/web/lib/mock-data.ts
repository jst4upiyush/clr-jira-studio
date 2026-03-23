import type { DraftWorkItemSet, ProjectSummary, SubmissionSet, TemplateSummary } from '@jira-idea-studio/shared';

export const projects: ProjectSummary[] = [
  {
    id: 'p1',
    jiraProjectKey: 'OPS',
    name: 'Operations Platform',
    role: 'PRODUCT_OWNER',
    canCreateEpic: true,
    canCreateFeature: true,
    canCreateStory: true,
    supportedLevels: ['EPIC', 'FEATURE', 'STORY'],
  },
  {
    id: 'p2',
    jiraProjectKey: 'ENG',
    name: 'Engineering Productivity',
    role: 'ENGINEER',
    canCreateEpic: false,
    canCreateFeature: true,
    canCreateStory: true,
    supportedLevels: ['FEATURE', 'STORY'],
  },
];

export const templates: TemplateSummary[] = [
  {
    id: 't1',
    teamId: 'team-1',
    name: 'Platform Delivery Pack',
    description: 'Internal template for Epic -> Feature -> Story creation with standard naming and link rules.',
    systemContext: 'Generate Jira-ready backlog items for platform delivery work with practical implementation detail.',
    persona: 'Senior delivery manager translating initiative context into Jira hierarchy.',
    visibility: 'PUBLIC',
    status: 'PUBLISHED',
    supportedLevels: ['EPIC', 'FEATURE', 'STORY'],
    supportedScopes: ['EPIC_ONLY', 'FEATURE_ONLY', 'STORY_ONLY', 'EPIC_WITH_FEATURES', 'EPIC_WITH_FEATURES_AND_STORIES', 'FEATURE_WITH_STORIES'],
    owner: {
      userId: 'jira:template-owner',
      jiraUsername: 'template-owner',
      displayName: 'Template Owner',
    },
    version: 4,
    promptPacks: [
      {
        id: 'pp-1',
        name: 'Backlog decomposition',
        providerKind: 'SCRIPT',
        entrypoint: 'providers/backlog-decompose.ts',
        variables: ['business_context', 'constraints', 'target_users'],
      },
    ],
    requiredFields: [
      { fieldKey: 'summary', displayName: 'Summary', required: true },
      { fieldKey: 'description', displayName: 'Description', required: true },
      { fieldKey: 'priority', displayName: 'Priority', required: true, allowedValues: ['Low', 'Medium', 'High'] },
    ],
    labels: ['platform', 'generated'],
    components: ['workflow'],
    namingConvention: {
      prefix: 'OPS',
      epicPattern: '[EPIC] {{title}}',
      featurePattern: '[FEATURE] {{title}}',
      storyPattern: '[STORY] {{title}}',
    },
    issueLinkRules: [{ type: 'relates to', sourceLevel: 'FEATURE', targetLevel: 'STORY', direction: 'OUTWARD' }],
    createdAt: '2026-03-20T08:00:00Z',
    updatedAt: '2026-03-20T08:00:00Z',
  },
];

export const history: DraftWorkItemSet[] = [
  {
    id: 'd1',
    projectId: 'p1',
    createdByUserId: 'u1',
    scope: 'EPIC_WITH_FEATURES_AND_STORIES',
    status: 'SUBMITTED',
    providerName: 'server-copilot-runner',
    providerVersion: '0.1.0',
    providerKind: 'SCRIPT',
    templateId: 't1',
    templateVersion: 4,
    sourceFiles: [{ id: 'f1', filename: 'context.md', mimeType: 'text/markdown', sizeBytes: 2048 }],
    createdAt: '2026-03-20T09:00:00Z',
    updatedAt: '2026-03-20T09:00:00Z',
    generationContext: {
      mode: 'HEURISTIC',
      requestSnapshot: {
        projectId: 'p1',
        templateId: 't1',
        scope: 'EPIC_WITH_FEATURES_AND_STORIES',
        textInput: 'Enable self-service backlog creation for platform work.',
      },
      templateSnapshot: templates[0],
      refinementHistory: [],
    },
    items: [
      {
        id: 'wi-1',
        level: 'EPIC',
        title: 'Self-service backlog creation',
        children: [
          {
            id: 'wi-2',
            parentDraftId: 'wi-1',
            level: 'FEATURE',
            title: 'Project-aware template selection',
            children: [{ id: 'wi-3', parentDraftId: 'wi-2', level: 'STORY', title: 'Load project capabilities on selection' }],
          },
        ],
      },
    ],
  },
];

export const submissions: SubmissionSet[] = [
  {
    id: 's1',
    draftSetId: 'd1',
    acceptedByUserId: 'u1',
    acceptedAt: '2026-03-20T09:10:00Z',
    acceptedDraftItemIds: ['wi-1', 'wi-2', 'wi-3'],
    status: 'SUBMITTED',
    links: [
      { localDraftId: 'wi-1', jiraKey: 'OPS-101', jiraIssueType: 'Epic', jiraUrl: 'https://jira.example.com/browse/OPS-101', status: 'CREATED' },
      { localDraftId: 'wi-2', jiraKey: 'OPS-102', jiraIssueType: 'Feature', jiraUrl: 'https://jira.example.com/browse/OPS-102', status: 'CREATED' },
      { localDraftId: 'wi-3', jiraKey: 'OPS-103', jiraIssueType: 'Story', jiraUrl: 'https://jira.example.com/browse/OPS-103', status: 'CREATED' },
    ],
  },
];
