import { Injectable } from '@nestjs/common';
import { JiraService } from '../jira/jira.service';

@Injectable()
export class ProjectsService {
  constructor(private readonly jiraService: JiraService) {}

  listVisibleProjects() {
    return this.jiraService.listProjectSummaries();
  }
}
