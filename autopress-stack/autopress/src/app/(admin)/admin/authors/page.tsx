import { prisma } from '@/lib/db';
import { PageHeader, TableWrap } from '@/components/admin/stat-card';
import { Th, Td, Field, Text, Area, Check, Section } from '@/components/admin/form-fields';
import { ActionForm } from '@/components/admin/action-form';
import { Badge } from '@/components/ui/badge';
import { saveAuthorAction } from '@/actions/catalog';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Authors' };

export default async function AuthorsPage() {
  const authors = await prisma.author.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { articles: true } } },
  });

  return (
    <>
      <PageHeader
        title="Authors"
        description="Editorial identities used as bylines. Authors marked as human are the only ones permitted to carry first-person testing claims."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Add author" className="lg:col-span-1">
          <ActionForm action={saveAuthorAction} submitLabel="Save author" className="space-y-4">
            <Field label="Name"><Text name="name" required placeholder="Editorial Desk" /></Field>
            <Field label="Bio"><Area name="bio" rows={4} placeholder="Who they are and what they cover." /></Field>
            <Field label="Image URL"><Text name="imageUrl" placeholder="https://…" /></Field>
            <Field label="Expertise" hint="Comma separated."><Text name="expertise" placeholder="AI tools, video editing" /></Field>
            <Field label="Social links" hint='JSON, e.g. {"twitter":"https://x.com/…"}'>
              <Area name="socialLinks" rows={2} />
            </Field>
            <Check name="isActive" label="Active" defaultChecked />
            <Check name="isHuman" label="Human author (permits first-person testing claims)" />
          </ActionForm>
        </Section>

        <div className="lg:col-span-2">
          {authors.length === 0 ? (
            <div className="card p-6 text-sm text-ink-500">No authors yet. Seeding creates a default editorial identity.</div>
          ) : (
            <TableWrap>
              <thead><tr><Th>Name</Th><Th>Articles</Th><Th>Type</Th><Th>Status</Th></tr></thead>
              <tbody>
                {authors.map((a) => (
                  <tr key={a.id}>
                    <Td>
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-ink-500">/author/{a.slug}</p>
                      {a.expertise.length > 0 && <p className="mt-1 text-xs text-ink-500">{a.expertise.join(' · ')}</p>}
                    </Td>
                    <Td>{a._count.articles}</Td>
                    <Td><Badge tone={a.isHuman ? 'green' : 'blue'}>{a.isHuman ? 'human' : 'AI-assisted'}</Badge></Td>
                    <Td><Badge tone={a.isActive ? 'green' : 'neutral'}>{a.isActive ? 'active' : 'inactive'}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          <p className="mt-3 text-xs text-ink-500">
            The writing prompt reads this flag. AI-assisted bylines never generate sentences like “I tested this”, because
            no human did.
          </p>
        </div>
      </div>
    </>
  );
}
