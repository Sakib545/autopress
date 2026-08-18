import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { signIn, auth } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { prisma } from '@/lib/db';
import { SubmitButton } from '@/components/ui/submit-button';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  if (session?.user?.id) redirect('/admin');

  const { error } = await searchParams;
  const settings = await getSettings().catch(() => ({ siteName: 'AutoPress' }));
  const userCount = await prisma.user.count().catch(() => -1);

  async function login(formData: FormData) {
    'use server';
    await signIn('credentials', {
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      redirectTo: '/admin',
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm card p-8">
        <h1 className="font-serif text-2xl">{settings.siteName}</h1>
        <p className="mt-1 text-sm text-ink-500">Sign in to the editorial dashboard.</p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-300">
            Incorrect email or password.
          </p>
        )}

        {userCount === 0 && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
            No users exist yet. Run <code className="font-mono">npm run db:seed</code> to create the first admin account.
          </p>
        )}
        {userCount === -1 && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-300">
            Cannot reach the database. Check <code className="font-mono">DATABASE_URL</code> and run <code className="font-mono">npm run db:push</code>.
          </p>
        )}

        <form action={login} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" required autoComplete="username" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
          <SubmitButton className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
        </form>
        <p className="mt-6 text-center text-xs text-ink-500"><Link href="/" className="hover:text-ink-900 dark:hover:text-ink-200">← Back to site</Link></p>
      </div>
    </div>
  );
}
