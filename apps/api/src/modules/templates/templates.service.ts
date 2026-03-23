import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AppUserSummary,
  CreateTemplateRequest,
  DeleteTemplateResponse,
  DraftScope,
  TemplateStatus,
  TemplateSummary,
  TemplateVisibility,
  UpdateTemplateRequest,
  WorkItemLevel,
} from '@jira-idea-studio/shared';
import { JiraService } from '../jira/jira.service';
import { UsersService } from '../users/users.service';

const VALID_LEVELS: WorkItemLevel[] = ['EPIC', 'FEATURE', 'STORY'];
const VALID_SCOPES: DraftScope[] = [
  'EPIC_ONLY',
  'FEATURE_ONLY',
  'STORY_ONLY',
  'EPIC_WITH_FEATURES',
  'EPIC_WITH_FEATURES_AND_STORIES',
  'FEATURE_WITH_STORIES',
];
const VALID_VISIBILITIES: TemplateVisibility[] = ['TEAM', 'PUBLIC'];
const VALID_STATUSES: TemplateStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
const REQUIRED_LEVELS_BY_SCOPE: Record<DraftScope, WorkItemLevel[]> = {
  EPIC_ONLY: ['EPIC'],
  EPIC_WITH_FEATURES: ['EPIC', 'FEATURE'],
  EPIC_WITH_FEATURES_AND_STORIES: ['EPIC', 'FEATURE', 'STORY'],
  FEATURE_ONLY: ['FEATURE'],
  FEATURE_WITH_STORIES: ['FEATURE', 'STORY'],
  STORY_ONLY: ['STORY'],
};
const SEEDED_TEMPLATE_ID = 'template-seeded-platform-delivery';

@Injectable()
export class TemplatesService {
  private readonly templates = new Map<string, TemplateSummary>();

  constructor(
    private readonly jiraService: JiraService,
    private readonly usersService: UsersService,
  ) {
    this.ensureSeededTemplate();
  }

  listTemplates(): TemplateSummary[] {
    this.ensureSeededTemplate();

    return Array.from(this.templates.values()).sort((left, right) => {
      if (left.isSeeded !== right.isSeeded) {
        return left.isSeeded ? -1 : 1;
      }

      return right.updatedAt.localeCompare(left.updatedAt) || left.name.localeCompare(right.name);
    });
  }

  getTemplate(templateId: string): TemplateSummary {
    return this.getTemplateOrThrow(templateId);
  }

  async createTemplate(body: CreateTemplateRequest): Promise<TemplateSummary> {
    const owner = await this.resolveCurrentUser();
    const now = new Date().toISOString();
    const normalized = this.normalizeTemplatePayload(body);

    const template: TemplateSummary = {
      id: `template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      teamId: owner.projectKeys[0] ?? 'jira-shared',
      name: normalized.name,
      description: normalized.description,
      systemContext: normalized.systemContext,
      persona: normalized.persona,
      visibility: normalized.visibility,
      status: normalized.status,
      supportedLevels: normalized.supportedLevels,
      supportedScopes: normalized.supportedScopes,
      owner: this.toTemplateOwner(owner),
      version: 1,
      promptPacks: [],
      requiredFields: [],
      labels: normalized.labels,
      components: normalized.components,
      issueLinkRules: [],
      createdAt: now,
      updatedAt: now,
    };

    this.templates.set(template.id, template);
    return template;
  }

  async updateTemplate(templateId: string, body: UpdateTemplateRequest): Promise<TemplateSummary> {
    const existing = this.getTemplateOrThrow(templateId);
    const currentUser = await this.resolveCurrentUser();
    this.assertOwner(existing, currentUser.id);

    const normalized = this.normalizeTemplatePayload(body, existing);
    const updated: TemplateSummary = {
      ...existing,
      name: normalized.name,
      description: normalized.description,
      systemContext: normalized.systemContext,
      persona: normalized.persona,
      visibility: normalized.visibility,
      status: normalized.status,
      supportedLevels: normalized.supportedLevels,
      supportedScopes: normalized.supportedScopes,
      labels: normalized.labels,
      components: normalized.components,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    this.templates.set(updated.id, updated);
    return updated;
  }

  async deleteTemplate(templateId: string): Promise<DeleteTemplateResponse> {
    const existing = this.getTemplateOrThrow(templateId);
    const currentUser = await this.resolveCurrentUser();
    this.assertOwner(existing, currentUser.id);

    this.templates.delete(templateId);
    this.ensureSeededTemplate();

    return {
      deletedTemplateId: templateId,
      deleted: true,
    };
  }

  private ensureSeededTemplate() {
    if (this.templates.has(SEEDED_TEMPLATE_ID)) {
      return;
    }

    const now = new Date().toISOString();
    this.templates.set(SEEDED_TEMPLATE_ID, {
      id: SEEDED_TEMPLATE_ID,
      teamId: 'seeded-team',
      name: 'Platform Epic Pack',
      description: 'Epic -> feature -> story decomposition template for Jira-backed platform delivery work.',
      systemContext: 'Generate concise Jira work items that preserve hierarchy, implementation intent, and delivery constraints.',
      persona: 'Platform delivery lead turning discovery notes into a reviewable Jira hierarchy.',
      visibility: 'PUBLIC',
      status: 'PUBLISHED',
      supportedLevels: ['EPIC', 'FEATURE', 'STORY'],
      supportedScopes: ['EPIC_ONLY', 'FEATURE_ONLY', 'STORY_ONLY', 'EPIC_WITH_FEATURES', 'EPIC_WITH_FEATURES_AND_STORIES', 'FEATURE_WITH_STORIES'],
      owner: {
        userId: 'jira:seeded-template-owner',
        jiraUsername: 'seeded-template-owner',
        displayName: 'ClrSlate Seeded Template',
      },
      version: 1,
      promptPacks: [],
      requiredFields: [],
      labels: ['platform', 'generated'],
      components: ['workflow'],
      issueLinkRules: [],
      isSeeded: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  private getTemplateOrThrow(templateId: string): TemplateSummary {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new NotFoundException(`Template '${templateId}' was not found.`);
    }

    return template;
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

  private assertOwner(template: TemplateSummary, userId: string) {
    if (template.owner.userId !== userId) {
      throw new ForbiddenException(`Only the template owner can modify template '${template.id}'.`);
    }
  }

  private toTemplateOwner(user: AppUserSummary): TemplateSummary['owner'] {
    return {
      userId: user.id,
      jiraUsername: user.jiraUsername,
      displayName: user.displayName,
    };
  }

  private normalizeTemplatePayload(
    body: CreateTemplateRequest | UpdateTemplateRequest,
    existing?: TemplateSummary,
  ): {
    name: string;
    description?: string;
    systemContext?: string;
    persona?: string;
    visibility: TemplateVisibility;
    status: TemplateStatus;
    supportedLevels: WorkItemLevel[];
    supportedScopes: DraftScope[];
    labels: string[];
    components: string[];
  } {
    const name = this.resolveRequiredString(body, 'name', existing?.name);
    const visibility = this.resolveEnumValue(body, 'visibility', VALID_VISIBILITIES, existing?.visibility);
    const status = this.resolveEnumValue(body, 'status', VALID_STATUSES, existing?.status);
    const supportedLevels = this.resolveEnumArray(body, 'supportedLevels', VALID_LEVELS, existing?.supportedLevels);
    const supportedScopes = this.resolveEnumArray(body, 'supportedScopes', VALID_SCOPES, existing?.supportedScopes);
    const labels = this.resolveStringArray(body, 'labels', existing?.labels ?? []);
    const components = this.resolveStringArray(body, 'components', existing?.components ?? []);

    for (const scope of supportedScopes) {
      const missingLevels = REQUIRED_LEVELS_BY_SCOPE[scope].filter((level) => !supportedLevels.includes(level));
      if (missingLevels.length > 0) {
        throw new BadRequestException(
          `supportedScopes includes '${scope}' but supportedLevels is missing ${missingLevels.join(', ')}.`,
        );
      }
    }

    return {
      name,
      description: this.resolveOptionalString(body, 'description', existing?.description),
      systemContext: this.resolveOptionalString(body, 'systemContext', existing?.systemContext),
      persona: this.resolveOptionalString(body, 'persona', existing?.persona),
      visibility,
      status,
      supportedLevels,
      supportedScopes,
      labels,
      components,
    };
  }

  private resolveRequiredString<T extends object>(body: T, key: keyof T, existing?: string) {
    const value = this.resolveOptionalString(body, key, existing);
    if (!value) {
      throw new BadRequestException(`${String(key)} is required.`);
    }

    return value;
  }

  private resolveOptionalString<T extends object>(body: T, key: keyof T, existing?: string) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) {
      return existing;
    }

    const rawValue = body[key];
    if (rawValue === undefined || rawValue === null) {
      return undefined;
    }

    if (typeof rawValue !== 'string') {
      throw new BadRequestException(`${String(key)} must be a string.`);
    }

    const normalized = rawValue.trim();
    return normalized || undefined;
  }

  private resolveEnumValue<T extends string, TBody extends object>(
    body: TBody,
    key: keyof TBody,
    allowedValues: T[],
    existing?: T,
  ): T {
    if (!Object.prototype.hasOwnProperty.call(body, key)) {
      if (existing) {
        return existing;
      }

      throw new BadRequestException(`${String(key)} is required.`);
    }

    const rawValue = body[key];
    if (typeof rawValue !== 'string' || !allowedValues.includes(rawValue as T)) {
      throw new BadRequestException(`${String(key)} must be one of ${allowedValues.join(', ')}.`);
    }

    return rawValue as T;
  }

  private resolveEnumArray<T extends string, TBody extends object>(
    body: TBody,
    key: keyof TBody,
    allowedValues: T[],
    existing?: T[],
  ): T[] {
    if (!Object.prototype.hasOwnProperty.call(body, key)) {
      if (existing?.length) {
        return [...existing];
      }

      throw new BadRequestException(`${String(key)} is required.`);
    }

    const rawValue = body[key];
    if (!Array.isArray(rawValue) || rawValue.length === 0) {
      throw new BadRequestException(`${String(key)} must be a non-empty array.`);
    }

    const normalized = Array.from(new Set(rawValue.map((entry) => String(entry).trim()).filter(Boolean)));
    const invalidEntries = normalized.filter((entry) => !allowedValues.includes(entry as T));
    if (invalidEntries.length > 0) {
      throw new BadRequestException(`${String(key)} contains unsupported values: ${invalidEntries.join(', ')}.`);
    }

    return normalized as T[];
  }

  private resolveStringArray<TBody extends object>(body: TBody, key: keyof TBody, existing: string[]) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) {
      return [...existing];
    }

    const rawValue = body[key];
    if (rawValue === undefined || rawValue === null) {
      return [];
    }

    if (!Array.isArray(rawValue)) {
      throw new BadRequestException(`${String(key)} must be an array of strings.`);
    }

    return Array.from(new Set(rawValue.map((entry) => String(entry).trim()).filter(Boolean)));
  }
}
