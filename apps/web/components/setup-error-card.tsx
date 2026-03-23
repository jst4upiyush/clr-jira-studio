import { SectionCard } from './section-card';

const defaultSteps = [
  'Start local Jira, Postgres, the API, the web app, and the worker with `pnpm dev` from the repository root.',
  'If Jira was just started, wait a few minutes for Atlassian startup to finish, then refresh the page. During warm-up the app can show a Jira 503 setup card even though the local stack is otherwise running.',
  'Verify the root .env file contains JIRA_BASE_URL, JIRA_PAT, JIRA_DEFAULT_USER, POSTGRES_PASSWORD, ATL_JDBC_PASSWORD, and NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api.',
  'Restart the API and web app after changing environment variables.',
];

export function SetupErrorCard({ title, message, steps = defaultSteps }: { title: string; message: string; steps?: string[] }) {
  return (
    <SectionCard title={title} subtitle="The app is running, but Jira-backed setup is incomplete.">
      <div className="space-y-4 text-sm text-slate-700">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">{message}</div>
        <div>
          <div className="font-medium text-slate-900">What to check</div>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}