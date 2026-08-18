import { getSettings, integrationStatus } from '@/lib/settings';
import { env } from '@/lib/env';
import { PageHeader } from '@/components/admin/stat-card';
import { Field, Text, Area, Select, Check, Section } from '@/components/admin/form-fields';
import { ActionForm } from '@/components/admin/action-form';
import { Badge } from '@/components/ui/badge';
import { saveSettingsAction } from '@/actions/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Site settings' };

export default async function SettingsPage() {
  const s = await getSettings();
  const status = integrationStatus();

  return (
    <>
      <PageHeader
        title="Site settings"
        description="These values drive topic discovery, the writing prompt, scheduling and SEO. Secrets are never stored here — they stay in environment variables."
      />

      <ActionForm action={saveSettingsAction} submitLabel="Save all settings" pendingLabel="Saving…" className="space-y-6">
        <Section title="Identity">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Site name"><Text name="siteName" defaultValue={s.siteName} required /></Field>
            <Field label="Target country"><Text name="targetCountry" defaultValue={s.targetCountry} /></Field>
            <Field label="Site description" className="sm:col-span-2">
              <Area name="siteDescription" defaultValue={s.siteDescription} rows={2} />
            </Field>
          </div>
        </Section>

        <Section title="Niche & audience" description="Discovery generates ideas from these. The more specific, the less generic the output.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Primary niche"><Text name="primaryNiche" defaultValue={s.primaryNiche} required /></Field>
            <Field label="Secondary niches" hint="Comma separated.">
              <Text name="secondaryNiches" defaultValue={s.secondaryNiches.join(', ')} />
            </Field>
            <Field label="Content language" hint="ISO code, e.g. en."><Text name="contentLanguage" defaultValue={s.contentLanguage} /></Field>
            <Field label="Target audience"><Text name="targetAudience" defaultValue={s.targetAudience} /></Field>
            <Field label="Writing tone" className="sm:col-span-2" hint="Injected verbatim into the writing prompt.">
              <Area name="writingTone" defaultValue={s.writingTone} rows={2} />
            </Field>
            <Field label="Blocked topics" className="sm:col-span-2"
              hint="Comma separated. Topics matching these are rejected at discovery. Keep high-risk YMYL categories here unless you have expert review.">
              <Area name="blockedTopics" defaultValue={s.blockedTopics.join(', ')} rows={2} />
            </Field>
            <Field label="Preferred sources" className="sm:col-span-2" hint="Comma separated. Research favours these domains and source types.">
              <Area name="preferredSources" defaultValue={s.preferredSources.join(', ')} rows={2} />
            </Field>
          </div>
        </Section>

        <Section title="Content standards">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Minimum words"><Text name="articleMinWords" type="number" defaultValue={s.articleMinWords} min={300} max={6000} /></Field>
            <Field label="Maximum words"><Text name="articleMaxWords" type="number" defaultValue={s.articleMaxWords} min={500} max={12000} /></Field>
            <Field label="Minimum quality score" hint="0–100. Articles below this never auto-publish.">
              <Text name="minQualityScore" type="number" defaultValue={s.minQualityScore} min={0} max={100} />
            </Field>
            <Field label="Max rewrite attempts" hint="Then it goes to manual review.">
              <Text name="maxRewriteAttempts" type="number" defaultValue={s.maxRewriteAttempts} min={0} max={5} />
            </Field>
            <Field label="Duplicate threshold" hint="0.5–0.99 cosine similarity. Higher accepts more near-duplicates.">
              <Text name="duplicateThreshold" type="number" step="0.01" defaultValue={s.duplicateThreshold} />
            </Field>
            <Field label="Internal links per 1,000 words">
              <Text name="maxInternalLinksPer1000Words" type="number" defaultValue={s.maxInternalLinksPer1000Words} min={0} max={20} />
            </Field>
          </div>
        </Section>

        <Section title="Search intent mix" description="Target share of newly discovered topics. Discovery rebalances toward whichever intent is underrepresented.">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Informational %"><Text name="ratioInformational" type="number" defaultValue={s.intentRatios.INFORMATIONAL ?? 40} min={0} max={100} /></Field>
            <Field label="Commercial %"><Text name="ratioCommercial" type="number" defaultValue={s.intentRatios.COMMERCIAL ?? 30} min={0} max={100} /></Field>
            <Field label="Comparison %"><Text name="ratioComparison" type="number" defaultValue={s.intentRatios.COMPARISON ?? 20} min={0} max={100} /></Field>
            <Field label="News %"><Text name="ratioNews" type="number" defaultValue={s.intentRatios.NEWS ?? 10} min={0} max={100} /></Field>
          </div>
        </Section>

        <Section title="Publishing">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Articles per day" hint="0 pauses new generation without disabling the rest of the automation.">
              <Text name="articlesPerDay" type="number" defaultValue={s.articlesPerDay} min={0} max={24} />
            </Field>
            <Field label="Publishing times" hint="24h HH:MM, comma separated. Server timezone.">
              <Text name="publishTimes" defaultValue={s.publishTimes.join(', ')} />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-6">
            <Check name="automationEnabled" label="Automation enabled" defaultChecked={s.automationEnabled} />
            <Check name="autoPublish" label="Auto publish articles that pass review" defaultChecked={s.autoPublish} />
          </div>
        </Section>

        <Section title="SEO & monetization">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tag index threshold" hint="Tag pages stay noindex until they have this many articles.">
              <Text name="tagIndexThreshold" type="number" defaultValue={s.tagIndexThreshold} min={1} max={100} />
            </Field>
            <Field label="Monthly AI budget (USD)" hint="0 disables the cap.">
              <Text name="monthlyBudgetUsd" type="number" step="1" defaultValue={s.monthlyBudgetUsd} min={0} />
            </Field>
            <Field label="Affiliate disclosure" className="sm:col-span-2"
              hint="Shown on every article containing at least one affiliate link.">
              <Area name="affiliateDisclosure" defaultValue={s.affiliateDisclosure} rows={3} />
            </Field>
          </div>
        </Section>
        <Section title="Short-form video"
          description="Generated by MoneyPrinterTurbo, an external service. Article publishing never waits on it — if the service is down, articles publish normally and video jobs retry on their own.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Video format">
              <Select name="videoAspect" defaultValue={s.videoAspect}
                options={[
                  { value: '9:16', label: '9:16 — vertical (TikTok, Reels, Shorts)' },
                  { value: '16:9', label: '16:9 — landscape (YouTube)' },
                  { value: '1:1', label: '1:1 — square' },
                ]} />
            </Field>
            <Field label="Footage source">
              <Select name="videoSource" defaultValue={s.videoSource}
                options={[
                  { value: 'pexels', label: 'Pexels' },
                  { value: 'pixabay', label: 'Pixabay' },
                  { value: 'local', label: 'Local library' },
                ]} />
            </Field>
            <Field label="Narration language" hint="Passed straight to MoneyPrinterTurbo.">
              <Text name="videoLanguage" defaultValue={s.videoLanguage} />
            </Field>
            <Field label="Voice" hint="MPT voice name, e.g. en-US-JennyNeural. Empty uses its default.">
              <Text name="videoVoice" defaultValue={s.videoVoice} />
            </Field>
            <Field label="Maximum videos per day" hint="0 removes the cap. Protects your stock-footage API quota.">
              <Text name="videoMaxPerDay" type="number" defaultValue={s.videoMaxPerDay} min={0} max={50} />
            </Field>
            <Field label="Variations per article"><Text name="videoCount" type="number" defaultValue={s.videoCount} min={1} max={5} /></Field>
            <Field label="Eligible categories" className="sm:col-span-2"
              hint="Comma-separated category names. Leave empty to allow every category.">
              <Area name="videoCategories" defaultValue={s.videoCategories.join(', ')} rows={2} />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-6">
            <Check name="videoEnabled" label="Auto video generation" defaultChecked={s.videoEnabled} />
            <Check name="videoOnPublish" label="Generate when an article is published" defaultChecked={s.videoOnPublish} />
            <Check name="videoSubtitles" label="Burn in subtitles" defaultChecked={s.videoSubtitles} />
            <Check name="videoBgMusic" label="Background music" defaultChecked={s.videoBgMusic} />
          </div>
        </Section>
      </ActionForm>

      <Section title="Integrations" description="Read-only. Configured through environment variables so keys never reach the database or the browser." className="mt-6">
        <ul className="space-y-3 text-sm">
          {Object.entries(status).map(([key, value]) => (
            <li key={key} className="flex items-center justify-between border-b rule pb-3 last:border-0 last:pb-0">
              <div>
                <p className="font-medium capitalize">{key}</p>
                <p className="text-xs text-ink-500">provider: {value.provider}</p>
              </div>
              <Badge tone={value.configured ? 'green' : 'amber'}>{value.configured ? 'configured' : 'using fallback'}</Badge>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-500">
          Public site URL: <code>{env.siteUrl}</code>. Set <code>NEXT_PUBLIC_SITE_URL</code> in production or canonical
          URLs and the sitemap will point at localhost.
        </p>
      </Section>
    </>
  );
}
