import { Controller, Get, InternalServerErrorException } from '@nestjs/common';
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
    if (!this.usersService.hasUsers()) {
      await this.jiraService.syncUsersForVisibleProjects();
    }

    const currentUser = this.usersService.getCurrentUser();
    const syncedUsers = this.usersService.listUsers();

    if (!currentUser) {
      throw new InternalServerErrorException('No synced Jira user is available for the current app session.');
    }

    return {
      user: currentUser,
      authMode: 'jira-sync',
      syncedUserCount: syncedUsers.totalUsers,
      lastSyncedAt: syncedUsers.generatedAt,
    };
  }
}
