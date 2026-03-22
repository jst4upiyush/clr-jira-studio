import './globals.css';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/sidebar';

export const metadata = {
  title: 'Clr Jira Studio',
  description: 'AI-assisted Jira epic, feature, and story creation dashboard.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen grid grid-cols-[260px_1fr]">
          <Sidebar />
          <main className="p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
