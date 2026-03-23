import { SectionCard } from '@/components/section-card';
import { SetupErrorCard } from '@/components/setup-error-card';
import type { JiraUserSyncResponse } from '@jira-idea-studio/shared';
import { getAppUsers, getJiraStatus, getSession, getSyncedUsers } from '@/lib/api';

export const dynamic = 'force-dynamic';

const emptySyncedUsers = (): JiraUserSyncResponse => ({
  generatedAt: new Date().toISOString(),
  projectCount: 0,
  totalUniqueUsers: 0,
  projects: [],
});

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default async function SettingsPage() {
  try {
    const [jiraStatus, session, appUsers] = await Promise.all([getJiraStatus(), getSession(), getAppUsers()]);
    let syncedUsers = emptySyncedUsers();
    let jiraSetupMessage: string | null = !jiraStatus.configured ? jiraStatus.message : session.message ?? null;

    if (jiraStatus.configured) {
      try {
        syncedUsers = await getSyncedUsers();
      } catch (error) {
        jiraSetupMessage = toErrorMessage(error, 'Failed to load Jira user sync details.');
      }
    }

    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-semibold">Settings</h1>
          <p className="text-slate-600">Connection, synced identity, and governance controls.</p>
        </header>

        {jiraSetupMessage ? (
          <SetupErrorCard title="Jira-backed identity is still in setup mode" message={jiraSetupMessage} />
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Jira connection">
            <div className="space-y-2 text-sm text-slate-700">
              <p>Status: {jiraStatus.configured ? 'Configured' : 'Setup required'}</p>
              <p>Base URL: {jiraStatus.baseUrl ?? 'Not configured yet'}</p>
              <p>Default Jira user: {jiraStatus.defaultUser ?? 'Not configured yet'}</p>
              <p>Visible Jira projects: {syncedUsers.projectCount}</p>
              <p>Total unique Jira users discovered: {syncedUsers.totalUniqueUsers}</p>
              <p>Last sync: {syncedUsers.generatedAt ? new Date(syncedUsers.generatedAt).toLocaleString() : 'Not synced yet'}</p>
              {jiraStatus.missingVariables.length ? (
                <p>Missing env vars: {jiraStatus.missingVariables.join(', ')}</p>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="Current app session">
            <div className="space-y-2 text-sm text-slate-700">
              <p>
                <span className="font-medium">Auth mode:</span> {session.authMode}
              </p>
              {session.user ? (
                <>
                  <p>
                    <span className="font-medium">Display name:</span> {session.user.displayName}
                  </p>
                  <p>
                    <span className="font-medium">Jira username:</span> {session.user.jiraUsername}
                  </p>
                  <p>
                    <span className="font-medium">Project access:</span> {session.user.projectKeys.join(', ') || 'None'}
                  </p>
                </>
              ) : (
                <p>{session.message ?? 'No Jira-backed session is available yet.'}</p>
              )}
              <p>
                <span className="font-medium">Synced users in session store:</span> {session.syncedUserCount}
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Provisioned app users">
            <div className="space-y-3 text-sm text-slate-700">
              <p>{appUsers.totalUsers} Jira-backed users are currently provisioned in the web app session store.</p>
              <div className="space-y-2">
                {appUsers.users.map((user) => (
                  <div key={user.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="font-medium">{user.displayName}</div>
                    <div className="text-xs text-slate-500">{user.jiraUsername} · Projects: {user.projectKeys.join(', ')}</div>
                    <div className="mt-1 text-xs text-slate-500">Roles: {user.roleNames.join(', ')}</div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Generation providers">
            <p className="text-sm text-slate-700">Register Copilot instruction packs, script runners, or remote agent endpoints.</p>
          </SectionCard>
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-semibold">Settings</h1>
          <p className="text-slate-600">Connection, synced identity, and governance controls.</p>
        </header>

        <SetupErrorCard
          title="Settings could not reach Jira yet"
          message={error instanceof Error ? error.message : 'Failed to load Jira sync and session information.'}
        />
      </div>
    );
  }
}
