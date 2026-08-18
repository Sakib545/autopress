import type { ImageProvider, ImageSpec, GeneratedImage } from '../types';
import { env } from '../../env';

export class StockImageProvider implements ImageProvider {
  id = 'stock';
  isConfigured() {
    return env.unsplashKey.length > 0;
  }

  async generate(spec: ImageSpec): Promise<GeneratedImage> {
    if (!this.isConfigured()) throw new Error('Unsplash access key is not configured (UNSPLASH_ACCESS_KEY).');
    const query = encodeURIComponent(spec.category ? `${spec.category} abstract` : 'technology abstract');
    const res = await fetch(`https://api.unsplash.com/photos/random?query=${query}&orientation=landscape&content_filter=high`, {
      headers: { Authorization: `Client-ID ${env.unsplashKey}` },
    });
    if (!res.ok) throw new Error(`Unsplash ${res.status}`);
    const data = (await res.json()) as {
      urls: { regular: string };
      links: { html: string };
      user: { name: string; links: { html: string } };
      alt_description?: string;
      width: number;
      height: number;
    };
    return {
      url: data.urls.regular,
      altText: data.alt_description || `Stock photograph accompanying "${spec.title}"`,
      width: 1200,
      height: 630,
      source: 'STOCK_API',
      sourceUrl: data.links.html,
      license: 'Unsplash License',
      attribution: `Photo by ${data.user.name} on Unsplash`,
      costUsd: 0,
    };
  }
}
