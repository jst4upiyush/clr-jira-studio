import { SectionCard } from '@/components/section-card';
import { getHistory } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const history = await getHistory();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">History</h1>
        <p className="text-slate-600">Shows what this app generated and what it submitted to Jira during the current runtime.</p>
      </header>

      <SectionCard title="Drafts and submissions" subtitle="Submitted snapshots remain immutable within the app history.">
        <div className="space-y-4">
          {history.drafts.length ? (
            history.drafts.map((draft) => {
              const submission = history.submissions.find((item) => item.draftSetId === draft.id);
              return (
                <div key={draft.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm text-slate-500">Draft {draft.id}</div>
                      <div className="text-lg font-semibold">{draft.items[0]?.title ?? draft.id}</div>
                      <div className="text-sm text-slate-600">
                        Scope: {draft.scope} · Template v{draft.templateVersion ?? 'n/a'} · Provider {draft.providerName}@{draft.providerVersion}
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{draft.status}</span>
                  </div>

                  {submission ? (
                    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                      <div className="font-medium">Submission {submission.id}</div>
                      <div>Status: {submission.status}</div>
                      <div>Accepted items: {submission.acceptedDraftItemIds.join(', ')}</div>
                      <div className="mt-2 space-y-1">
                        {submission.links.map((link) => (
                          <div key={link.localDraftId}>
                            {link.localDraftId} → {link.jiraKey ?? 'not created'} ({link.status})
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">
                      This draft has not been submitted yet.
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              No draft history yet. Once you generate one, this page stops being so dramatically empty.
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
