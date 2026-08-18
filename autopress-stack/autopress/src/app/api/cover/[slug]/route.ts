import { hash32 } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PALETTES = [
  ['#0d0f14', '#1d64f0', '#8ec6ff'],
  ['#142555', '#3384fb', '#d9ebff'],
  ['#181b23', '#41485b', '#b0b6c5'],
  ['#1a3b8c', '#59a6ff', '#eef6ff'],
  ['#0d0f14', '#164fdc', '#bcdcff'],
];

/**
 * Deterministic SVG cover. Same slug always yields the same artwork, so
 * regenerating an image never changes an existing article's appearance.
 * This is what keeps every article illustrated with no image API configured.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const seedStr = hash32(slug);
  let seed = parseInt(seedStr, 36) >>> 0;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  const palette = PALETTES[Math.floor(rand() * PALETTES.length)];
  const [bg, mid, light] = palette;

  const shapes: string[] = [];
  const count = 5 + Math.floor(rand() * 4);
  for (let i = 0; i < count; i++) {
    const cx = Math.round(rand() * 1200);
    const cy = Math.round(rand() * 630);
    const r = Math.round(90 + rand() * 260);
    const fill = rand() > 0.5 ? mid : light;
    const opacity = (0.06 + rand() * 0.16).toFixed(3);
    shapes.push(
      rand() > 0.45
        ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity}"/>`
        : `<rect x="${cx - r / 2}" y="${cy - r / 2}" width="${r}" height="${r}" rx="${Math.round(r / 8)}" fill="${fill}" opacity="${opacity}" transform="rotate(${Math.round(rand() * 60 - 30)} ${cx} ${cy})"/>`,
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" role="img">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="${mid}" stop-opacity="0.75"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  ${shapes.join('\n  ')}
  <rect width="1200" height="630" fill="none" stroke="${light}" stroke-opacity="0.15" stroke-width="2"/>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
