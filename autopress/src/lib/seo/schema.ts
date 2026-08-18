import { env } from '../env';

type ArticleSchemaInput = {
  title: string;
  description: string;
  slug: string;
  categorySlug: string;
  imageUrl?: string | null;
  publishedAt?: Date | null;
  updatedAt?: Date | null;
  authorName?: string | null;
  authorSlug?: string | null;
  siteName: string;
};

export function articleSchema(a: ArticleSchemaInput) {
  const url = `${env.siteUrl}/${a.categorySlug}/${a.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title.slice(0, 110),
    description: a.description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    ...(a.imageUrl ? { image: [absolute(a.imageUrl)] } : {}),
    datePublished: a.publishedAt?.toISOString(),
    dateModified: (a.updatedAt ?? a.publishedAt)?.toISOString(),
    ...(a.authorName
      ? { author: { '@type': 'Person', name: a.authorName, ...(a.authorSlug ? { url: `${env.siteUrl}/author/${a.authorSlug}` } : {}) } }
      : {}),
    publisher: { '@type': 'Organization', name: a.siteName, url: env.siteUrl },
  };
}

export function breadcrumbSchema(trail: { name: string; href: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: `${env.siteUrl}${t.href}`,
    })),
  };
}

/** Only ever called when the rendered article actually shows these FAQs. */
export function faqSchema(faqs: { question: string; answer: string }[]) {
  if (!faqs.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

export function organizationSchema(siteName: string, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteName,
    url: env.siteUrl,
    description,
  };
}

function absolute(url: string) {
  return url.startsWith('http') ? url : `${env.siteUrl}${url}`;
}
