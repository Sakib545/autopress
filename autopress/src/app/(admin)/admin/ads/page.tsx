import { prisma } from '@/lib/db';
import { PageHeader, TableWrap } from '@/components/admin/stat-card';
import { Th, Td, Field, Text, Area, Select, Check, Section } from '@/components/admin/form-fields';
import { ActionForm, ActionButton } from '@/components/admin/action-form';
import { Badge } from '@/components/ui/badge';
import { saveAdSlotAction, deleteAdSlotAction } from '@/actions/catalog';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ad slots' };

const PLACEMENTS = [
  { value: 'BELOW_INTRO', label: 'Below intro' },
  { value: 'MID_ARTICLE', label: 'Mid article' },
  { value: 'END_ARTICLE', label: 'End of article' },
  { value: 'SIDEBAR', label: 'Sidebar' },
  { value: 'HOMEPAGE_INLINE', label: 'Homepage inline' },
];

export default async function AdsPage() {
  const slots = await prisma.adSlot.findMany({ orderBy: [{ placement: 'asc' }, { name: 'asc' }] });

  return (
    <>
      <PageHeader
        title="Ad slots"
        description="Inactive slots render nothing at all — no placeholder, no layout shift. A slot only appears once you paste real ad code and activate it."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Add slot" className="lg:col-span-1">
          <ActionForm action={saveAdSlotAction} submitLabel="Save slot" className="space-y-4">
            <Field label="Name"><Text name="name" required placeholder="Article mid — AdSense" /></Field>
            <Field label="Placement"><Select name="placement" options={PLACEMENTS} /></Field>
            <Field label="Ad code" hint="Full HTML/script snippet from your ad network.">
              <Area name="adCode" rows={5} placeholder="<ins class=&quot;adsbygoogle&quot; …></ins>" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ad client"><Text name="adClient" placeholder="ca-pub-…" /></Field>
              <Field label="Ad unit ID"><Text name="adUnitId" /></Field>
            </div>
            <Field label="Minimum word count" hint="Skip this slot on short articles.">
              <Text name="minWordCount" type="number" defaultValue={0} min={0} />
            </Field>
            <Field label="Category IDs" hint="Comma separated. Empty means every category.">
              <Text name="categoryIds" />
            </Field>
            <Check name="isActive" label="Active" />
          </ActionForm>
        </Section>

        <div className="lg:col-span-2">
          {slots.length === 0 ? (
            <div className="card p-6 text-sm text-ink-500">
              No ad slots configured, so no ads render anywhere on the site.
            </div>
          ) : (
            <TableWrap>
              <thead><tr><Th>Slot</Th><Th>Placement</Th><Th>Min words</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody>
                {slots.map((s) => (
                  <tr key={s.id}>
                    <Td>
                      <p className="font-medium">{s.name}</p>
                      {s.adClient && <p className="text-xs text-ink-500">{s.adClient}</p>}
                      {!s.adCode && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">No ad code — will not render</p>}
                    </Td>
                    <Td className="whitespace-nowrap">{s.placement.toLowerCase().replace(/_/g, ' ')}</Td>
                    <Td>{s.minWordCount || '—'}</Td>
                    <Td><Badge tone={s.isActive && s.adCode ? 'green' : 'neutral'}>{s.isActive && s.adCode ? 'live' : 'off'}</Badge></Td>
                    <Td className="text-right">
                      <ActionButton action={deleteAdSlotAction} label="Delete" variant="danger" fields={{ id: s.id }}
                        confirmText={`Delete "${s.name}"?`} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          <p className="mt-3 text-xs text-ink-500">
            Layout reserves space only for active slots, which keeps Cumulative Layout Shift low. Sponsored articles are
            labelled separately on the article record, not here.
          </p>
        </div>
      </div>
    </>
  );
}
