import { Controller, Get, Query } from '@nestjs/common';
import { JiraService } from './jira.service';

@Controller('jira')
export class JiraController {
  constructor(private readonly jiraService: JiraService) {}

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
}