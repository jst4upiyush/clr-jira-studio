import { SectionCard } from '@/components/section-card';
import { getAppUsers, getSession, getSyncedUsers } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const syncedUsers = await getSyncedUsers();
  const [session, appUsers] = await Promise.all([getSession(), getAppUsers()]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Settings</h1>
        <p className="text-slate-600">Connection, synced identity, and governance controls.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Jira connection">
          <div className="space-y-2 text-sm text-slate-700">
            <p>Visible Jira projects: {syncedUsers.projectCount}</p>
            <p>Total unique Jira users discovered: {syncedUsers.totalUniqueUsers}</p>
            <p>Last sync: {new Date(syncedUsers.generatedAt).toLocaleString()}</p>
          </div>
        </SectionCard>

        <SectionCard title="Current app session">
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              <span className="font-medium">Display name:</span> {session.user.displayName}
            </p>
            <p>
              <span className="font-medium">Jira username:</span> {session.user.jiraUsername}
            </p>
            <p>
              <span className="font-medium">Auth mode:</span> {session.authMode}
            </p>
            <p>
              <span className="font-medium">Project access:</span> {session.user.projectKeys.join(', ') || 'None'}
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
}
