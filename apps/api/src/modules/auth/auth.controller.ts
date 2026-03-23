import { Controller, Get } from '@nestjs/common';
import type { AuthSessionResponse } from '@jira-idea-studio/shared';
import { JiraService } from '../jira/jira.service';
import { UsersService } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly jiraService: JiraService,
    private readonly usersService: UsersService,
  ) {}

  @Get('session')
  async getSession(): Promise<AuthSessionResponse> {
    const jiraStatus = this.jiraService.getIntegrationStatus();

    if (!jiraStatus.configured) {
      return {
        authMode: 'local-dev',
        syncedUserCount: 0,
        message: jiraStatus.message,
      };
    }

    if (!this.usersService.hasUsers()) {
      await this.jiraService.syncUsersForVisibleProjects();
    }

    const currentUser = this.usersService.getCurrentUser();
    const syncedUsers = this.usersService.listUsers();

    if (!currentUser) {
      return {
        authMode: 'local-dev',
        syncedUserCount: syncedUsers.totalUsers,
        lastSyncedAt: syncedUsers.generatedAt,
        message:
          'No synced Jira user is available for the current app session. Set JIRA_DEFAULT_USER to a Jira username visible to the configured PAT, then retry after Jira user sync completes.',
      };
    }

    return {
      user: currentUser,
      authMode: 'jira-sync',
      syncedUserCount: syncedUsers.totalUsers,
      lastSyncedAt: syncedUsers.generatedAt,
    };
  }
}
