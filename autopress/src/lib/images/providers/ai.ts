import type { ImageProvider, ImageSpec, GeneratedImage } from '../types';
import { env } from '../../env';

/** Editorial cover art only. Prompts are constrained upstream so the model is
 *  never asked to depict real product UIs, logos or identifiable people. */
export class AIImageProvider implements ImageProvider {
  id = 'ai';
  isConfigured() {
    return env.openaiKey.length > 0 || env.imageApiKey.length > 0;
  }

  async generate(spec: ImageSpec): Promise<GeneratedImage> {
    const key = env.openaiKey || env.imageApiKey;
    if (!key) throw new Error('No image generation key configured (OPENAI_API_KEY or IMAGE_API_KEY).');

    const prompt =
      spec.prompt ??
      `Abstract editorial cover illustration for an article titled "${spec.title}". Flat geometric shapes, muted editorial palette, no text, no logos, no user interfaces, no people.`;

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1792x1024', quality: 'standard' }),
    });
    if (!res.ok) throw new Error(`Image generation ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { data: { url: string; revised_prompt?: string }[] };
    const url = data.data?.[0]?.url;
    if (!url) throw new Error('Image generation returned no URL');

    return {
      url,
      altText: `Abstract illustration accompanying "${spec.title}"`,
      width: 1792,
      height: 1024,
      source: 'AI_GENERATED',
      license: 'AI generated',
      prompt: data.data[0]?.revised_prompt ?? prompt,
      costUsd: 0.04,
    };
  }
}
