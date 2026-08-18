import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPolicy } from '@/content/policies';
import { markdownToHtml } from '@/lib/content/markdown';
import { getSettings } from '@/lib/settings';
import { buildMetadata } from '@/lib/seo/metadata';
import { Breadcrumbs } from './breadcrumbs';

export async function policyMetadata(slug: string): Promise<Metadata> {
  const policy = getPolicy(slug);
  const settings = await getSettings();
  if (!policy) return { title: 'Not found' };
  return buildMetadata({
    title: policy.title,
    description: policy.description,
    path: `/${policy.slug}`,
    siteName: settings.siteName,
  });
}

export async function PolicyPage({ slug }: { slug: string }) {
  const policy = getPolicy(slug);
  if (!policy) notFound();

  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-prose">
        <Breadcrumbs trail={[{ name: 'Home', href: '/' }, { name: policy.title, href: `/${policy.slug}` }]} />
        <h1 className="font-serif text-4xl">{policy.title}</h1>
        <p className="mt-3 text-lg text-ink-600 dark:text-ink-400">{policy.description}</p>
        <div className="article-body mt-8" dangerouslySetInnerHTML={{ __html: markdownToHtml(policy.body) }} />
      </div>
    </div>
  );
}
