import { Injectable } from '@nestjs/common';
import type { TemplateSummary } from '@jira-idea-studio/shared';

@Injectable()
export class TemplatesService {
  listTemplates(): TemplateSummary[] {
    return [
      {
        id: 't1',
        teamId: 'team-1',
        name: 'Platform Epic Pack',
        description: 'Epic -> feature -> story decomposition template.',
        visibility: 'PUBLIC',
        status: 'PUBLISHED',
        supportedLevels: ['EPIC', 'FEATURE', 'STORY'],
        supportedScopes: ['EPIC_WITH_FEATURES_AND_STORIES'],
        version: 4,
        promptPacks: [],
        requiredFields: [],
        labels: [],
        components: [],
        issueLinkRules: [],
      },
    ];
  }
}
