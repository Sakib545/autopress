import { prisma } from '@/lib/db';
import { PageHeader, TableWrap } from '@/components/admin/stat-card';
import { Th, Td, Field, Text, Area, Select, Check, Section } from '@/components/admin/form-fields';
import { ActionForm, ActionButton } from '@/components/admin/action-form';
import { Badge } from '@/components/ui/badge';
import { saveCategoryAction, deleteCategoryAction } from '@/actions/catalog';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Categories' };

export default async function CategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { parent: { select: { name: true } }, _count: { select: { articles: true } } },
  });

  const parentOptions = [{ value: '', label: 'No parent (top level)' },
    ...categories.map((c) => ({ value: c.id, label: c.name }))];

  return (
    <>
      <PageHeader title="Categories" description="Categories drive the URL structure, topic discovery prompts and homepage sections." />

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Add category" className="lg:col-span-1">
          <ActionForm action={saveCategoryAction} submitLabel="Save category" className="space-y-4">
            <Field label="Name"><Text name="name" required placeholder="AI Video Tools" /></Field>
            <Field label="Description" hint="Shown on the category page and used as SEO context.">
              <Area name="description" rows={3} />
            </Field>
            <Field label="Parent"><Select name="parentId" options={parentOptions} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sort order"><Text name="sortOrder" type="number" defaultValue={0} /></Field>
            </div>
            <Field label="SEO title"><Text name="seoTitle" /></Field>
            <Field label="SEO description"><Text name="seoDesc" /></Field>
            <Check name="isIndexable" label="Allow indexing" defaultChecked />
          </ActionForm>
        </Section>

        <div className="lg:col-span-2">
          {categories.length === 0 ? (
            <div className="card p-6 text-sm text-ink-500">No categories yet. Add one, or run <code>npm run db:seed</code>.</div>
          ) : (
            <TableWrap>
              <thead><tr><Th>Name</Th><Th>Slug</Th><Th>Articles</Th><Th>Indexed</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <p className="font-medium">{c.name}</p>
                      {c.parent && <p className="text-xs text-ink-500">under {c.parent.name}</p>}
                    </Td>
                    <Td className="font-mono text-xs text-ink-500">/category/{c.slug}</Td>
                    <Td>{c._count.articles}</Td>
                    <Td>
                      <Badge tone={c.isIndexable && c._count.articles > 0 ? 'green' : 'neutral'}>
                        {c._count.articles === 0 ? 'empty — noindex' : c.isIndexable ? 'indexed' : 'noindex'}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <ActionButton action={deleteCategoryAction} label="Delete" variant="danger" fields={{ id: c.id }}
                        confirmText={`Delete "${c.name}"? Articles will become uncategorised.`} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          <p className="mt-3 text-xs text-ink-500">
            Empty categories are excluded from the sitemap automatically, regardless of the indexing switch.
          </p>
        </div>
      </div>
    </>
  );
}
