import Link from 'next/link';
import { FolderKanban, PlusSquare, History, LayoutTemplate, Settings } from 'lucide-react';

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: FolderKanban },
  { href: '/create', label: 'Create', icon: PlusSquare },
  { href: '/history', label: 'History', icon: History },
  { href: '/templates', label: 'Templates', icon: LayoutTemplate },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="border-r border-slate-200 bg-white p-6">
      <div className="mb-8">
        <div className="text-xl font-semibold">Clr Jira Studio</div>
        <div className="text-sm text-slate-500">Scaffold</div>
      </div>
      <nav className="space-y-2">
        {links.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-slate-100">
            <Icon size={16} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
