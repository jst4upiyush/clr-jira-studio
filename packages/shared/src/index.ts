export type WorkItemLevel = 'EPIC' | 'FEATURE' | 'STORY';
export type TemplateVisibility = 'TEAM' | 'PUBLIC';
export type TemplateStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type DraftScope =
  | 'EPIC_ONLY'
  | 'FEATURE_ONLY'
  | 'STORY_ONLY'
  | 'EPIC_WITH_FEATURES'
  | 'EPIC_WITH_FEATURES_AND_STORIES'
  | 'FEATURE_WITH_STORIES';
export type DraftStatus = 'DRAFT' | 'READY_FOR_REVIEW' | 'PARTIALLY_ACCEPTED' | 'SUBMITTED';
export type SubmissionStatus = 'PENDING' | 'SUBMITTED' | 'PARTIAL_FAILURE' | 'FAILED';
export type ProviderKind = 'INSTRUCTIONS' | 'AGENT' | 'SKILL' | 'HOOK' | 'SCRIPT';
export type ProjectRole = 'ADMIN' | 'PRODUCT_OWNER' | 'ENGINEER' | 'VIEWER';
export type ParentIssueLevel = 'EPIC' | 'FEATURE';
export type FileExtractionStatus = 'PENDING' | 'EXTRACTED' | 'UNSUPPORTED' | 'FAILED';
export type DraftGenerationMode = 'LLM' | 'HEURISTIC';

export interface ProjectSummary {
  id: string;
  jiraProjectKey: string;
  name: string;
  role: ProjectRole;
  canCreateEpic: boolean;
  canCreateFeature: boolean;
  canCreateStory: boolean;
  supportedLevels: WorkItemLevel[];
}

export interface NamingConventionRule {
  prefix?: string;
  epicPattern?: string;
  featurePattern?: string;
  storyPattern?: string;
}

export interface IssueLinkRule {
  type: string;
  sourceLevel: WorkItemLevel;
  targetLevel: WorkItemLevel;
  direction: 'OUTWARD' | 'INWARD';
}

export interface RequiredJiraField {
  fieldKey: string;
  displayName: string;
  required: boolean;
  allowedValues?: string[];
}

export interface PromptPack {
  id: string;
  name: string;
  description?: string;
  providerKind: ProviderKind;
  entrypoint: string;
  variables: string[];
}

export interface TemplateOwnerSummary {
  userId: string;
  jiraUsername?: string;
  displayName: string;
}

export interface TemplateSummary {
  id: string;
  teamId: string;
  name: string;
  description?: string;
  systemContext?: string;
  persona?: string;
  visibility: TemplateVisibility;
  status: TemplateStatus;
  supportedLevels: WorkItemLevel[];
  supportedScopes: DraftScope[];
  owner: TemplateOwnerSummary;
  version: number;
  promptPacks: PromptPack[];
  requiredFields: RequiredJiraField[];
  labels: string[];
  components: string[];
  namingConvention?: NamingConventionRule;
  issueLinkRules: IssueLinkRule[];
  isSeeded?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateRequest {
  name: string;
  description?: string;
  systemContext?: string;
  persona?: string;
  visibility: TemplateVisibility;
  status: TemplateStatus;
  supportedLevels: WorkItemLevel[];
  supportedScopes: DraftScope[];
  labels?: string[];
  components?: string[];
}

export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  systemContext?: string;
  persona?: string;
  visibility?: TemplateVisibility;
  status?: TemplateStatus;
  supportedLevels?: WorkItemLevel[];
  supportedScopes?: DraftScope[];
  labels?: string[];
  components?: string[];
}

export interface DeleteTemplateResponse {
  deletedTemplateId: string;
  deleted: true;
}

export interface CreationDefaults {
  defaultStoryPoints?: number;
  targetStartDate?: string;
  targetEndDate?: string;
  labels?: string[];
  components?: string[];
}

export interface FileDescriptor {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey?: string;
  extractionStatus?: FileExtractionStatus;
  extractedText?: string;
  excerpt?: string;
  warning?: string;
}

export interface AttachmentExtractionResponse {
  totalFiles: number;
  supportedFiles: number;
  warnings: string[];
  files: FileDescriptor[];
}

export interface DraftQueryContext {
  query?: string;
  matchedIssueKeys?: string[];
  matchedIssues?: JiraIssueSearchResult[];
  note?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface JiraIssueSearchResult {
  key: string;
  projectKey: string;
  summary: string;
  issueType: string;
  status?: string;
  url: string;
}

export interface JiraIssueSearchResponse {
  projectKey?: string;
  query?: string;
  jql: string;
  total: number;
  issues: JiraIssueSearchResult[];
}

export interface JiraParentIssueOption extends JiraIssueSearchResult {
  parentLevel: ParentIssueLevel;
}

export interface JiraParentIssueListResponse {
  projectKey: string;
  parentLevel: ParentIssueLevel;
  query?: string;
  jql: string;
  total: number;
  issues: JiraParentIssueOption[];
}

export interface JiraRoleUserSummary {
  username: string;
  displayName: string;
}

export interface JiraProjectRoleSummary {
  roleName: string;
  users: JiraRoleUserSummary[];
}

export interface JiraProjectUserSyncSummary {
  projectKey: string;
  projectName?: string;
  roleCount: number;
  uniqueUserCount: number;
  roles: JiraProjectRoleSummary[];
}

export interface JiraUserSyncResponse {
  generatedAt: string;
  projectCount: number;
  totalUniqueUsers: number;
  projects: JiraProjectUserSyncSummary[];
}

export interface AppUserSummary {
  id: string;
  jiraUsername: string;
  displayName: string;
  email?: string;
  projectKeys: string[];
  roleNames: string[];
  lastSyncedAt: string;
}

export interface AppUsersResponse {
  generatedAt?: string;
  totalUsers: number;
  users: AppUserSummary[];
}

export interface JiraIntegrationStatus {
  configured: boolean;
  baseUrl?: string;
  defaultUser?: string;
  missingVariables: string[];
  message: string;
}

export interface AuthSessionResponse {
  user?: AppUserSummary;
  authMode: 'jira-sync' | 'local-dev';
  syncedUserCount: number;
  lastSyncedAt?: string;
  message?: string;
}

export interface CreateDraftRequest {
  projectId: string;
  templateId?: string;
  scope: DraftScope;
  textInput?: string;
  existingEpicKey?: string;
  existingFeatureKey?: string;
  queryContext?: DraftQueryContext;
  defaults?: CreationDefaults;
  files?: FileDescriptor[];
  providerKind?: ProviderKind;
}

export interface UpdateDraftItemRequest {
  title?: string;
  description?: string;
  storyPoints?: number | null;
  targetStartDate?: string | null;
  targetEndDate?: string | null;
  labels?: string[];
  components?: string[];
}

export interface RefineDraftRequest {
  instruction: string;
}

export interface DraftWorkItem {
  id: string;
  parentDraftId?: string;
  level: WorkItemLevel;
  title: string;
  description?: string;
  storyPoints?: number;
  targetStartDate?: string;
  targetEndDate?: string;
  labels?: string[];
  components?: string[];
  requiredFields?: Record<string, string | number | boolean>;
  children?: DraftWorkItem[];
}

export interface DraftRefinementRecord {
  at: string;
  instruction: string;
  mode: DraftGenerationMode;
  fallbackReason?: string;
}

export interface DraftGenerationContext {
  mode: DraftGenerationMode;
  fallbackReason?: string;
  requestSnapshot: CreateDraftRequest;
  templateSnapshot?: TemplateSummary;
  refinementHistory: DraftRefinementRecord[];
}

export interface DraftWorkItemSet {
  id: string;
  projectId: string;
  projectKey?: string;
  createdByUserId: string;
  scope: DraftScope;
  status: DraftStatus;
  items: DraftWorkItem[];
  providerName: string;
  providerVersion: string;
  providerKind: ProviderKind;
  templateId?: string;
  templateVersion?: number;
  existingEpicKey?: string;
  existingFeatureKey?: string;
  queryContext?: DraftQueryContext;
  sourceFiles: FileDescriptor[];
  createdAt: string;
  updatedAt: string;
  generationContext: DraftGenerationContext;
}

export interface AcceptDraftSelection {
  draftItemIds: string[];
}

export interface SubmittedWorkItemLink {
  localDraftId: string;
  jiraKey?: string;
  jiraIssueType: string;
  jiraUrl?: string;
  status: 'CREATED' | 'FAILED' | 'SKIPPED';
  errorMessage?: string;
}

export interface SubmissionSet {
  id: string;
  draftSetId: string;
  acceptedByUserId: string;
  acceptedAt: string;
  acceptedDraftItemIds: string[];
  status: SubmissionStatus;
  links: SubmittedWorkItemLink[];
}

export interface WorkItemHistoryResponse {
  drafts: DraftWorkItemSet[];
  submissions: SubmissionSet[];
}
