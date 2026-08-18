'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { triggerJob, isTriggerableJob } from '@/lib/jobs';
import { logError } from '@/lib/logging';
import type { ActionState } from './topics';

export async function runJobAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('EDITOR');
    const job = String(formData.get('job') ?? '');
    if (!isTriggerableJob(job)) return { ok: false, message: `Unknown job "${job}".` };

    const result = await triggerJob(job);
    revalidatePath('/admin/automation');
    revalidatePath('/admin');

    if (result.mode === 'error') return { ok: false, message: result.error };
    if (result.mode === 'queued') return { ok: true, message: `${job} queued — the worker will pick it up.` };
    return { ok: true, message: `${job} ran inline: ${JSON.stringify(result.result)}` };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:runJob', error: err }) };
  }
}
