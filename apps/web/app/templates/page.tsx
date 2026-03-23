import { SetupErrorCard } from '@/components/setup-error-card';
import { getSession, getTemplates } from '@/lib/api';
import { TemplatesPageClient } from './templates-page-client';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  try {
    const [templates, session] = await Promise.all([getTemplates(), getSession().catch(() => null)]);

    return (
      <TemplatesPageClient
        initialTemplates={templates}
        currentUserId={session?.user?.id}
        currentUserDisplayName={session?.user?.displayName}
      />
    );
  } catch (error) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-semibold">Templates</h1>
          <p className="text-slate-600">Team-owned creation templates with optional public publishing.</p>
        </header>

        <SetupErrorCard
          title="Template workspace is not ready yet"
          message={error instanceof Error ? error.message : 'Failed to load templates from the API.'}
        />
      </div>
    );
  }
}
