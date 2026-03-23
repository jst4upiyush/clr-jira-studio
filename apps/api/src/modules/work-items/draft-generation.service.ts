import { Injectable } from '@nestjs/common';
import type {
  CreateDraftRequest,
  DraftGenerationContext,
  DraftWorkItem,
  ProviderKind,
  ProjectSummary,
  TemplateSummary,
} from '@jira-idea-studio/shared';

type GenerateDraftArgs = {
  draftId: string;
  project: ProjectSummary;
  request: CreateDraftRequest;
  template?: TemplateSummary;
  previousGenerationContext?: DraftGenerationContext;
  refinementInstruction?: string;
  currentItems?: DraftWorkItem[];
};

type DraftGenerationResult = {
  items: DraftWorkItem[];
  providerName: string;
  providerVersion: string;
  providerKind: ProviderKind;
  generationContext: DraftGenerationContext;
};

type GeneratorExecution = {
  items: DraftWorkItem[];
  mode: DraftGenerationContext['mode'];
  fallbackReason?: string;
  providerName: string;
  providerVersion: string;
  providerKind: ProviderKind;
};

type LlmMessage = {
  role: 'system' | 'user';
  content: string;
};

type CandidateDraftItem = Partial<DraftWorkItem> & {
  id?: string;
  children?: CandidateDraftItem[];
};

const HEURISTIC_PROVIDER_NAME = 'heuristic-draft-generator';
const HEURISTIC_PROVIDER_VERSION = '1.0.0';

@Injectable()
export class DraftGenerationService {
  async generateDraft(args: GenerateDraftArgs): Promise<DraftGenerationResult> {
    const seedItems = this.buildHeuristicItems(args);
    let execution: GeneratorExecution = {
      items: seedItems,
      mode: 'HEURISTIC',
      providerName: HEURISTIC_PROVIDER_NAME,
      providerVersion: HEURISTIC_PROVIDER_VERSION,
      providerKind: args.request.providerKind ?? 'SCRIPT',
    };

    if (this.isLlmConfigured()) {
      try {
        execution = await this.generateWithLlm(args, seedItems);
      } catch (error) {
        execution = {
          items: seedItems,
          mode: 'HEURISTIC',
          fallbackReason: error instanceof Error ? error.message : 'Unknown LLM generation failure.',
          providerName: HEURISTIC_PROVIDER_NAME,
          providerVersion: HEURISTIC_PROVIDER_VERSION,
          providerKind: args.request.providerKind ?? 'SCRIPT',
        };
      }
    }

    const previousHistory = args.previousGenerationContext?.refinementHistory ?? [];
    const normalizedInstruction = args.refinementInstruction?.trim();
    const refinementHistory = normalizedInstruction
      ? [
          ...previousHistory,
          {
            at: new Date().toISOString(),
            instruction: normalizedInstruction,
            mode: execution.mode,
            fallbackReason: execution.fallbackReason,
          },
        ]
      : previousHistory;

    return {
      items: execution.items,
      providerName: execution.providerName,
      providerVersion: execution.providerVersion,
      providerKind: execution.providerKind,
      generationContext: {
        mode: execution.mode,
        fallbackReason: execution.fallbackReason,
        requestSnapshot: args.previousGenerationContext?.requestSnapshot ?? args.request,
        templateSnapshot: args.template ?? args.previousGenerationContext?.templateSnapshot,
        refinementHistory,
      },
    };
  }

  private buildHeuristicItems(args: GenerateDraftArgs): DraftWorkItem[] {
    const labels = this.mergeUnique(args.template?.labels, args.request.defaults?.labels);
    const components = this.mergeUnique(args.template?.components, args.request.defaults?.components);
    const focusAreas = this.deriveFocusAreas(args);
    const baseTitle = this.toBaseTitle(args);

    const buildItem = (
      id: string,
      level: DraftWorkItem['level'],
      titleSeed: string,
      descriptionFocus: string,
      parentDraftId?: string,
    ): DraftWorkItem => ({
      id,
      parentDraftId,
      level,
      title: this.formatTitle(level, titleSeed, args.template),
      description: this.buildDescription(level, descriptionFocus, args),
      storyPoints:
        level === 'STORY'
          ? this.resolveStoryPoints(args.request.defaults?.defaultStoryPoints, `${descriptionFocus}\n${this.collectContextText(args)}`)
          : undefined,
      targetStartDate: args.request.defaults?.targetStartDate,
      targetEndDate: args.request.defaults?.targetEndDate,
      labels,
      components,
    });

    const epic = buildItem(`${args.draftId}-epic-1`, 'EPIC', baseTitle, `${baseTitle} outcome`);
    const featureOne = buildItem(
      `${args.draftId}-feature-1`,
      'FEATURE',
      `${baseTitle} · ${focusAreas[0]}`,
      `${focusAreas[0]} delivery track`,
      epic.id,
    );
    const featureTwo = buildItem(
      `${args.draftId}-feature-2`,
      'FEATURE',
      `${baseTitle} · ${focusAreas[1]}`,
      `${focusAreas[1]} delivery track`,
      epic.id,
    );
    const storyOne = buildItem(
      `${args.draftId}-story-1-1`,
      'STORY',
      `Implement ${focusAreas[0].toLowerCase()}`,
      `${focusAreas[0]} implementation slice`,
      featureOne.id,
    );
    const storyTwo = buildItem(
      `${args.draftId}-story-2-1`,
      'STORY',
      `Validate ${focusAreas[1].toLowerCase()}`,
      `${focusAreas[1]} validation slice`,
      featureTwo.id,
    );
    const standaloneStory = buildItem(
      `${args.draftId}-story-1`,
      'STORY',
      baseTitle,
      `${baseTitle} implementation slice`,
    );

    if (args.request.scope === 'EPIC_ONLY') {
      return [epic];
    }

    if (args.request.scope === 'EPIC_WITH_FEATURES') {
      return [{ ...epic, children: [{ ...featureOne }, { ...featureTwo }] }];
    }

    if (args.request.scope === 'EPIC_WITH_FEATURES_AND_STORIES') {
      return [
        {
          ...epic,
          children: [
            { ...featureOne, children: [{ ...storyOne }] },
            { ...featureTwo, children: [{ ...storyTwo }] },
          ],
        },
      ];
    }

    if (args.request.scope === 'FEATURE_ONLY') {
      return [{ ...featureOne, parentDraftId: undefined }];
    }

    if (args.request.scope === 'FEATURE_WITH_STORIES') {
      return [
        {
          ...featureOne,
          parentDraftId: undefined,
          children: [
            { ...storyOne },
            {
              ...buildItem(
                `${args.draftId}-story-1-2`,
                'STORY',
                `Roll out ${focusAreas[0].toLowerCase()}`,
                `${focusAreas[0]} rollout slice`,
                featureOne.id,
              ),
            },
          ],
        },
      ];
    }

    return [standaloneStory];
  }

  private async generateWithLlm(args: GenerateDraftArgs, seedItems: DraftWorkItem[]): Promise<GeneratorExecution> {
    const config = this.getLlmConfig();
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages: this.buildLlmMessages(args, seedItems),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`LLM generation request failed with status ${response.status}${body ? `: ${body}` : ''}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ text?: string }>;
        };
      }>;
    };

    const content = this.extractLlmContent(payload);
    const parsed = this.parseJson(content);
    const candidateItems = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { items?: CandidateDraftItem[] }).items)
        ? (parsed as { items: CandidateDraftItem[] }).items
        : Array.isArray((parsed as { draftItems?: CandidateDraftItem[] }).draftItems)
          ? (parsed as { draftItems: CandidateDraftItem[] }).draftItems
          : undefined;

    if (!candidateItems?.length) {
      throw new Error('LLM response did not include draft items.');
    }

    return {
      items: this.mergeLlmItems(seedItems, candidateItems),
      mode: 'LLM',
      providerName: 'openai-compatible-chat',
      providerVersion: config.model,
      providerKind: args.request.providerKind ?? 'AGENT',
    };
  }

  private buildLlmMessages(args: GenerateDraftArgs, seedItems: DraftWorkItem[]): LlmMessage[] {
    const userContext = {
      projectKey: args.project.jiraProjectKey,
      scope: args.request.scope,
      textInput: args.request.textInput,
      template: args.template
        ? {
            name: args.template.name,
            description: args.template.description,
            systemContext: args.template.systemContext,
            persona: args.template.persona,
            labels: args.template.labels,
            components: args.template.components,
          }
        : undefined,
      jiraContext: args.request.queryContext,
      attachments: (args.request.files ?? [])
        .filter((file) => file.extractedText)
        .map((file) => ({ filename: file.filename, excerpt: file.excerpt, extractedText: file.extractedText }))
        .slice(0, 3),
      refinementInstruction: args.refinementInstruction,
      currentItems: args.currentItems,
      seedItems,
    };

    return [
      {
        role: 'system',
        content:
          'You improve Jira draft work items. Preserve every id, level, parentDraftId, and children relationship exactly as provided. Only refine title, description, storyPoints, labels, components, targetStartDate, and targetEndDate. Return JSON only with the shape {"items": DraftWorkItem[]}.',
      },
      {
        role: 'user',
        content: JSON.stringify(userContext),
      },
    ];
  }

  private mergeLlmItems(seedItems: DraftWorkItem[], candidateItems: CandidateDraftItem[]): DraftWorkItem[] {
    const candidateMap = new Map<string, CandidateDraftItem>();
    this.collectCandidates(candidateItems, candidateMap);

    return seedItems.map((seedItem) => this.mergeLlmItem(seedItem, candidateMap));
  }

  private mergeLlmItem(seedItem: DraftWorkItem, candidateMap: Map<string, CandidateDraftItem>): DraftWorkItem {
    const candidate = candidateMap.get(seedItem.id);
    if (!candidate) {
      return seedItem;
    }

    if (candidate.level && candidate.level !== seedItem.level) {
      throw new Error(`LLM returned mismatched level for '${seedItem.id}'.`);
    }

    return {
      ...seedItem,
      title: this.normalizeTitle(candidate.title) ?? seedItem.title,
      description: this.normalizeOptionalText(candidate.description) ?? seedItem.description,
      storyPoints: this.normalizeStoryPoints(candidate.storyPoints) ?? seedItem.storyPoints,
      labels: Array.isArray(candidate.labels) ? this.mergeUnique(candidate.labels) : seedItem.labels,
      components: Array.isArray(candidate.components) ? this.mergeUnique(candidate.components) : seedItem.components,
      targetStartDate: this.normalizeDate(candidate.targetStartDate) ?? seedItem.targetStartDate,
      targetEndDate: this.normalizeDate(candidate.targetEndDate) ?? seedItem.targetEndDate,
      children: seedItem.children?.map((child) => this.mergeLlmItem(child, candidateMap)),
    };
  }

  private collectCandidates(items: CandidateDraftItem[], target: Map<string, CandidateDraftItem>) {
    for (const item of items) {
      if (item.id) {
        target.set(item.id, item);
      }

      if (item.children?.length) {
        this.collectCandidates(item.children, target);
      }
    }
  }

  private extractLlmContent(payload: { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> }) {
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      const combined = content.map((entry) => entry.text ?? '').join('');
      if (combined.trim()) {
        return combined;
      }
    }

    throw new Error('LLM response did not include message content.');
  }

  private parseJson(rawContent: string): unknown {
    const trimmed = rawContent.trim();
    const normalized = trimmed.startsWith('```')
      ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      : trimmed;

    return JSON.parse(normalized);
  }

  private isLlmConfigured() {
    return Boolean(process.env.OPENAI_API_KEY?.trim() && process.env.OPENAI_MODEL?.trim());
  }

  private getLlmConfig() {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const model = process.env.OPENAI_MODEL?.trim();
    const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');

    if (!apiKey || !model) {
      throw new Error('OPENAI_API_KEY and OPENAI_MODEL must be configured for LLM generation.');
    }

    return {
      apiKey,
      model,
      baseUrl,
    };
  }

  private toBaseTitle(args: GenerateDraftArgs) {
    const candidates = [
      args.request.textInput,
      args.request.queryContext?.note,
      args.request.queryContext?.query,
      args.template?.name,
      args.project.name,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? value.trim())
      .filter(Boolean);

    return (candidates[0] ?? 'Generated backlog item').slice(0, 80);
  }

  private deriveFocusAreas(args: GenerateDraftArgs) {
    const lines = [
      ...(args.request.textInput?.split(/\r?\n/) ?? []),
      ...(args.request.files ?? []).map((file) => file.excerpt ?? ''),
      ...(args.request.queryContext?.matchedIssues ?? []).map((issue) => issue.summary),
      ...this.collectCurrentItemText(args.currentItems),
      args.request.queryContext?.note ?? '',
      args.refinementInstruction ?? '',
    ]
      .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
      .filter((line) => line.length >= 12)
      .filter((line, index, entries) => entries.indexOf(line) === index)
      .slice(0, 2);

    return [lines[0] ?? 'Planning and orchestration', lines[1] ?? 'Validation and rollout'];
  }

  private buildDescription(level: DraftWorkItem['level'], focus: string, args: GenerateDraftArgs) {
    const sections = [
      `${level} focus: ${focus}.`,
      args.template?.description ? `Template description: ${args.template.description}` : undefined,
      args.template?.systemContext ? `System context: ${args.template.systemContext}` : undefined,
      args.template?.persona ? `Persona: ${args.template.persona}` : undefined,
      args.request.textInput ? `User input:\n${this.truncate(args.request.textInput, 900)}` : undefined,
      this.describeJiraContext(args),
      this.describeAttachmentContext(args),
      args.refinementInstruction ? `Refinement instruction: ${args.refinementInstruction}` : undefined,
      level === 'STORY' ? this.buildAcceptanceHints(focus, args) : undefined,
    ].filter((section): section is string => Boolean(section));

    return sections.join('\n\n');
  }

  private describeJiraContext(args: GenerateDraftArgs) {
    const queryContext = args.request.queryContext;
    if (!queryContext) {
      return undefined;
    }

    const issueKeys = queryContext.matchedIssueKeys?.slice(0, 5).join(', ');
    const issueSummaries = queryContext.matchedIssues?.slice(0, 3).map((issue) => `${issue.key}: ${issue.summary}`).join('; ');
    const parts = [
      queryContext.query ? `query=${queryContext.query}` : undefined,
      issueKeys ? `matchedKeys=${issueKeys}` : undefined,
      issueSummaries ? `matches=${issueSummaries}` : undefined,
      queryContext.note ? `note=${queryContext.note}` : undefined,
    ].filter((part): part is string => Boolean(part));

    return parts.length > 0 ? `Jira context: ${parts.join(' | ')}` : undefined;
  }

  private describeAttachmentContext(args: GenerateDraftArgs) {
    const excerpts = (args.request.files ?? [])
      .filter((file) => file.extractedText)
      .map((file) => `${file.filename}: ${file.excerpt ?? this.truncate(file.extractedText ?? '', 180)}`)
      .slice(0, 3);

    return excerpts.length > 0 ? `Attachment context: ${excerpts.join(' ; ')}` : undefined;
  }

  private buildAcceptanceHints(focus: string, args: GenerateDraftArgs) {
    const hints = [
      `- Deliver ${focus.toLowerCase()} without breaking the requested ${args.request.scope} scope.`,
      `- Preserve labels/components and any Jira parent linkage required by the selected flow.`,
      `- Capture a reviewable implementation slice that can be created in Jira directly from the draft.`,
    ];

    return `Acceptance hints:\n${hints.join('\n')}`;
  }

  private formatTitle(level: DraftWorkItem['level'], title: string, template?: TemplateSummary) {
    const pattern =
      level === 'EPIC'
        ? template?.namingConvention?.epicPattern
        : level === 'FEATURE'
          ? template?.namingConvention?.featurePattern
          : template?.namingConvention?.storyPattern;

    if (pattern) {
      const rendered = pattern.replace(/{{title}}/g, title.trim());
      return template?.namingConvention?.prefix && !rendered.startsWith(template.namingConvention.prefix)
        ? `${template.namingConvention.prefix} ${rendered}`
        : rendered;
    }

    const label = level.charAt(0) + level.slice(1).toLowerCase();
    return `${label}: ${title.trim()}`;
  }

  private resolveStoryPoints(defaultStoryPoints: number | undefined, contextText: string) {
    if (typeof defaultStoryPoints === 'number' && Number.isFinite(defaultStoryPoints)) {
      return defaultStoryPoints;
    }

    const normalized = contextText.toLowerCase();
    let complexityScore = 1;
    const weightedPatterns: Array<[RegExp, number]> = [
      [/(integrat|migration|orchestrat|workflow|cross-team|dependency|hierarch)/g, 2],
      [/(security|permission|auth|compliance|audit|rollback)/g, 2],
      [/(performance|latency|scale|analytics|reporting|synchroni)/g, 1],
      [/(api|backend|frontend|schema|validation|attachment)/g, 1],
    ];

    for (const [pattern, weight] of weightedPatterns) {
      complexityScore += ((normalized.match(pattern) ?? []).length > 0 ? 1 : 0) * weight;
    }

    complexityScore += Math.min(3, Math.floor(normalized.split(/\s+/).length / 120));

    if (complexityScore <= 1) {
      return 1;
    }

    if (complexityScore <= 2) {
      return 2;
    }

    if (complexityScore <= 4) {
      return 3;
    }

    if (complexityScore <= 6) {
      return 5;
    }

    if (complexityScore <= 8) {
      return 8;
    }

    return 13;
  }

  private collectContextText(args: GenerateDraftArgs) {
    return [
      args.request.textInput,
      args.request.queryContext?.note,
      args.request.queryContext?.query,
      ...this.collectCurrentItemText(args.currentItems),
      ...(args.request.files ?? []).map((file) => file.extractedText ?? file.excerpt),
      args.refinementInstruction,
    ]
      .filter((value): value is string => Boolean(value))
      .join('\n');
  }

  private collectCurrentItemText(items: DraftWorkItem[] | undefined): string[] {
    if (!items?.length) {
      return [];
    }

    return items.flatMap((item) => [item.title, item.description, ...this.collectCurrentItemText(item.children)]).filter(
      (value): value is string => Boolean(value),
    );
  }

  private mergeUnique(...sources: Array<string[] | undefined>) {
    return Array.from(new Set(sources.flatMap((source) => source ?? []).map((entry) => entry.trim()).filter(Boolean)));
  }

  private truncate(value: string, maxLength: number) {
    return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
  }

  private normalizeTitle(value: unknown) {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized || undefined;
  }

  private normalizeOptionalText(value: unknown) {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized || undefined;
  }

  private normalizeStoryPoints(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
  }

  private normalizeDate(value: unknown) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  }
}