export interface ImageSpec {
  title: string;
  slug: string;
  category?: string;
  prompt?: string;
  width?: number;
  height?: number;
}

export interface GeneratedImage {
  url: string;
  altText: string;
  width: number;
  height: number;
  source: 'AI_GENERATED' | 'STOCK_API' | 'UPLOAD' | 'FALLBACK';
  sourceUrl?: string;
  license?: string;
  attribution?: string;
  prompt?: string;
  costUsd?: number;
  mimeType?: string;
}

export interface ImageProvider {
  id: string;
  isConfigured(): boolean;
  generate(spec: ImageSpec): Promise<GeneratedImage>;
}
