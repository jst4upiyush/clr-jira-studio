import { Controller, Get, Query } from '@nestjs/common';
import type { ParentIssueLevel } from '@jira-idea-studio/shared';
import { JiraService } from './jira.service';

@Controller('jira')
export class JiraController {
  constructor(private readonly jiraService: JiraService) {}

  @Get('status')
  getStatus() {
    return this.jiraService.getIntegrationStatus();
  }

  @Get('projects')
  listProjects() {
    return this.jiraService.listProjectSummaries();
  }

  @Get('users/sync')
  syncUsers() {
    return this.jiraService.syncUsersForVisibleProjects();
  }

  @Get('search')
  searchIssues(@Query('projectKey') projectKey?: string, @Query('query') query?: string) {
    return this.jiraService.searchIssues(projectKey, query);
  }

  @Get('parents')
  listParentIssues(
    @Query('projectKey') projectKey?: string,
    @Query('parentLevel') parentLevel?: ParentIssueLevel,
    @Query('query') query?: string,
  ) {
    return this.jiraService.listParentIssues(projectKey, parentLevel, query);
  }
}