import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { publicWhere, cardSelect } from '@/lib/queries';
import { buildMetadata } from '@/lib/seo/metadata';
import { ArticleCard } from '@/components/site/article-card';
import { Breadcrumbs } from '@/components/site/breadcrumbs';
import { Badge } from '@/components/ui/badge';

export const revalidate = 3600;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const [author, settings] = await Promise.all([prisma.author.findUnique({ where: { slug } }), getSettings()]);
  if (!author) return { title: 'Not found' };
  return buildMetadata({
    title: author.name,
    description: author.bio ?? `Articles by ${author.name}.`,
    path: `/author/${author.slug}`,
    imageUrl: author.imageUrl,
    siteName: settings.siteName,
  });
}

export default async function AuthorPage({ params }: Params) {
  const { slug } = await params;
  const author = await prisma.author.findUnique({ where: { slug } });
  if (!author) notFound();

  const articles = await prisma.article.findMany({
    where: publicWhere({ authorId: author.id }),
    orderBy: { publishedAt: 'desc' },
    take: 24,
    select: cardSelect,
  });

  const social = (author.socialLinks ?? {}) as Record<string, string>;

  return (
    <div className="container-page py-12">
      <Breadcrumbs trail={[{ name: 'Home', href: '/' }, { name: author.name, href: `/author/${author.slug}` }]} />

      <header className="flex flex-col gap-6 border-b rule pb-10 sm:flex-row sm:items-start">
        {author.imageUrl && (
          <Image src={author.imageUrl} alt="" width={96} height={96} className="h-24 w-24 rounded-full object-cover" />
        )}
        <div className="max-w-2xl">
          <h1 className="font-serif text-4xl">{author.name}</h1>
          {author.bio && <p className="mt-3 leading-relaxed text-ink-600 dark:text-ink-400">{author.bio}</p>}

          {author.expertise.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {author.expertise.map((e) => <Badge key={e} tone="blue">{e}</Badge>)}
            </div>
          )}

          {Object.keys(social).length > 0 && (
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              {Object.entries(social).map(([label, href]) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer me"
                  className="capitalize text-accent-700 hover:underline dark:text-accent-400">{label}</a>
              ))}
            </div>
          )}

          {!author.isHuman && (
            <p className="mt-5 rounded-lg bg-ink-50 px-4 py-3 text-xs leading-relaxed text-ink-600 dark:bg-ink-900 dark:text-ink-400">
              This is an editorial identity, not a person. Articles under this byline are AI-assisted and produced under our published editorial and AI content policies. No claim of personal product testing is made.
            </p>
          )}
        </div>
      </header>

      <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((a) => <ArticleCard key={a.id} article={a} />)}
      </div>
    </div>
  );
}
