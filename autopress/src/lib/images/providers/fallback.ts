import type { ImageProvider, ImageSpec, GeneratedImage } from '../types';
import { hash32 } from '../../utils';

/**
 * Zero-dependency cover generator. Renders a deterministic SVG from the slug
 * via /api/cover/[slug], so every article always has a real featured image
 * even with no image API configured and no object storage.
 */
export class FallbackImageProvider implements ImageProvider {
  id = 'fallback';
  isConfigured() {
    return true;
  }

  async generate(spec: ImageSpec): Promise<GeneratedImage> {
    return {
      url: `/api/cover/${encodeURIComponent(spec.slug)}`,
      altText: `Abstract cover illustration for the article "${spec.title}"`,
      width: spec.width ?? 1200,
      height: spec.height ?? 630,
      source: 'FALLBACK',
      license: 'Generated in-house',
      mimeType: 'image/svg+xml',
      costUsd: 0,
      prompt: `deterministic geometric cover, seed ${hash32(spec.slug)}`,
    };
  }
}
