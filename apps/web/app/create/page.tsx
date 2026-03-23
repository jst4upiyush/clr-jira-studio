import { getJiraStatus, getProjects, getTemplates } from '@/lib/api';
import { SetupErrorCard } from '@/components/setup-error-card';
import { CreatePageClient } from './page-client';

export const dynamic = 'force-dynamic';

export default async function CreatePage() {
  try {
    const [jiraStatus, templates] = await Promise.all([getJiraStatus(), getTemplates()]);

    if (!jiraStatus.configured) {
      return (
        <div className="space-y-6">
          <header>
            <h1 className="text-3xl font-semibold">Create work items</h1>
            <p className="text-slate-600">Finish the local Jira setup first, then this page can generate and submit drafts.</p>
          </header>

          <SetupErrorCard title="Jira-backed create flow is not ready yet" message={jiraStatus.message} />
        </div>
      );
    }

    const projects = await getProjects();

    return <CreatePageClient initialProjects={projects} initialTemplates={templates} />;
  } catch (error) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-semibold">Create work items</h1>
          <p className="text-slate-600">Finish the local Jira setup first, then this page can generate and submit drafts.</p>
        </header>

        <SetupErrorCard
          title="Jira-backed create flow is not ready yet"
          message={error instanceof Error ? error.message : 'Failed to load Jira projects for the create flow.'}
        />
      </div>
    );
  }
}
