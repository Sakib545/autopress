import type { Metadata } from 'next';
import './globals.css';
import { getSettings } from '@/lib/settings';
import { env } from '@/lib/env';

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    metadataBase: new URL(env.siteUrl),
    title: { default: s.siteName, template: `%s — ${s.siteName}` },
    description: s.siteDescription,
    openGraph: { siteName: s.siteName, type: 'website', locale: 'en_US' },
    twitter: { card: 'summary_large_image' },
  };
}

/** Applies the stored theme before paint so dark mode never flashes. */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&d))document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
