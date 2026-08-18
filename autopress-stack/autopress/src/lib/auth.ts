import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { env } from './env';

declare module 'next-auth' {
  interface Session {
    user: { id: string; role: string } & DefaultSession['user'];
  }
}

export const ROLE_RANK: Record<string, number> = { VIEWER: 0, AUTHOR: 1, EDITOR: 2, ADMIN: 3 };

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.nextAuthSecret,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: '/login', error: '/login' },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? '').toLowerCase().trim();
        const password = String(creds?.password ?? '');
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash || !user.isActive) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role?: string }).role ?? 'VIEWER';
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? '');
        session.user.role = String(token.role ?? 'VIEWER');
      }
      return session;
    },
  },
});

/** Throws unless the current session meets the minimum role. Use in every mutation. */
export async function requireRole(min: 'VIEWER' | 'AUTHOR' | 'EDITOR' | 'ADMIN' = 'EDITOR') {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || !role) throw new Error('UNAUTHENTICATED');
  if ((ROLE_RANK[role] ?? -1) < ROLE_RANK[min]) throw new Error('FORBIDDEN');
  return session.user;
}

export async function currentUser() {
  const session = await auth();
  return session?.user ?? null;
}
