import { Injectable } from '@nestjs/common';
import type { AppUserSummary, AppUsersResponse, JiraUserSyncResponse } from '@jira-idea-studio/shared';

@Injectable()
export class UsersService {
  private readonly users = new Map<string, AppUserSummary>();
  private lastSyncedAt?: string;

  clear() {
    this.users.clear();
    this.lastSyncedAt = undefined;
  }

  replaceFromJiraSync(sync: JiraUserSyncResponse): AppUsersResponse {
    const syncedAt = sync.generatedAt || new Date().toISOString();
    const aggregatedUsers = new Map<
      string,
      {
        jiraUsername: string;
        displayName: string;
        projectKeys: Set<string>;
        roleNames: Set<string>;
      }
    >();

    for (const project of sync.projects) {
      for (const role of project.roles) {
        for (const user of role.users) {
          const normalizedUsername = user.username.toLowerCase();
          const existing = aggregatedUsers.get(normalizedUsername) ?? {
            jiraUsername: user.username,
            displayName: user.displayName,
            projectKeys: new Set<string>(),
            roleNames: new Set<string>(),
          };

          existing.displayName = user.displayName || existing.displayName;
          existing.projectKeys.add(project.projectKey);
          existing.roleNames.add(role.roleName);
          aggregatedUsers.set(normalizedUsername, existing);
        }
      }
    }

    this.users.clear();
    this.lastSyncedAt = syncedAt;

    for (const [normalizedUsername, user] of aggregatedUsers.entries()) {
      this.users.set(normalizedUsername, {
        id: this.toAppUserId(user.jiraUsername),
        jiraUsername: user.jiraUsername,
        displayName: user.displayName,
        projectKeys: Array.from(user.projectKeys).sort(),
        roleNames: Array.from(user.roleNames).sort(),
        lastSyncedAt: syncedAt,
      });
    }

    return this.listUsers();
  }

  listUsers(): AppUsersResponse {
    const users = Array.from(this.users.values()).sort((left, right) =>
      left.displayName.localeCompare(right.displayName) || left.jiraUsername.localeCompare(right.jiraUsername),
    );

    return {
      generatedAt: this.lastSyncedAt,
      totalUsers: users.length,
      users,
    };
  }

  hasUsers() {
    return this.users.size > 0;
  }

  getCurrentUser(): AppUserSummary | undefined {
    const preferredUsername = process.env.JIRA_DEFAULT_USER?.trim().toLowerCase();
    if (preferredUsername) {
      const preferredUser = this.users.get(preferredUsername);
      if (preferredUser) {
        return preferredUser;
      }
    }

    return this.listUsers().users[0];
  }

  private toAppUserId(jiraUsername: string) {
    return `jira:${jiraUsername.toLowerCase()}`;
  }
}