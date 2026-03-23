import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  DraftWorkItem,
  DraftWorkItemSet,
  JiraIntegrationStatus,
  JiraParentIssueListResponse,
  JiraIssueSearchResponse,
  JiraIssueSearchResult,
  JiraProjectRoleSummary,
  JiraProjectUserSyncSummary,
  JiraRoleUserSummary,
  JiraUserSyncResponse,
  ParentIssueLevel,
  ProjectRole,
  ProjectSummary,
  SubmissionStatus,
  SubmittedWorkItemLink,
} from '@jira-idea-studio/shared';
import { UsersService } from '../users/users.service';

type JiraProject = {
  id?: string | number;
  key: string;
  name: string;
};

type JiraRoleActor = {
  name?: string;
  displayName?: string;
  key?: string;
  emailAddress?: string;
  actorUser?: {
    name?: string;
    displayName?: string;
    key?: string;
    emailAddress?: string;
  };
};

type JiraRoleActorsResponse = {
  name?: string;
  actors?: JiraRoleActor[];
};

type JiraFieldMeta = {
  name?: string;
  required?: boolean;
};

type JiraIssueTypeMeta = {
  id: string;
  name: string;
  fields?: Record<string, JiraFieldMeta>;
};

type JiraCreateMetaResponse = {
  values?: JiraIssueTypeMeta[];
};

type JiraCreateMetaFieldEntry = {
  fieldId: string;
  name?: string;
  required?: boolean;
};

type JiraCreateMetaFieldResponse = {
  values?: JiraCreateMetaFieldEntry[];
};

type JiraIssueReference = {
  key: string;
  fields?: {
    project?: { key?: string };
    summary?: string;
    issuetype?: { name?: string };
  };
};

type JiraIssueLinkTypeResponse = {
  issueLinkTypes?: Array<{
    id?: string;
    name?: string;
    inward?: string;
    outward?: string;
  }>;
};

type JiraCreatedIssue = {
  id?: string;
  key: string;
  self?: string;
};

type CreateHierarchyResult = {
  links: SubmittedWorkItemLink[];
  status: SubmissionStatus;
};

type ProjectContext = {
  project: JiraProject;
  roleMap: Record<string, string>;
};

type CreateHierarchyMetadata = {
  issueTypes: Partial<Record<'EPIC' | 'FEATURE' | 'STORY', JiraIssueTypeMeta>>;
  epicLinkFieldKeyByLevel: Partial<Record<'FEATURE' | 'STORY', string>>;
  linkTypeName?: string;
};

const GENERATED_LABEL = 'clrslate-ai-genrated';

@Injectable()
export class JiraService {
  constructor(private readonly usersService: UsersService) {}

  getIntegrationStatus(): JiraIntegrationStatus {
    const baseUrl = process.env.JIRA_BASE_URL?.trim();
    const defaultUser = process.env.JIRA_DEFAULT_USER?.trim();
    const missingVariables = [
      !baseUrl ? 'JIRA_BASE_URL' : undefined,
      !process.env.JIRA_PAT?.trim() ? 'JIRA_PAT' : undefined,
      !defaultUser ? 'JIRA_DEFAULT_USER' : undefined,
    ].filter((value): value is string => Boolean(value));

    return {
      configured: missingVariables.length === 0,
      baseUrl: baseUrl?.replace(/\/+$/, ''),
      defaultUser,
      missingVariables,
      message:
        missingVariables.length === 0
          ? 'Jira integration is configured.'
          : `Jira integration is not configured. Add ${missingVariables.join(', ')} to the root .env file and restart the API.`,
    };
  }

  isConfigured() {
    return this.getIntegrationStatus().configured;
  }

  async listProjectSummaries(): Promise<ProjectSummary[]> {
    const contexts = await this.getVisibleProjectContexts();

    return Promise.all(
      contexts.map(async ({ project, roleMap }) => {
        const supportedLevels = await this.getSupportedLevels(project.key);
        const role = await this.resolveProjectRole(roleMap);

        return {
          id: String(project.id ?? project.key),
          jiraProjectKey: project.key,
          name: project.name,
          role,
          canCreateEpic: supportedLevels.includes('EPIC') && this.canCreate(role, 'EPIC'),
          canCreateFeature: supportedLevels.includes('FEATURE') && this.canCreate(role, 'FEATURE'),
          canCreateStory: supportedLevels.includes('STORY') && this.canCreate(role, 'STORY'),
          supportedLevels,
        } satisfies ProjectSummary;
      }),
    );
  }

  async syncUsersForVisibleProjects(): Promise<JiraUserSyncResponse> {
    if (!this.isConfigured()) {
      this.usersService.clear();
      return this.createEmptyUserSyncResponse();
    }

    const contexts = await this.getVisibleProjectContexts();
    const projects: JiraProjectUserSyncSummary[] = [];
    const allUsers = new Set<string>();

    for (const { project, roleMap } of contexts) {
      const roles: JiraProjectRoleSummary[] = [];
      const projectUsers = new Map<string, JiraRoleUserSummary>();

      for (const [roleName, roleUrl] of Object.entries(roleMap)) {
        const details = await this.fetchJson<JiraRoleActorsResponse>(roleUrl);
        const users = (details.actors ?? [])
          .map((actor) => this.toRoleUser(actor))
          .filter((actor): actor is JiraRoleUserSummary => actor !== null);

        for (const user of users) {
          projectUsers.set(user.username, user);
          allUsers.add(user.username);
        }

        roles.push({ roleName, users });
      }

      projects.push({
        projectKey: project.key,
        projectName: project.name,
        roleCount: roles.length,
        uniqueUserCount: projectUsers.size,
        roles,
      });
    }

    const response = {
      generatedAt: new Date().toISOString(),
      projectCount: projects.length,
      totalUniqueUsers: allUsers.size,
      projects,
    } satisfies JiraUserSyncResponse;

    this.usersService.replaceFromJiraSync(response);

    return response;
  }

  async searchIssues(projectKey?: string, query?: string): Promise<JiraIssueSearchResponse> {
    const normalizedProjectKey = projectKey?.trim();
    const normalizedQuery = query?.trim();

    if (!normalizedProjectKey) {
      throw new BadRequestException('projectKey is required.');
    }

    if (!normalizedQuery) {
      return {
        projectKey: normalizedProjectKey,
        query: '',
        jql: `project = ${normalizedProjectKey}`,
        total: 0,
        issues: [],
      };
    }

    const escapedQuery = normalizedQuery.replace(/"/g, '\\"');
    const jql = `project = ${normalizedProjectKey} AND text ~ "${escapedQuery}" ORDER BY updated DESC`;
    try {
      const result = await this.fetchIssueSearchResults(normalizedProjectKey, jql, 15);

      return {
        projectKey: normalizedProjectKey,
        query: normalizedQuery,
        jql,
        total: result.total,
        issues: result.issues,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new BadGatewayException('Failed to search Jira issues. Please verify the Jira connection and try again.');
    }
  }

  async listParentIssues(
    projectKey?: string,
    parentLevel?: ParentIssueLevel,
    query?: string,
  ): Promise<JiraParentIssueListResponse> {
    const normalizedProjectKey = projectKey?.trim();
    if (!normalizedProjectKey) {
      throw new BadRequestException('projectKey is required.');
    }

    const normalizedParentLevel = this.normalizeParentIssueLevel(parentLevel);
    const project = await this.getProjectSummaryByIdOrKey(normalizedProjectKey);
    if (!project.supportedLevels.includes(normalizedParentLevel)) {
      throw new BadRequestException(
        `Project '${project.jiraProjectKey}' does not support parent level '${normalizedParentLevel}'.`,
      );
    }

    const normalizedQuery = query?.trim();
    const issueTypeName = this.toJiraIssueTypeName(normalizedParentLevel);
    const clauses = [`project = ${project.jiraProjectKey}`, `issuetype = "${issueTypeName}"`];

    if (normalizedQuery) {
      clauses.push(`text ~ "${normalizedQuery.replace(/"/g, '\\"')}"`);
    }

    const jql = `${clauses.join(' AND ')} ORDER BY updated DESC`;

    try {
      const result = await this.fetchIssueSearchResults(project.jiraProjectKey, jql, 25);
      return {
        projectKey: project.jiraProjectKey,
        parentLevel: normalizedParentLevel,
        query: normalizedQuery,
        jql,
        total: result.total,
        issues: result.issues.map((issue) => ({
          ...issue,
          parentLevel: normalizedParentLevel,
        })),
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new BadGatewayException('Failed to list Jira parent issues. Please verify the Jira connection and try again.');
    }
  }

  async getProjectSummaryByIdOrKey(projectIdOrKey: string): Promise<ProjectSummary> {
    const projects = await this.listProjectSummaries();
    const project = projects.find(
      (entry) => entry.id === projectIdOrKey || entry.jiraProjectKey.toLowerCase() === projectIdOrKey.toLowerCase(),
    );

    if (!project) {
      throw new NotFoundException(`Unknown Jira project '${projectIdOrKey}'.`);
    }

    return project;
  }

  async ensureIssueKeyInProject(issueKey: string, projectKey: string): Promise<JiraIssueReference> {
    const issue = await this.fetchJson<JiraIssueReference>(
      `${this.getBaseUrl()}/rest/api/2/issue/${encodeURIComponent(issueKey)}?fields=project,summary,issuetype`,
    );

    const actualProjectKey = issue.fields?.project?.key;
    if (!actualProjectKey) {
      throw new BadRequestException(`Issue '${issueKey}' did not return a project key.`);
    }

    if (actualProjectKey !== projectKey) {
      throw new BadRequestException(
        `Issue '${issueKey}' belongs to project '${actualProjectKey}', but '${projectKey}' is required.`,
      );
    }

    return issue;
  }

  async createAcceptedHierarchy(args: {
    draft: DraftWorkItemSet;
    acceptedDraftItemIds: string[];
  }): Promise<CreateHierarchyResult> {
    const acceptedIds = new Set(args.acceptedDraftItemIds);
    const selectedItems = this.flattenSelectedDraftItems(args.draft.items, acceptedIds);

    if (selectedItems.length === 0) {
      throw new BadRequestException('At least one draft item must be selected for submission.');
    }

    const projectKey = args.draft.projectKey;
    if (!projectKey) {
      throw new InternalServerErrorException(`Draft '${args.draft.id}' does not include a Jira project key.`);
    }

    if (args.draft.existingEpicKey) {
      await this.ensureIssueKeyInProject(args.draft.existingEpicKey, projectKey);
    }

    if (args.draft.existingFeatureKey) {
      await this.ensureIssueKeyInProject(args.draft.existingFeatureKey, projectKey);
    }

    const selectedLevels = new Set(selectedItems.map((item) => item.level));
    const metadata = await this.getCreateHierarchyMetadata(projectKey, selectedLevels);
    const links: SubmittedWorkItemLink[] = [];
    const createdKeysByDraftId = new Map<string, string>();
    const failedDraftIds = new Set<string>();

    for (const item of selectedItems) {
      const unmetDependency = this.getDependencyFailure(item, failedDraftIds, createdKeysByDraftId, args.draft);
      if (unmetDependency) {
        links.push({
          localDraftId: item.id,
          jiraIssueType: this.toJiraIssueTypeName(item.level),
          status: 'SKIPPED',
          errorMessage: unmetDependency,
        });
        failedDraftIds.add(item.id);
        continue;
      }

      try {
        const created = await this.createSingleDraftIssue(item, args.draft, metadata, createdKeysByDraftId);
        createdKeysByDraftId.set(item.id, created.key);

        if (item.level === 'STORY') {
          const featureKey = this.resolveFeatureKeyForStory(item, args.draft, createdKeysByDraftId);
          if (featureKey && metadata.linkTypeName) {
            await this.createIssueLink(created.key, featureKey, metadata.linkTypeName);
          }
        }

        links.push({
          localDraftId: item.id,
          jiraKey: created.key,
          jiraIssueType: this.toJiraIssueTypeName(item.level),
          jiraUrl: this.getBrowseUrl(created.key),
          status: 'CREATED',
        });
      } catch (error) {
        failedDraftIds.add(item.id);
        links.push({
          localDraftId: item.id,
          jiraIssueType: this.toJiraIssueTypeName(item.level),
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown Jira submission error.',
        });
      }
    }

    const createdCount = links.filter((item) => item.status === 'CREATED').length;
    const failedCount = links.length - createdCount;

    return {
      links,
      status: createdCount === 0 ? 'FAILED' : failedCount > 0 ? 'PARTIAL_FAILURE' : 'SUBMITTED',
    };
  }

  private async createSingleDraftIssue(
    item: DraftWorkItem,
    draft: DraftWorkItemSet,
    metadata: CreateHierarchyMetadata,
    createdKeysByDraftId: Map<string, string>,
  ): Promise<JiraCreatedIssue> {
    const issueType = metadata.issueTypes[item.level];
    if (!issueType) {
      throw new BadRequestException(`Project '${draft.projectKey}' does not support Jira issue type '${this.toJiraIssueTypeName(item.level)}'.`);
    }

    const fields: Record<string, unknown> = {
      project: { key: draft.projectKey },
      issuetype: { id: issueType.id },
      summary: item.title,
      description: item.description ?? item.title,
      labels: this.buildLabels(item.labels),
    };

    if (item.components?.length) {
      fields.components = item.components.map((component) => ({ name: component }));
    }

    this.assignOptionalField(issueType.fields, fields, ['Story Points'], item.storyPoints);
    this.assignOptionalField(issueType.fields, fields, ['Target start date', 'Start date'], item.targetStartDate);
    this.assignOptionalField(issueType.fields, fields, ['Target end date', 'Due date', 'End date'], item.targetEndDate);

    if (item.requiredFields) {
      Object.assign(fields, item.requiredFields);
    }

    const epicLinkFieldKey =
      item.level === 'FEATURE'
        ? metadata.epicLinkFieldKeyByLevel.FEATURE
        : item.level === 'STORY'
          ? metadata.epicLinkFieldKeyByLevel.STORY
          : undefined;

    if (item.level === 'FEATURE') {
      const epicKey = this.resolveEpicKeyForFeature(item, draft, createdKeysByDraftId);
      if (!epicKey) {
        throw new BadRequestException(`Feature '${item.title}' requires an Epic key but none was available.`);
      }

      if (!epicLinkFieldKey) {
        throw new BadRequestException(
          `Project '${draft.projectKey}' does not expose an 'Epic Link' field for Feature creation.`,
        );
      }

      fields[epicLinkFieldKey] = epicKey;
    }

    if (item.level === 'STORY' && epicLinkFieldKey) {
      const epicKey = this.resolveEpicKeyForStory(item, draft, createdKeysByDraftId);
      if (epicKey) {
        fields[epicLinkFieldKey] = epicKey;
      }
    }

    const epicNameField = this.findFieldKeyByName(issueType.fields, 'Epic Name');
    if (item.level === 'EPIC' && epicNameField) {
      fields[epicNameField] = item.title;
    }

    return this.fetchJson<JiraCreatedIssue>(`${this.getBaseUrl()}/rest/api/2/issue`, {
      method: 'POST',
      body: JSON.stringify({ fields }),
    });
  }

  private async createIssueLink(inwardIssueKey: string, outwardIssueKey: string, linkTypeName: string) {
    await this.fetchJson(`${this.getBaseUrl()}/rest/api/2/issueLink`, {
      method: 'POST',
      body: JSON.stringify({
        type: { name: linkTypeName },
        inwardIssue: { key: inwardIssueKey },
        outwardIssue: { key: outwardIssueKey },
      }),
    });
  }

  private resolveEpicKeyForFeature(
    item: DraftWorkItem,
    draft: DraftWorkItemSet,
    createdKeysByDraftId: Map<string, string>,
  ): string | undefined {
    if (item.parentDraftId) {
      return createdKeysByDraftId.get(item.parentDraftId);
    }

    return draft.existingEpicKey;
  }

  private resolveEpicKeyForStory(
    item: DraftWorkItem,
    draft: DraftWorkItemSet,
    createdKeysByDraftId: Map<string, string>,
  ): string | undefined {
    if (draft.existingEpicKey) {
      return draft.existingEpicKey;
    }

    const featureParentId = item.parentDraftId;
    if (!featureParentId) {
      return undefined;
    }

    const featureParent = this.findDraftItemById(draft.items, featureParentId);
    if (featureParent?.parentDraftId) {
      return createdKeysByDraftId.get(featureParent.parentDraftId);
    }

    return undefined;
  }

  private resolveFeatureKeyForStory(
    item: DraftWorkItem,
    draft: DraftWorkItemSet,
    createdKeysByDraftId: Map<string, string>,
  ): string | undefined {
    if (item.parentDraftId) {
      return createdKeysByDraftId.get(item.parentDraftId);
    }

    return draft.existingFeatureKey;
  }

  private getDependencyFailure(
    item: DraftWorkItem,
    failedDraftIds: Set<string>,
    createdKeysByDraftId: Map<string, string>,
    draft: DraftWorkItemSet,
  ): string | undefined {
    if (item.level === 'FEATURE') {
      if (item.parentDraftId && failedDraftIds.has(item.parentDraftId)) {
        return `Skipped because parent Epic draft '${item.parentDraftId}' failed or was skipped.`;
      }

      if (item.parentDraftId && !createdKeysByDraftId.has(item.parentDraftId)) {
        return `Skipped because parent Epic draft '${item.parentDraftId}' was not selected.`;
      }

      if (!item.parentDraftId && !draft.existingEpicKey) {
        return 'Skipped because no existingEpicKey was supplied for feature creation.';
      }
    }

    if (item.level === 'STORY') {
      if (item.parentDraftId && failedDraftIds.has(item.parentDraftId)) {
        return `Skipped because parent Feature draft '${item.parentDraftId}' failed or was skipped.`;
      }

      if (item.parentDraftId && !createdKeysByDraftId.has(item.parentDraftId)) {
        return `Skipped because parent Feature draft '${item.parentDraftId}' was not selected.`;
      }

      if (!item.parentDraftId && !draft.existingFeatureKey) {
        return 'Skipped because no existingFeatureKey was supplied for story creation.';
      }
    }

    return undefined;
  }

  private flattenSelectedDraftItems(items: DraftWorkItem[], acceptedIds: Set<string>): DraftWorkItem[] {
    const flattened: DraftWorkItem[] = [];

    for (const item of items) {
      if (acceptedIds.has(item.id)) {
        flattened.push(item);
      }

      if (item.children?.length) {
        flattened.push(...this.flattenSelectedDraftItems(item.children, acceptedIds));
      }
    }

    return flattened;
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

  private async getCreateHierarchyMetadata(
    projectKey: string,
    requiredLevels: Set<'EPIC' | 'FEATURE' | 'STORY'>,
  ): Promise<CreateHierarchyMetadata> {
    const availableIssueTypes = await this.getCreateMetaIssueTypes(projectKey, false);
    const metadata: CreateHierarchyMetadata = {
      issueTypes: {},
      epicLinkFieldKeyByLevel: {},
    };

    for (const level of requiredLevels) {
      const availableIssueType = this.findIssueType(availableIssueTypes, this.toJiraIssueTypeName(level));
      if (!availableIssueType) {
        throw new BadRequestException(`Project '${projectKey}' does not support Jira issue type '${this.toJiraIssueTypeName(level)}'.`);
      }

      metadata.issueTypes[level] = await this.getCreateMetaIssueType(projectKey, availableIssueType);
    }

    const feature = metadata.issueTypes.FEATURE;
    const story = metadata.issueTypes.STORY;

    if (feature) {
      metadata.epicLinkFieldKeyByLevel.FEATURE = this.findFieldKeyByName(feature.fields, 'Epic Link');
    }

    if (story) {
      metadata.epicLinkFieldKeyByLevel.STORY = this.findFieldKeyByName(story.fields, 'Epic Link');

      const issueLinkTypes = await this.fetchJson<JiraIssueLinkTypeResponse>(`${this.getBaseUrl()}/rest/api/2/issueLinkType`);
      const linkType =
        issueLinkTypes.issueLinkTypes?.find((entry) => entry.name?.toLowerCase().includes('relates')) ??
        issueLinkTypes.issueLinkTypes?.[0];

      if (!linkType?.name) {
        throw new BadRequestException('No Jira issue link type is available for Story-to-Feature linking.');
      }

      metadata.linkTypeName = linkType.name;
    }

    return metadata;
  }

  private async getSupportedLevels(projectKey: string): Promise<Array<'EPIC' | 'FEATURE' | 'STORY'>> {
    const issueTypes = await this.getCreateMetaIssueTypes(projectKey, false);

    return ['EPIC', 'FEATURE', 'STORY'].filter((level) => {
      const jiraName = this.toJiraIssueTypeName(level as 'EPIC' | 'FEATURE' | 'STORY');
      return issueTypes.some((issueType) => issueType.name.toLowerCase() === jiraName.toLowerCase());
    }) as Array<'EPIC' | 'FEATURE' | 'STORY'>;
  }

  private async getCreateMetaIssueTypes(projectKey: string, includeFields: boolean): Promise<JiraIssueTypeMeta[]> {
    const query = includeFields ? '?expand=fields' : '';
    const createMeta = await this.fetchJson<JiraCreateMetaResponse>(
      `${this.getBaseUrl()}/rest/api/2/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes${query}`,
    );

    return createMeta.values ?? [];
  }

  private async getCreateMetaIssueType(projectKey: string, issueType: JiraIssueTypeMeta): Promise<JiraIssueTypeMeta> {
    const details = await this.fetchJson<JiraCreateMetaFieldResponse>(
      `${this.getBaseUrl()}/rest/api/2/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes/${encodeURIComponent(issueType.id)}?expand=fields`,
    );

    return {
      ...issueType,
      fields: Object.fromEntries(
        (details.values ?? []).map((field) => [
          field.fieldId,
          {
            name: field.name,
            required: field.required,
          } satisfies JiraFieldMeta,
        ]),
      ),
    };
  }

  private async getVisibleProjectContexts(): Promise<ProjectContext[]> {
    const projects = await this.fetchJson<JiraProject[]>(`${this.getBaseUrl()}/rest/api/2/project`);

    return Promise.all(
      projects.map(async (project) => ({
        project,
        roleMap: await this.fetchJson<Record<string, string>>(
          `${this.getBaseUrl()}/rest/api/2/project/${encodeURIComponent(project.key)}/role`,
        ),
      })),
    );
  }

  private async resolveProjectRole(roleMap: Record<string, string>): Promise<ProjectRole> {
    const entries = await Promise.all(
      Object.entries(roleMap).map(async ([roleName, roleUrl]) => ({
        roleName,
        details: await this.fetchJson<JiraRoleActorsResponse>(roleUrl),
      })),
    );

    const matchedRole = entries.find(({ details }) =>
      (details.actors ?? []).some((actor) => this.matchesDefaultUser(actor)),
    );

    if (!matchedRole) {
      return 'VIEWER';
    }

    return this.mapJiraRoleName(matchedRole.roleName);
  }

  private mapJiraRoleName(roleName: string): ProjectRole {
    const normalized = roleName.toLowerCase();

    if (normalized.includes('admin')) {
      return 'ADMIN';
    }

    if (normalized.includes('owner') || normalized.includes('product')) {
      return 'PRODUCT_OWNER';
    }

    if (normalized.includes('developer') || normalized.includes('engineer')) {
      return 'ENGINEER';
    }

    return 'VIEWER';
  }

  private matchesDefaultUser(actor: JiraRoleActor): boolean {
    const defaultUser = this.getDefaultUser();
    if (!defaultUser) {
      return false;
    }

    const candidates = [
      actor.name,
      actor.key,
      actor.displayName,
      actor.emailAddress,
      actor.actorUser?.name,
      actor.actorUser?.key,
      actor.actorUser?.displayName,
      actor.actorUser?.emailAddress,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());

    return candidates.includes(defaultUser.toLowerCase());
  }

  private toRoleUser(actor: JiraRoleActor): JiraRoleUserSummary | null {
    const username = actor.actorUser?.name ?? actor.actorUser?.key ?? actor.name ?? actor.key;
    if (!username) {
      return null;
    }

    return {
      username,
      displayName: actor.actorUser?.displayName ?? actor.displayName ?? username,
    };
  }

  private findIssueType(issueTypes: JiraIssueTypeMeta[], issueTypeName: string): JiraIssueTypeMeta | undefined {
    return issueTypes.find((issueType) => issueType.name.toLowerCase() === issueTypeName.toLowerCase());
  }

  private normalizeParentIssueLevel(parentLevel?: ParentIssueLevel): ParentIssueLevel {
    if (!parentLevel) {
      throw new BadRequestException('parentLevel is required and must be EPIC or FEATURE.');
    }

    if (parentLevel !== 'EPIC' && parentLevel !== 'FEATURE') {
      throw new BadRequestException(`Unsupported parentLevel '${parentLevel}'. Use EPIC or FEATURE.`);
    }

    return parentLevel;
  }

  private async fetchIssueSearchResults(projectKey: string, jql: string, maxResults: number) {
    const result = await this.fetchJson<{
      total?: number;
      issues?: Array<{
        key: string;
        fields?: {
          summary?: string;
          status?: { name?: string };
          issuetype?: { name?: string };
          project?: { key?: string };
        };
      }>;
    }>(`${this.getBaseUrl()}/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=summary,status,issuetype,project`);

    const issues: JiraIssueSearchResult[] = (result.issues ?? []).map((issue) => ({
      key: issue.key,
      projectKey: issue.fields?.project?.key ?? projectKey,
      summary: issue.fields?.summary ?? issue.key,
      issueType: issue.fields?.issuetype?.name ?? 'Unknown',
      status: issue.fields?.status?.name,
      url: this.getBrowseUrl(issue.key),
    }));

    return {
      total: result.total ?? issues.length,
      issues,
    };
  }

  private findFieldKeyByName(fields: Record<string, JiraFieldMeta> | undefined, displayName: string): string | undefined {
    if (!fields) {
      return undefined;
    }

    return Object.entries(fields).find(([, value]) => value.name?.toLowerCase() === displayName.toLowerCase())?.[0];
  }

  private assignOptionalField(
    fieldsMeta: Record<string, JiraFieldMeta> | undefined,
    fields: Record<string, unknown>,
    displayNames: string[],
    value: unknown,
  ) {
    if (value === undefined || value === null || value === '') {
      return;
    }

    for (const displayName of displayNames) {
      const fieldKey = this.findFieldKeyByName(fieldsMeta, displayName);
      if (fieldKey) {
        fields[fieldKey] = value;
        return;
      }
    }
  }

  private buildLabels(labels?: string[]): string[] {
    return Array.from(new Set([...(labels ?? []), GENERATED_LABEL].filter(Boolean)));
  }

  private canCreate(role: ProjectRole, level: 'EPIC' | 'FEATURE' | 'STORY') {
    if (role === 'ADMIN' || role === 'PRODUCT_OWNER') {
      return true;
    }

    if (role === 'ENGINEER' && level !== 'EPIC') {
      return true;
    }

    return false;
  }

  private toJiraIssueTypeName(level: 'EPIC' | 'FEATURE' | 'STORY'): 'Epic' | 'Feature' | 'Story' {
    if (level === 'EPIC') {
      return 'Epic';
    }

    if (level === 'FEATURE') {
      return 'Feature';
    }

    return 'Story';
  }

  private getBrowseUrl(issueKey: string) {
    return `${this.getBaseUrl()}/browse/${issueKey}`;
  }

  private getBaseUrl() {
    return this.getJiraConfig().baseUrl;
  }

  private getPersonalAccessToken() {
    return this.getJiraConfig().personalAccessToken;
  }

  private getDefaultUser() {
    return process.env.JIRA_DEFAULT_USER?.trim() ?? '';
  }

  private createEmptyUserSyncResponse(): JiraUserSyncResponse {
    return {
      generatedAt: new Date().toISOString(),
      projectCount: 0,
      totalUniqueUsers: 0,
      projects: [],
    };
  }

  private getJiraConfig() {
    const status = this.getIntegrationStatus();
    const personalAccessToken = process.env.JIRA_PAT?.trim();

    if (!status.configured || !status.baseUrl || !personalAccessToken) {
      throw new ServiceUnavailableException(status.message);
    }

    return {
      baseUrl: status.baseUrl,
      personalAccessToken,
    };
  }

  private toJiraRequestException(status: number) {
    if (status === 401 || status === 403) {
      return new BadGatewayException(
        'Jira rejected the request. Verify JIRA_PAT has access to the configured Jira instance and project data.',
      );
    }

    if (status === 404) {
      return new BadGatewayException(
        'Jira endpoint was not found. Verify JIRA_BASE_URL points to the Jira base URL, for example http://localhost:8080.',
      );
    }

    return new BadGatewayException(
      `Jira request failed with status ${status}. Verify Jira is running and the configured credentials are valid.`,
    );
  }

  private async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    let response: Response;

    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.getPersonalAccessToken()}`,
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
      });
    } catch {
      throw new BadGatewayException(
        `Unable to reach Jira at ${this.getBaseUrl()}. Start Jira locally or verify JIRA_BASE_URL in the root .env file.`,
      );
    }

    if (!response.ok) {
      throw this.toJiraRequestException(response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}
