'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { updateSettings } from '@/lib/settings';
import { logError } from '@/lib/logging';
import type { ActionState } from './topics';

const csv = (v: FormDataEntryValue | null) =>
  String(v ?? '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

const schema = z.object({
  siteName: z.string().min(1).max(80),
  siteDescription: z.string().min(1).max(400),
  primaryNiche: z.string().min(1).max(120),
  secondaryNiches: z.array(z.string().max(80)).max(10),
  targetCountry: z.string().max(60),
  contentLanguage: z.string().max(10),
  targetAudience: z.string().max(300),
  writingTone: z.string().max(400),
  articleMinWords: z.number().int().min(300).max(6000),
  articleMaxWords: z.number().int().min(500).max(12000),
  articlesPerDay: z.number().int().min(0).max(24),
  minQualityScore: z.number().int().min(0).max(100),
  maxRewriteAttempts: z.number().int().min(0).max(5),
  publishTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1).max(24),
  blockedTopics: z.array(z.string().max(80)).max(50),
  preferredSources: z.array(z.string().max(120)).max(50),
  autoPublish: z.boolean(),
  automationEnabled: z.boolean(),
  duplicateThreshold: z.number().min(0.5).max(0.99),
  monthlyBudgetUsd: z.number().min(0).max(100000),
  tagIndexThreshold: z.number().int().min(1).max(100),
  affiliateDisclosure: z.string().max(600),
  maxInternalLinksPer1000Words: z.number().int().min(0).max(20),
  intentRatios: z.record(z.number().min(0).max(100)),
  videoEnabled: z.boolean(),
  videoOnPublish: z.boolean(),
  videoAspect: z.enum(['9:16', '16:9', '1:1']),
  videoSource: z.enum(['pexels', 'pixabay', 'local']),
  videoLanguage: z.string().max(10),
  videoVoice: z.string().max(80),
  videoSubtitles: z.boolean(),
  videoBgMusic: z.boolean(),
  videoCategories: z.array(z.string().max(80)).max(50),
  videoMaxPerDay: z.number().int().min(0).max(50),
  videoCount: z.number().int().min(1).max(5),
}).refine((v) => v.articleMaxWords > v.articleMinWords, {
  message: 'Maximum word count must be greater than the minimum.',
});

export async function saveSettingsAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('ADMIN');

    const parsed = schema.safeParse({
      siteName: formData.get('siteName'),
      siteDescription: formData.get('siteDescription'),
      primaryNiche: formData.get('primaryNiche'),
      secondaryNiches: csv(formData.get('secondaryNiches')),
      targetCountry: formData.get('targetCountry'),
      contentLanguage: formData.get('contentLanguage'),
      targetAudience: formData.get('targetAudience'),
      writingTone: formData.get('writingTone'),
      articleMinWords: Number(formData.get('articleMinWords')),
      articleMaxWords: Number(formData.get('articleMaxWords')),
      articlesPerDay: Number(formData.get('articlesPerDay')),
      minQualityScore: Number(formData.get('minQualityScore')),
      maxRewriteAttempts: Number(formData.get('maxRewriteAttempts')),
      publishTimes: csv(formData.get('publishTimes')),
      blockedTopics: csv(formData.get('blockedTopics')),
      preferredSources: csv(formData.get('preferredSources')),
      autoPublish: formData.get('autoPublish') === 'on',
      automationEnabled: formData.get('automationEnabled') === 'on',
      duplicateThreshold: Number(formData.get('duplicateThreshold')),
      monthlyBudgetUsd: Number(formData.get('monthlyBudgetUsd')),
      tagIndexThreshold: Number(formData.get('tagIndexThreshold')),
      affiliateDisclosure: formData.get('affiliateDisclosure'),
      maxInternalLinksPer1000Words: Number(formData.get('maxInternalLinksPer1000Words')),
      intentRatios: {
        INFORMATIONAL: Number(formData.get('ratioInformational')),
        COMMERCIAL: Number(formData.get('ratioCommercial')),
        COMPARISON: Number(formData.get('ratioComparison')),
        NEWS: Number(formData.get('ratioNews')),
      },
      videoEnabled: formData.get('videoEnabled') === 'on',
      videoOnPublish: formData.get('videoOnPublish') === 'on',
      videoAspect: String(formData.get('videoAspect') ?? '9:16'),
      videoSource: String(formData.get('videoSource') ?? 'pexels'),
      videoLanguage: formData.get('videoLanguage'),
      videoVoice: String(formData.get('videoVoice') ?? ''),
      videoSubtitles: formData.get('videoSubtitles') === 'on',
      videoBgMusic: formData.get('videoBgMusic') === 'on',
      videoCategories: csv(formData.get('videoCategories')),
      videoMaxPerDay: Number(formData.get('videoMaxPerDay')),
      videoCount: Number(formData.get('videoCount')),
    });

    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues.map((i) => i.message).join(' ') };
    }

    await updateSettings(parsed.data, 'general');
    revalidatePath('/admin/settings');
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Settings saved. Cached values refresh within 60 seconds.' };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:saveSettings', error: err }) };
  }
}

/** Quick toggles used from the automation screen. */
export async function toggleAutomationAction(formData: FormData): Promise<ActionState> {
  try {
    await requireRole('ADMIN');
    const field = String(formData.get('field') ?? '');
    const value = formData.get('value') === 'true';
    if (field !== 'automationEnabled' && field !== 'autoPublish') {
      return { ok: false, message: 'Unknown toggle.' };
    }
    await updateSettings({ [field]: value }, 'publishing');
    revalidatePath('/admin/automation');
    revalidatePath('/admin');
    return { ok: true, message: `${field === 'autoPublish' ? 'Auto publish' : 'Automation'} turned ${value ? 'on' : 'off'}.` };
  } catch (err) {
    return { ok: false, message: await logError({ scope: 'action:toggleAutomation', error: err }) };
  }
}
