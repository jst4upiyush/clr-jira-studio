import { SectionCard } from '@/components/section-card';
import { templates } from '@/lib/mock-data';

export default function TemplatesPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Templates</h1>
        <p className="text-slate-600">Team-owned creation templates with optional public publishing.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Available templates">
          <div className="space-y-3">
            {templates.map((template) => (
              <div key={template.id} className="rounded-xl border border-slate-200 p-4">
                <div className="font-medium">{template.name}</div>
                <div className="text-sm text-slate-500">{template.description}</div>
                <div className="mt-2 text-xs text-slate-500">Visibility: {template.visibility} · Status: {template.status}</div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Design notes">
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
            <li>Template should store prompt pack references and field defaults.</li>
            <li>Publication should create a new immutable template version.</li>
            <li>Public templates should likely be forkable, not globally editable.</li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
