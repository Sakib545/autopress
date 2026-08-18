import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { PageHeader, TableWrap, StatCard } from '@/components/admin/stat-card';
import { Th, Td, Field, Text, Area, Check, Section } from '@/components/admin/form-fields';
import { ActionForm, ActionButton } from '@/components/admin/action-form';
import { Badge } from '@/components/ui/badge';
import { saveAffiliateAction, deleteAffiliateAction } from '@/actions/catalog';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Affiliate links' };

export default async function AffiliatePage() {
  const [links, settings, tagged, broken] = await Promise.all([
    prisma.affiliateLink.findMany({ orderBy: { merchant: 'asc' }, include: { _count: { select: { externalLinks: true } } } }),
    getSettings(),
    prisma.externalLink.count({ where: { isAffiliate: true } }),
    prisma.externalLink.count({ where: { isAffiliate: true, status: 'BROKEN' } }),
  ]);

  return (
    <>
      <PageHeader
        title="Affiliate links"
        description="Outbound URLs matching a configured domain are rewritten at publish time. Rewriting is capped per article so pages never read as link farms."
      />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatCard label="Merchants" value={links.length} />
        <StatCard label="Affiliate links live" value={tagged} />
        <StatCard label="Broken" value={broken} tone={broken > 0 ? 'danger' : 'default'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Add merchant" className="lg:col-span-1">
          <ActionForm action={saveAffiliateAction} submitLabel="Save merchant" className="space-y-4">
            <Field label="Merchant"><Text name="merchant" required placeholder="Example Software" /></Field>
            <Field label="Domain" hint="Bare domain to match, e.g. example.com">
              <Text name="domain" required placeholder="example.com" />
            </Field>
            <Field label="Affiliate URL" hint="Used when no template is set.">
              <Text name="affiliateUrl" required placeholder="https://example.com/?ref=yourid" />
            </Field>
            <Field label="Tracking ID"><Text name="trackingId" placeholder="yourid-20" /></Field>
            <Field label="URL template" hint="Supports {url} and {trackingId}. Leave empty to use the affiliate URL as-is.">
              <Text name="urlTemplate" placeholder="{url}?tag={trackingId}" />
            </Field>
            <Field label="Categories" hint="Comma separated. Empty means all.">
              <Text name="categories" />
            </Field>
            <Field label="Max links per article"><Text name="maxPerArticle" type="number" defaultValue={3} min={0} max={20} /></Field>
            <Field label="Disclosure override"><Area name="disclosureText" rows={2} /></Field>
            <Check name="isActive" label="Active" defaultChecked />
          </ActionForm>
        </Section>

        <div className="lg:col-span-2">
          {links.length === 0 ? (
            <div className="card p-6 text-sm text-ink-500">
              No merchants configured. Until one exists, outbound links stay untouched and no disclosure is shown.
            </div>
          ) : (
            <TableWrap>
              <thead><tr><Th>Merchant</Th><Th>Domain</Th><Th>Links</Th><Th>Cap</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.id}>
                    <Td>
                      <p className="font-medium">{l.merchant}</p>
                      {l.trackingId && <p className="text-xs text-ink-500">{l.trackingId}</p>}
                    </Td>
                    <Td className="font-mono text-xs">{l.domain}</Td>
                    <Td>{l._count.externalLinks}</Td>
                    <Td>{l.maxPerArticle}</Td>
                    <Td><Badge tone={l.isActive ? 'green' : 'neutral'}>{l.isActive ? 'active' : 'paused'}</Badge></Td>
                    <Td className="text-right">
                      <ActionButton action={deleteAffiliateAction} label="Delete" variant="danger" fields={{ id: l.id }}
                        confirmText={`Remove ${l.merchant}? Existing links stay in place but stop being rewritten.`} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}

          <Section title="Disclosure" description="Rendered automatically on any article containing at least one affiliate link." className="mt-6">
            <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-700 dark:bg-ink-800/50 dark:text-ink-300">
              {settings.affiliateDisclosure}
            </p>
            <p className="mt-2 text-xs text-ink-500">Edit this in Site Settings. Removing it does not disable the tagging.</p>
          </Section>
        </div>
      </div>
    </>
  );
}
