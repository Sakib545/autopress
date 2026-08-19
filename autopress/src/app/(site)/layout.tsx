import { SiteHeader } from '@/components/site/header';
import { SiteFooter } from '@/components/site/footer';
import { organizationSchema } from '@/lib/seo/schema';
import { getSettings } from '@/lib/settings';
import { env } from '@/lib/env';

/** Every public page is rendered per request so navigation and content stay fresh. */
export const dynamic = 'force-dynamic';

const PUBLIC_LIGHT_THEME = "(function(){try{document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';}catch(e){}})();";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  return (
    <div id="site-shell" className="flex min-h-screen flex-col text-ink-900">
      <script dangerouslySetInnerHTML={{ __html: PUBLIC_LIGHT_THEME }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema(settings.siteName, settings.siteDescription)) }}
      />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
      {env.gaId && (
        <>
          <script async src={'https://www.googletagmanager.com/gtag/js?id=' + env.gaId} />
          <script
            dangerouslySetInnerHTML={{
              __html: "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','" + env.gaId + "');",
            }}
          />
        </>
      )}
    </div>
  );
}
