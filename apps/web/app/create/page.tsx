import { getProjects, getTemplates } from '@/lib/api';
import { CreatePageClient } from './page-client';

export const dynamic = 'force-dynamic';

export default async function CreatePage() {
  const [projects, templates] = await Promise.all([getProjects(), getTemplates()]);

  return <CreatePageClient initialProjects={projects} initialTemplates={templates} />;
}
