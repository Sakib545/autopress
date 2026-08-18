import type { Metadata } from 'next';
import { env } from '../env';

export function buildMetadata(opts: {
  title: string;
  description: string;
  path: string;
  imageUrl?: string | null;
  siteName: string;
  type?: 'website' | 'article';
  publishedAt?: Date | null;
  modifiedAt?: Date | null;
  noindex?: boolean;
  canonical?: string | null;
}): Metadata {
  const url = opts.canonical ?? `${env.siteUrl}${opts.path}`;
  const image = opts.imageUrl ? (opts.imageUrl.startsWith('http') ? opts.imageUrl : `${env.siteUrl}${opts.imageUrl}`) : undefined;

  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    robots: opts.noindex
      ? { index: false, follow: true }
      : { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url,
      siteName: opts.siteName,
      type: opts.type ?? 'website',
      ...(image ? { images: [{ url: image, width: 1200, height: 630 }] } : {}),
      ...(opts.type === 'article'
        ? {
            publishedTime: opts.publishedAt?.toISOString(),
            modifiedTime: (opts.modifiedAt ?? opts.publishedAt)?.toISOString(),
          }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: opts.title,
      description: opts.description,
      ...(image ? { images: [image] } : {}),
    },
  };
}
