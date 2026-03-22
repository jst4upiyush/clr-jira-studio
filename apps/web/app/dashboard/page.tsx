import { SectionCard } from '@/components/section-card';
import { getHistory, getProjects, getSyncedUsers, getTemplates } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [projects, templates, history, syncedUsers] = await Promise.all([
    getProjects(),
    getTemplates(),
    getHistory(),
    getSyncedUsers(),
  ]);

  const syncByProjectKey = new Map(syncedUsers.projects.map((project) => [project.projectKey, project]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-slate-600">Live Jira projects, synced users, and recent app-side draft activity.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Projects visible to you" subtitle="Loaded live from Jira project metadata and role membership.">
          <div className="space-y-3">
            {projects.map((project) => (
              <div key={project.id} className="rounded-xl border border-slate-200 p-3">
                <div className="font-medium">{project.name}</div>
                <div className="text-sm text-slate-500">{project.jiraProjectKey} · {project.role}</div>
                <div className="mt-2 text-xs text-slate-500">
                  Levels: {project.supportedLevels.join(', ')} · Users synced: {syncByProjectKey.get(project.jiraProjectKey)?.uniqueUserCount ?? 0}
                </div>
                {syncByProjectKey.get(project.jiraProjectKey)?.roles.length ? (
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    {syncByProjectKey.get(project.jiraProjectKey)?.roles.slice(0, 3).map((role) => (
                      <div key={role.roleName}>
                        <span className="font-medium">{role.roleName}:</span>{' '}
                        {role.users.slice(0, 3).map((user) => user.displayName).join(', ') || 'No users'}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Published templates" subtitle="Current API-backed templates available for generation.">
          <div className="space-y-3">
            {templates.map((template) => (
              <div key={template.id} className="rounded-xl border border-slate-200 p-3">
                <div className="font-medium">{template.name}</div>
                <div className="text-sm text-slate-500">v{template.version} · {template.visibility}</div>
                <div className="mt-2 text-xs text-slate-500">Scopes: {template.supportedScopes.join(', ')}</div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Recent drafts" subtitle="This is app history, not a full mirror of Jira’s current state.">
          <div className="space-y-3">
            {history.drafts.length ? (
              history.drafts.slice(0, 5).map((entry) => (
                <div key={entry.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="font-medium">{entry.items[0]?.title ?? entry.id}</div>
                  <div className="text-sm text-slate-500">{entry.scope} · {new Date(entry.createdAt).toLocaleString()}</div>
                  <div className="mt-2 text-xs text-slate-500">Status: {entry.status}</div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                No drafts yet. The backlog is still enjoying its coffee break.
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
