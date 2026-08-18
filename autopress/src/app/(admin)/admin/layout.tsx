import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { auth, ROLE_RANK } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { AdminSidebar } from '@/components/admin/sidebar';
import { ThemeToggle } from '@/components/ui/theme-toggle';

// The dashboard is never indexed and never statically cached.
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  // Single gate for the whole dashboard. Every mutation re-checks with requireRole().
  if (!session?.user?.id) redirect('/login');
  if ((ROLE_RANK[session.user.role] ?? -1) < ROLE_RANK.AUTHOR) {
    redirect('/?error=insufficient-permissions');
  }

  const settings = await getSettings();

  return (
    <div className="flex min-h-screen bg-ink-50/70 dark:bg-transparent">
      <AdminSidebar siteName={settings.siteName} userEmail={session.user.email ?? ''} />
      <div className="min-w-0 flex-1">
        <div className="flex justify-end border-b rule bg-white/80 px-4 py-2 backdrop-blur-xl dark:bg-ink-950/80 lg:hidden">
          <ThemeToggle />
        </div>
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
      </div>
    </div>
  );
}
