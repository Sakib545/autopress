'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { enqueue } from '@/lib/queues';
import { hasRedis } from '@/lib/env';
import { runArticlePipeline, runTopicDiscovery, approveTopTopics } from '@/lib/pipeline';
import { getSettings } from '@/lib/settings';
import { logError } from '@/lib/logging';

export type ActionState = { ok: boolean; message: string };

const idSchema = z.object({ id: z.string().min(1) });

export async function discoverTopicsAction(): Promise<ActionState> {
  try {
    await requireRole('EDITOR');
    const settings = await getSettings();
    const result = await runTopicDiscovery();
    const approved = await approveTopTopics(settings.articlesPerDay);
    revalidatePath('/admin/topics');
    revalidatePath('/admin');
    return {
      ok: true,
      message: `Discovered ${result.created} new topic${result.created === 1 ? '' : 's'} (${result.duplicates} duplicate, ${result.rejected} rejected). Auto-approved ${approved.length}.`,
    };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:discoverTopics', error: err }) };
  }
}

export async function setTopicStatusAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('EDITOR');
    const id = String(formData.get('id') ?? '');
    const status = String(formData.get('status') ?? '');
    const allowed = ['NEW', 'APPROVED', 'REJECTED', 'QUEUED'];
    if (!id || !allowed.includes(status)) return { ok: false, message: 'Invalid request.' };

    await prisma.topic.update({
      where: { id },
      data: {
        status: status as never,
        approvedAt: status === 'APPROVED' ? new Date() : null,
        rejectionReason: status === 'REJECTED' ? 'Rejected by editor' : null,
      },
    });
    revalidatePath('/admin/topics');
    return { ok: true, message: `Topic marked ${status.toLowerCase()}.` };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:setTopicStatus', error: err }) };
  }
}

/**
 * Runs the full research → draft → review → SEO → links → image → schedule
 * chain. Uses the queue when Redis is configured; otherwise runs inline so a
 * single-process dev setup still works end to end.
 */
export async function generateArticleAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('EDITOR');
    const { id } = idSchema.parse({ id: formData.get('id') });

    if (hasRedis()) {
      const queued = await enqueue('research.build', { topicId: id });
      if (queued) {
        await prisma.topic.update({ where: { id }, data: { status: 'QUEUED' } });
        revalidatePath('/admin/topics');
        return { ok: true, message: 'Queued. The worker will research, write, review and schedule this article.' };
      }
    }

    const result = await runArticlePipeline(id);
    revalidatePath('/admin/topics');
    revalidatePath('/admin/articles');
    revalidatePath('/admin');

    if (result.status === 'FAILED') return { ok: false, message: result.error ?? 'Pipeline failed.' };
    if (result.status === 'MANUAL_REVIEW') {
      return { ok: true, message: `Sent to manual review (score ${result.qualityScore ?? 0}). ${result.steps.join(' · ')}` };
    }
    return { ok: true, message: `Done — score ${result.qualityScore}, scheduled ${result.scheduledFor?.toLocaleString() ?? ''}.` };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:generateArticle', error: err }) };
  }
}

export async function deleteTopicAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('ADMIN');
    const { id } = idSchema.parse({ id: formData.get('id') });
    await prisma.topic.delete({ where: { id } });
    revalidatePath('/admin/topics');
    return { ok: true, message: 'Topic deleted.' };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:deleteTopic', error: err }) };
  }
}
