import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AcceptDraftSelection,
  CreateDraftRequest,
  DraftWorkItem,
  DraftWorkItemSet,
  SubmissionSet,
  WorkItemHistoryResponse,
} from '@jira-idea-studio/shared';
import { JiraService } from '../jira/jira.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class WorkItemsService {
  private readonly drafts = new Map<string, DraftWorkItemSet>();
  private readonly submissions: SubmissionSet[] = [];

  constructor(
    private readonly jiraService: JiraService,
    private readonly usersService: UsersService,
  ) {}

  async createDraft(request: CreateDraftRequest): Promise<DraftWorkItemSet> {
    this.validateScopeRules(request);
    const project = await this.jiraService.getProjectSummaryByIdOrKey(request.projectId);
    this.validateProjectScope(project.supportedLevels, request.scope, project.jiraProjectKey);
    const currentUserId = await this.resolveCurrentUserId();

    const now = new Date().toISOString();
    const draftId = `draft-${Date.now()}`;
    const baseTitle = this.toBaseTitle(request.textInput);
    const defaults = request.defaults;
    const createItem = (
      id: string,
      level: 'EPIC' | 'FEATURE' | 'STORY',
      title: string,
      parentDraftId?: string,
    ): DraftWorkItem => ({
      id,
      parentDraftId,
      level,
      title,
      description: request.textInput?.trim() || `${title} generated from Clr Jira Studio.`,
      storyPoints: level === 'STORY' ? defaults?.defaultStoryPoints : undefined,
      targetStartDate: defaults?.targetStartDate,
      targetEndDate: defaults?.targetEndDate,
      labels: defaults?.labels,
      components: defaults?.components,
    });

    const epic = createItem(`${draftId}-epic`, 'EPIC', `Epic: ${baseTitle}`);
    const feature = createItem(`${draftId}-feature`, 'FEATURE', `Feature: ${baseTitle}`, epic.id);
    const story = createItem(`${draftId}-story`, 'STORY', `Story: ${baseTitle}`, feature.id);
    const items = this.buildItemsForScope(request.scope, epic, feature, story);

    const draft: DraftWorkItemSet = {
      id: draftId,
      projectId: project.id,
      projectKey: project.jiraProjectKey,
      createdByUserId: currentUserId,
      scope: request.scope,
      status: 'READY_FOR_REVIEW',
      providerName: 'server-copilot-runner',
      providerVersion: '0.1.0',
      providerKind: request.providerKind ?? 'SCRIPT',
      templateId: request.templateId,
      templateVersion: 1,
      existingEpicKey: request.existingEpicKey,
      existingFeatureKey: request.existingFeatureKey,
      queryContext: request.queryContext,
      sourceFiles: request.files ?? [],
      createdAt: now,
      items,
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

  async submitDraftSelection(draftId: string, body: AcceptDraftSelection): Promise<SubmissionSet> {
    const draft = this.getDraft(draftId);
    const selection = body.draftItemIds ?? [];
    const selectedIds = new Set(selection);
    const currentUserId = await this.resolveCurrentUserId();

    if (selectedIds.size === 0) {
      throw new BadRequestException('Select at least one draft item before submission.');
    }

    const submissionId = `submission-${Date.now()}`;
    const result = await this.jiraService.createAcceptedHierarchy({
      draft,
      acceptedDraftItemIds: selection,
    });

    const submission: SubmissionSet = {
      id: submissionId,
      draftSetId: draftId,
      acceptedByUserId: currentUserId,
      acceptedAt: new Date().toISOString(),
      acceptedDraftItemIds: selection,
      status: result.status,
      links: result.links,
    };

    draft.status = result.status === 'SUBMITTED' ? 'SUBMITTED' : 'PARTIALLY_ACCEPTED';
    this.submissions.unshift(submission);

    return submission;
  }

  listHistory(): WorkItemHistoryResponse {
    return {
      drafts: Array.from(this.drafts.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      submissions: [...this.submissions],
    };
  }

  private async resolveCurrentUserId() {
    if (!this.usersService.hasUsers()) {
      await this.jiraService.syncUsersForVisibleProjects();
    }

    const currentUser = this.usersService.getCurrentUser();
    if (!currentUser) {
      throw new BadRequestException('No synced Jira user is available in the web application. Run user sync first.');
    }

    return currentUser.id;
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

  private validateProjectScope(supportedLevels: string[], scope: CreateDraftRequest['scope'], projectKey: string) {
    const requiredLevelsByScope: Record<CreateDraftRequest['scope'], Array<'EPIC' | 'FEATURE' | 'STORY'>> = {
      EPIC_ONLY: ['EPIC'],
      EPIC_WITH_FEATURES: ['EPIC', 'FEATURE'],
      EPIC_WITH_FEATURES_AND_STORIES: ['EPIC', 'FEATURE', 'STORY'],
      FEATURE_ONLY: ['FEATURE'],
      FEATURE_WITH_STORIES: ['FEATURE', 'STORY'],
      STORY_ONLY: ['STORY'],
    };

    const missingLevels = requiredLevelsByScope[scope].filter((level) => !supportedLevels.includes(level));
    if (missingLevels.length > 0) {
      throw new BadRequestException(
        `Project '${projectKey}' does not support required Jira issue types for scope '${scope}': ${missingLevels.join(', ')}.`,
      );
    }
  }

  private toBaseTitle(textInput?: string) {
    const normalized = textInput?.trim().split(/\r?\n/).find((line) => line.trim().length > 0)?.trim();
    if (!normalized) {
      return 'Generated backlog item';
    }

    return normalized.slice(0, 80);
  }

  private buildItemsForScope(
    scope: CreateDraftRequest['scope'],
    epic: DraftWorkItem,
    feature: DraftWorkItem,
    story: DraftWorkItem,
  ): DraftWorkItem[] {
    if (scope === 'EPIC_ONLY') {
      return [epic];
    }

    if (scope === 'EPIC_WITH_FEATURES') {
      return [{ ...epic, children: [{ ...feature }] }];
    }

    if (scope === 'EPIC_WITH_FEATURES_AND_STORIES') {
      return [{ ...epic, children: [{ ...feature, children: [{ ...story }] }] }];
    }

    if (scope === 'FEATURE_ONLY') {
      return [{ ...feature, parentDraftId: undefined }];
    }

    if (scope === 'FEATURE_WITH_STORIES') {
      return [{ ...feature, parentDraftId: undefined, children: [{ ...story }] }];
    }

    return [{ ...story, parentDraftId: undefined }];
  }
}
