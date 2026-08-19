/**
 * Deploy-time database bootstrap. Railway runs this as the pre-deploy step,
 * before the new container starts taking traffic.
 *
 * It creates the first admin account from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
 * when no account with that email exists yet. An existing account is never
 * touched, so a password changed from the dashboard survives every later
 * deploy. Nothing else is written: real articles come from the pipeline, not
 * from a seed.
 *
 * The password is never logged.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function ensureAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('[bootstrap] SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin bootstrap.');
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    console.log(`[bootstrap] admin ${email} already exists — left untouched.`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      name: 'Site Admin',
      role: 'ADMIN',
      passwordHash: await bcrypt.hash(password, 12),
      isActive: true,
    },
  });
  console.log(`[bootstrap] created admin ${email}`);
}

ensureAdmin()
  .catch((e) => {
    console.error('[bootstrap]', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
