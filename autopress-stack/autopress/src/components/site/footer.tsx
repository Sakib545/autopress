import Link from 'next/link';
import { getSettings } from '@/lib/settings';

const POLICY_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/editorial-policy', label: 'Editorial Policy' },
  { href: '/ai-content-policy', label: 'AI Content Policy' },
  { href: '/corrections-policy', label: 'Corrections' },
  { href: '/affiliate-disclosure', label: 'Affiliate Disclosure' },
  { href: '/privacy-policy', label: 'Privacy' },
  { href: '/contact', label: 'Contact' },
];

const BROWSE_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/search', label: 'Search' },
  { href: '/sitemap.xml', label: 'Sitemap' },
];

const footerLink =
  'text-ink-600 underline-offset-4 transition-colors hover:text-ink-900 hover:underline dark:text-ink-400 dark:hover:text-ink-100';

export async function SiteFooter() {
  const settings = await getSettings();
  return (
    <footer className="mt-24 border-t rule bg-ink-50/80 dark:bg-ink-900/40">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-lg bg-accent-600 font-serif text-sm font-semibold text-white shadow-card"
            >
              {settings.siteName.trim().charAt(0).toUpperCase() || 'A'}
            </span>
            <p className="font-serif text-lg font-semibold">{settings.siteName}</p>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-600 dark:text-ink-400">{settings.siteDescription}</p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-ink-600 shadow-card ring-1 ring-inset ring-black/[0.04] dark:bg-ink-900 dark:text-ink-400 dark:shadow-none dark:ring-white/[0.06]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            AI-assisted, human-reviewed
          </p>
        </div>

        <div>
          <p className="eyebrow mb-3">Transparency</p>
          <ul className="space-y-2 text-sm">
            {POLICY_LINKS.map((l) => (
              <li key={l.href}><Link href={l.href} className={footerLink}>{l.label}</Link></li>
            ))}
          </ul>
        </div>

        <div>
          <p className="eyebrow mb-3">Browse</p>
          <ul className="space-y-2 text-sm">
            {BROWSE_LINKS.map((l) => (
              <li key={l.href}>
                {l.href.endsWith('.xml')
                  ? <a href={l.href} className={footerLink}>{l.label}</a>
                  : <Link href={l.href} className={footerLink}>{l.label}</Link>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t rule py-6">
        <p className="container-page text-xs leading-relaxed text-ink-500">
          © {new Date().getFullYear()} {settings.siteName}. Articles are produced with AI assistance under human editorial policy and reviewed against sourced research.
        </p>
      </div>
    </footer>
  );
}
