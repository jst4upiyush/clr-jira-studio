import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AcceptDraftSelection,
  AppUserSummary,
  CreateDraftRequest,
  DraftWorkItem,
  DraftWorkItemSet,
  DraftScope,
  RefineDraftRequest,
  SubmissionSet,
  UpdateDraftItemRequest,
  WorkItemLevel,
  WorkItemHistoryResponse,
} from '@jira-idea-studio/shared';
import { JiraService } from '../jira/jira.service';
import { TemplatesService } from '../templates/templates.service';
import { UsersService } from '../users/users.service';
import { DraftGenerationService } from './draft-generation.service';

const VALID_SCOPES: DraftScope[] = [
  'EPIC_ONLY',
  'FEATURE_ONLY',
  'STORY_ONLY',
  'EPIC_WITH_FEATURES',
  'EPIC_WITH_FEATURES_AND_STORIES',
  'FEATURE_WITH_STORIES',
];
const REQUIRED_LEVELS_BY_SCOPE: Record<DraftScope, WorkItemLevel[]> = {
  EPIC_ONLY: ['EPIC'],
  EPIC_WITH_FEATURES: ['EPIC', 'FEATURE'],
  EPIC_WITH_FEATURES_AND_STORIES: ['EPIC', 'FEATURE', 'STORY'],
  FEATURE_ONLY: ['FEATURE'],
  FEATURE_WITH_STORIES: ['FEATURE', 'STORY'],
  STORY_ONLY: ['STORY'],
};

@Injectable()
export class WorkItemsService {
  private readonly drafts = new Map<string, DraftWorkItemSet>();
  private readonly submissions: SubmissionSet[] = [];

  constructor(
    private readonly jiraService: JiraService,
    private readonly usersService: UsersService,
    private readonly templatesService: TemplatesService,
    private readonly draftGenerationService: DraftGenerationService,
  ) {}

  async createDraft(request: CreateDraftRequest): Promise<DraftWorkItemSet> {
    const normalizedRequest = this.normalizeCreateDraftRequest(request);
    this.validateScopeRules(normalizedRequest);
    const project = await this.jiraService.getProjectSummaryByIdOrKey(normalizedRequest.projectId);
    this.validateProjectScope(project.supportedLevels, normalizedRequest.scope, project.jiraProjectKey);
    const currentUser = await this.resolveCurrentUser();
    const template = normalizedRequest.templateId ? this.templatesService.getTemplate(normalizedRequest.templateId) : undefined;
    this.validateTemplateCompatibility(template, normalizedRequest.scope);

    const now = new Date().toISOString();
    const draftId = `draft-${Date.now()}`;
    const generatedDraft = await this.draftGenerationService.generateDraft({
      draftId,
      project,
      request: normalizedRequest,
      template,
    });

    const draft: DraftWorkItemSet = {
      id: draftId,
      projectId: project.id,
      projectKey: project.jiraProjectKey,
      createdByUserId: currentUser.id,
      scope: normalizedRequest.scope,
      status: 'READY_FOR_REVIEW',
      providerName: generatedDraft.providerName,
      providerVersion: generatedDraft.providerVersion,
      providerKind: generatedDraft.providerKind,
      templateId: template?.id,
      templateVersion: template?.version,
      existingEpicKey: normalizedRequest.existingEpicKey,
      existingFeatureKey: normalizedRequest.existingFeatureKey,
      queryContext: normalizedRequest.queryContext,
      sourceFiles: normalizedRequest.files ?? [],
      createdAt: now,
      updatedAt: now,
      generationContext: generatedDraft.generationContext,
      items: generatedDraft.items,
    };

    this.drafts.set(draft.id, draft);

    return draft;
  }

  getDraft(draftId: string): DraftWorkItemSet {
    const draft = this.drafts.get(draftId);
    if (!draft) {
      throw new NotFoundException(`Draft '${draftId}' was not found.`);
    }

    return draft;
  }

  async updateDraftItem(
    draftId: string,
    draftItemId: string,
    body: UpdateDraftItemRequest,
  ): Promise<DraftWorkItemSet> {
    const draft = this.getDraft(draftId);
    this.assertDraftMutable(draft);

    const draftItem = this.findDraftItemById(draft.items, draftItemId);
    if (!draftItem) {
      throw new NotFoundException(`Draft item '${draftItemId}' was not found in draft '${draftId}'.`);
    }

    if (Object.keys(body ?? {}).length === 0) {
      throw new BadRequestException('Provide at least one draft field to update.');
    }

    if (Object.prototype.hasOwnProperty.call(body, 'title')) {
      if (typeof body.title !== 'string' || !body.title.trim()) {
        throw new BadRequestException('title must be a non-empty string when provided.');
      }

      draftItem.title = body.title.trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'description')) {
      if (body.description === undefined || body.description === null || body.description === '') {
        draftItem.description = undefined;
      } else if (typeof body.description !== 'string') {
        throw new BadRequestException('description must be a string when provided.');
      } else {
        draftItem.description = body.description.trim();
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'storyPoints')) {
      if (body.storyPoints === null || body.storyPoints === undefined) {
        draftItem.storyPoints = undefined;
      } else if (!Number.isFinite(body.storyPoints) || body.storyPoints < 0) {
        throw new BadRequestException('storyPoints must be a non-negative number when provided.');
      } else {
        draftItem.storyPoints = body.storyPoints;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'labels')) {
      draftItem.labels = this.normalizeStringArray(body.labels, 'labels');
    }

    if (Object.prototype.hasOwnProperty.call(body, 'components')) {
      draftItem.components = this.normalizeStringArray(body.components, 'components');
    }

    if (Object.prototype.hasOwnProperty.call(body, 'targetStartDate')) {
      draftItem.targetStartDate = this.normalizeOptionalDate(body.targetStartDate, 'targetStartDate');
    }

    if (Object.prototype.hasOwnProperty.call(body, 'targetEndDate')) {
      draftItem.targetEndDate = this.normalizeOptionalDate(body.targetEndDate, 'targetEndDate');
    }

    draft.status = 'READY_FOR_REVIEW';
    draft.updatedAt = new Date().toISOString();

    return draft;
  }

  async refineDraft(draftId: string, body: RefineDraftRequest): Promise<DraftWorkItemSet> {
    const draft = this.getDraft(draftId);
    this.assertDraftMutable(draft);

    const instruction = body?.instruction?.trim();
    if (!instruction) {
      throw new BadRequestException('instruction is required.');
    }

    const project = await this.jiraService.getProjectSummaryByIdOrKey(draft.projectId);
    const template = draft.generationContext.templateSnapshot ?? (draft.templateId ? this.templatesService.getTemplate(draft.templateId) : undefined);
    const generatedDraft = await this.draftGenerationService.generateDraft({
      draftId: draft.id,
      project,
      request: draft.generationContext.requestSnapshot,
      template,
      previousGenerationContext: draft.generationContext,
      refinementInstruction: instruction,
      currentItems: draft.items,
    });

    draft.items = generatedDraft.items;
    draft.providerName = generatedDraft.providerName;
    draft.providerVersion = generatedDraft.providerVersion;
    draft.providerKind = generatedDraft.providerKind;
    draft.generationContext = generatedDraft.generationContext;
    draft.templateVersion = template?.version ?? draft.templateVersion;
    draft.status = 'READY_FOR_REVIEW';
    draft.updatedAt = new Date().toISOString();

    return draft;
  }

  async submitDraftSelection(draftId: string, body: AcceptDraftSelection): Promise<SubmissionSet> {
    const draft = this.getDraft(draftId);
    const selection = Array.from(new Set(body.draftItemIds ?? []));
    const selectedIds = new Set(selection);
    const currentUser = await this.resolveCurrentUser();

    if (selectedIds.size === 0) {
      throw new BadRequestException('Select at least one draft item before submission.');
    }

    const availableDraftIds = new Set(this.flattenDraftIds(draft.items));
    const unknownSelection = selection.filter((draftItemId) => !availableDraftIds.has(draftItemId));
    if (unknownSelection.length > 0) {
      throw new BadRequestException(`Unknown draft item ids: ${unknownSelection.join(', ')}.`);
    }

    const submissionId = `submission-${Date.now()}`;
    const result = await this.jiraService.createAcceptedHierarchy({
      draft,
      acceptedDraftItemIds: selection,
    });

    const submission: SubmissionSet = {
      id: submissionId,
      draftSetId: draftId,
      acceptedByUserId: currentUser.id,
      acceptedAt: new Date().toISOString(),
      acceptedDraftItemIds: selection,
      status: result.status,
      links: result.links,
    };

    draft.status = result.status === 'SUBMITTED' ? 'SUBMITTED' : 'PARTIALLY_ACCEPTED';
    draft.updatedAt = new Date().toISOString();
    this.submissions.unshift(submission);

    return submission;
  }

  listHistory(): WorkItemHistoryResponse {
    return {
      drafts: Array.from(this.drafts.values()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      submissions: [...this.submissions],
    };
  }

  private async resolveCurrentUser(): Promise<AppUserSummary> {
    if (!this.usersService.hasUsers()) {
      await this.jiraService.syncUsersForVisibleProjects();
    }

    const currentUser = this.usersService.getCurrentUser();
    if (!currentUser) {
      throw new BadRequestException(
        this.jiraService.isConfigured()
          ? 'No synced Jira user is available in the web application. Verify JIRA_DEFAULT_USER is visible to the configured Jira PAT, then retry.'
          : this.jiraService.getIntegrationStatus().message,
      );
    }

    return currentUser;
  }

  private validateScopeRules(request: CreateDraftRequest) {
    if (['FEATURE_ONLY', 'FEATURE_WITH_STORIES'].includes(request.scope) && !request.existingEpicKey?.trim()) {
      throw new BadRequestException(`Scope '${request.scope}' requires existingEpicKey.`);
    }

    if (request.scope === 'STORY_ONLY') {
      if (!request.existingEpicKey?.trim()) {
        throw new BadRequestException(`Scope 'STORY_ONLY' requires existingEpicKey.`);
      }

      if (!request.existingFeatureKey?.trim()) {
        throw new BadRequestException(`Scope 'STORY_ONLY' requires existingFeatureKey.`);
      }
    }
  }

  private validateProjectScope(supportedLevels: string[], scope: DraftScope, projectKey: string) {
    const missingLevels = REQUIRED_LEVELS_BY_SCOPE[scope].filter((level) => !supportedLevels.includes(level));
    if (missingLevels.length > 0) {
      throw new BadRequestException(
        `Project '${projectKey}' does not support required Jira issue types for scope '${scope}': ${missingLevels.join(', ')}.`,
      );
    }
  }

  private validateTemplateCompatibility(template: ReturnType<TemplatesService['getTemplate']> | undefined, scope: DraftScope) {
    if (!template) {
      return;
    }

    if (!template.supportedScopes.includes(scope)) {
      throw new BadRequestException(`Template '${template.id}' does not support scope '${scope}'.`);
    }

    const missingLevels = REQUIRED_LEVELS_BY_SCOPE[scope].filter((level) => !template.supportedLevels.includes(level));
    if (missingLevels.length > 0) {
      throw new BadRequestException(
        `Template '${template.id}' is missing supportedLevels required for scope '${scope}': ${missingLevels.join(', ')}.`,
      );
    }
  }

  private normalizeCreateDraftRequest(request: CreateDraftRequest): CreateDraftRequest {
    const projectId = this.normalizeOptionalString(request.projectId, 'projectId');
    if (!projectId) {
      throw new BadRequestException('projectId is required.');
    }

    if (!VALID_SCOPES.includes(request.scope)) {
      throw new BadRequestException(`scope must be one of ${VALID_SCOPES.join(', ')}.`);
    }

    const defaultStoryPoints = request.defaults?.defaultStoryPoints;
    if (defaultStoryPoints !== undefined && (!Number.isFinite(defaultStoryPoints) || defaultStoryPoints < 0)) {
      throw new BadRequestException('defaults.defaultStoryPoints must be a non-negative number when provided.');
    }

    return {
      ...request,
      projectId,
      scope: request.scope,
      templateId: this.normalizeOptionalString(request.templateId, 'templateId'),
      textInput: this.normalizeOptionalString(request.textInput, 'textInput'),
      existingEpicKey: this.normalizeOptionalString(request.existingEpicKey, 'existingEpicKey')?.toUpperCase(),
      existingFeatureKey: this.normalizeOptionalString(request.existingFeatureKey, 'existingFeatureKey')?.toUpperCase(),
      queryContext: request.queryContext
        ? {
            query: this.normalizeOptionalString(request.queryContext.query, 'queryContext.query'),
            matchedIssueKeys: request.queryContext.matchedIssueKeys
              ? Array.from(new Set(request.queryContext.matchedIssueKeys.map((value) => String(value).trim()).filter(Boolean)))
              : undefined,
            matchedIssues: request.queryContext.matchedIssues,
            note: this.normalizeOptionalString(request.queryContext.note, 'queryContext.note'),
          }
        : undefined,
      defaults: request.defaults
        ? {
            defaultStoryPoints,
            targetStartDate: this.normalizeOptionalDate(request.defaults.targetStartDate, 'defaults.targetStartDate'),
            targetEndDate: this.normalizeOptionalDate(request.defaults.targetEndDate, 'defaults.targetEndDate'),
            labels: this.normalizeStringArray(request.defaults.labels, 'defaults.labels'),
            components: this.normalizeStringArray(request.defaults.components, 'defaults.components'),
          }
        : undefined,
      files: (request.files ?? []).map((file, index) => ({
        ...file,
        id: this.normalizeOptionalString(file.id, `files[${index}].id`) || `draft-file-${Date.now()}-${index + 1}`,
        filename: this.normalizeOptionalString(file.filename, `files[${index}].filename`) || `attachment-${index + 1}`,
        mimeType: this.normalizeOptionalString(file.mimeType, `files[${index}].mimeType`) || 'text/plain',
      })),
    };
  }

  private assertDraftMutable(draft: DraftWorkItemSet) {
    if (draft.status === 'SUBMITTED') {
      throw new BadRequestException(`Draft '${draft.id}' has already been submitted and can no longer be edited.`);
    }
  }

  private findDraftItemById(items: DraftWorkItem[], draftItemId: string): DraftWorkItem | undefined {
    for (const item of items) {
      if (item.id === draftItemId) {
        return item;
      }

      const child = item.children ? this.findDraftItemById(item.children, draftItemId) : undefined;
      if (child) {
        return child;
      }
    }

    return undefined;
  }

  private flattenDraftIds(items: DraftWorkItem[]): string[] {
    return items.flatMap((item) => [item.id, ...(item.children ? this.flattenDraftIds(item.children) : [])]);
  }

  private normalizeStringArray(value: string[] | undefined, fieldName: string) {
    if (value === undefined) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} must be an array of strings.`);
    }

    return Array.from(new Set(value.map((entry) => String(entry).trim()).filter(Boolean)));
  }

  private normalizeOptionalDate(value: string | null | undefined, fieldName: string) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${fieldName} must use YYYY-MM-DD format when provided.`);
    }

    return value;
  }

  private normalizeOptionalString(value: unknown, fieldName: string) {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} must be a string when provided.`);
    }

    const normalized = value.trim();
    return normalized || undefined;
  }
}
