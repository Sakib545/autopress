import type { ImageProvider, ImageSpec, GeneratedImage } from './types';
import { env } from '../env';
import { FallbackImageProvider } from './providers/fallback';
import { StockImageProvider } from './providers/stock';
import { AIImageProvider } from './providers/ai';

const providers: Record<string, ImageProvider> = {
  fallback: new FallbackImageProvider(),
  stock: new StockImageProvider(),
  ai: new AIImageProvider(),
};

export function getImageProvider(id?: string): ImageProvider {
  return providers[(id ?? env.imageProvider).toLowerCase()] ?? providers.fallback;
}

export function listImageProviders() {
  return Object.values(providers).map((p) => ({ id: p.id, configured: p.isConfigured() }));
}

/** Image failure must never block publication — always degrade to the cover generator. */
export async function generateCover(spec: ImageSpec): Promise<GeneratedImage> {
  const provider = getImageProvider();
  try {
    return await provider.generate(spec);
  } catch (err) {
    console.warn(`[images] ${provider.id} failed, using fallback:`, (err as Error).message);
    return providers.fallback.generate(spec);
  }
}

export * from './types';
