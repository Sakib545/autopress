/**
 * Demo article bodies. Every record created from these is flagged `isSample: true`
 * so production views can exclude them and you can wipe them in one query:
 *   DELETE FROM "Article" WHERE "isSample" = true;
 */

export type SampleArticle = {
  title: string;
  subtitle: string;
  slug: string;
  category: string;
  contentType: string;
  intent: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  tags: string[];
  excerpt: string;
  qualityScore: number;
  markdown: string;
};

export const SAMPLE_ARTICLES: SampleArticle[] = [
  {
    title: 'How to Compress a Video Without Losing Quality',
    subtitle: 'The settings that actually matter, and the ones that just make files bigger.',
    slug: 'how-to-compress-a-video-without-losing-quality',
    category: 'Video Tools',
    contentType: 'HOW_TO',
    intent: 'TUTORIAL',
    primaryKeyword: 'compress video without losing quality',
    secondaryKeywords: ['reduce video file size', 'video bitrate settings', 'h.265 vs h.264'],
    tags: ['video', 'compression', 'ffmpeg'],
    excerpt:
      'Most quality loss when compressing video comes from one wrong setting, not from compression itself. Here is what to change and what to leave alone.',
    qualityScore: 91,
    markdown: `## Quick answer

Re-encode with a modern codec at a constant quality target rather than a fixed file size. In practice that means H.265 (HEVC) or AV1 with a CRF value between 20 and 24, keeping the original resolution and frame rate. This typically cuts file size by 40–60% with no visible difference at normal viewing distance.

The single biggest mistake is downscaling resolution to hit a size target. Resolution is the last thing you should reduce, not the first.

## Key takeaways

- Constant quality (CRF) beats fixed bitrate for anything that is not being livestreamed.
- H.265 gives roughly half the file size of H.264 at matched quality, at the cost of slower encoding.
- Audio is often 10–20% of a small file. Re-encoding it to 128 kbps AAC is nearly always safe.
- Never re-compress an already-compressed export more than once. Go back to the original.

## Why files get large in the first place

Video size is governed by bitrate — how many bits are spent on each second of footage. Bitrate is in turn driven by resolution, frame rate, codec efficiency and how much motion is in the scene. A static talking-head clip compresses far better than drone footage over a forest, because the encoder can reuse most of each frame.

This matters because it means there is no universal "correct" bitrate. A number that looks fine for an interview will fall apart on high-motion content.

## Use constant quality, not constant bitrate

Two encoding modes dominate:

**Constant bitrate (CBR)** spends the same bits per second regardless of what is on screen. It wastes bits on simple scenes and starves complex ones. It exists for streaming, where the network needs predictability.

**Constant rate factor (CRF)** targets a quality level and lets the bitrate float. Simple scenes get small; complex scenes get the bits they need.

For files you are storing or uploading, CRF is what you want. Lower CRF means higher quality and a bigger file.

| Codec | Visually lossless | Good default | Noticeably soft |
|---|---|---|---|
| H.264 | 16–18 | 20–23 | 28+ |
| H.265 | 18–20 | 22–26 | 30+ |
| AV1 | 20–24 | 26–32 | 36+ |

The scales are not interchangeable — CRF 23 in H.264 is not the same quality as CRF 23 in H.265.

## Step-by-step with FFmpeg

FFmpeg is free, scriptable and produces the same result on every platform.

### 1. Check what you are starting with

\`\`\`bash
ffprobe -v error -show_entries stream=codec_name,width,height,bit_rate -of default=noprint_wrappers=1 input.mp4
\`\`\`

If the source is already H.265 at a modest bitrate, further compression will cost visible quality for little gain.

### 2. Re-encode to H.265 at CRF 23

\`\`\`bash
ffmpeg -i input.mp4 -c:v libx265 -crf 23 -preset medium -c:a aac -b:a 128k output.mp4
\`\`\`

### 3. Adjust the preset, not the CRF, if it is too slow

The \`-preset\` flag trades encoding time for compression efficiency. Going from \`medium\` to \`slow\` yields perhaps 5–10% smaller files for roughly double the time. Going to \`veryfast\` does the reverse.

### 4. Compare before deciding

Play both files at full screen, on the largest display you own, at the parts with the most motion. Compression artefacts hide on small screens.

## When to reduce resolution

Downscaling is a legitimate tool, but only when the delivery target genuinely does not need the pixels. A 4K clip destined for an email newsletter can drop to 1080p with no practical loss. The same clip destined for a client's review monitor should not.

If you do downscale, do it once, from the original, in the same pass as the compression. Repeated resizing compounds softness.

## Common mistakes

- **Compressing an export of an export.** Each generation loses information permanently. Always return to the highest-quality source you have.
- **Targeting a file size.** Size targets force the encoder into bad trade-offs. Set a quality target and accept the size it produces.
- **Leaving audio uncompressed.** A short clip with PCM audio can be mostly audio by size.
- **Changing frame rate to save space.** It saves less than expected and looks obviously wrong on motion.

## FAQs

### Does compressing a video always reduce quality?

Technically yes, since these are lossy codecs. Practically, at a sensible CRF the difference is not visible under normal viewing conditions. The loss becomes visible when you compress aggressively or repeatedly.

### Is H.265 always better than H.264?

For file size at matched quality, yes. For compatibility, no — some older browsers, editors and hardware decoders handle H.264 more reliably. If the file must play anywhere without question, H.264 remains the safer choice.

### How long should encoding take?

Roughly real-time to several times real-time for H.265 at the medium preset on a modern laptop, depending on resolution. AV1 is considerably slower unless your hardware has a dedicated encoder.

## Conclusion

Pick a codec your audience can play, encode once at a constant quality target, and leave resolution alone until you have exhausted the other options. That sequence handles almost every case without a subjective judgement call about "how much quality is acceptable".`,
  },
  {
    title: 'Best Free Photo Editors for Everyday Work',
    subtitle: 'Six tools that cover most editing needs without a subscription.',
    slug: 'best-free-photo-editors',
    category: 'Design Tools',
    contentType: 'BEST_OF',
    intent: 'COMMERCIAL',
    primaryKeyword: 'best free photo editors',
    secondaryKeywords: ['free photoshop alternative', 'free image editing software'],
    tags: ['design', 'photo editing', 'free tools'],
    excerpt:
      'Free photo editors have narrowed the gap with paid software considerably. These are the ones worth installing, and what each is actually good at.',
    qualityScore: 88,
    markdown: `## Quick answer

For most people, **GIMP** covers the widest range of editing tasks at no cost, and **Photopea** is the fastest way to open a PSD without installing anything. If you shoot RAW, **Darktable** is the free equivalent of a full develop module.

None of these are strictly better than paid software. They ask for more patience in exchange for costing nothing.

## Key takeaways

- Browser-based editors are best for quick, occasional edits; desktop apps are better for anything repeated.
- RAW processing and pixel editing are different jobs — few free tools do both well.
- Licence terms matter if you are editing commercially. All the tools here permit commercial use.

## How these were selected

Selection criteria were: genuinely free (not a trial), actively maintained as of the last check, available on at least two desktop platforms or in-browser, and capable of a complete edit rather than a single effect.

Tools that require an account to export, or that watermark output, were excluded.

## The tools

### GIMP — the broadest free editor

GIMP handles layers, masks, curves, healing, batch operations through scripting, and a large plugin ecosystem. It is the closest free equivalent to a full pixel editor.

The interface is its main cost. Long-standing conventions differ from commercial editors, and several routine operations take more steps than they should. Budget an afternoon before it stops feeling awkward.

**Best for:** composites, retouching, anything needing layers and masks.

### Photopea — no installation required

Photopea runs in a browser tab and opens PSD, XCF, Sketch and RAW files. The layout deliberately mirrors familiar commercial software, so most people are productive within minutes.

It is ad-supported, and very large files are limited by browser memory rather than your machine's.

**Best for:** opening a PSD on a machine that has nothing installed.

### Darktable — RAW development

Darktable is a non-destructive RAW processor: a catalogue plus a develop module, with edits stored as instructions rather than baked into pixels. Its colour handling is genuinely strong.

It is not a pixel editor. There is no meaningful cloning or compositing.

**Best for:** photographers processing RAW files in volume.

### Krita — painting first, editing second

Built for digital painting, Krita has excellent brush engines and handles layers and masks competently. Photo-specific tools are thinner than GIMP's.

**Best for:** illustration, texture work, painted retouching.

### RawTherapee — maximum control over RAW

More granular than Darktable in its demosaicing and noise-reduction controls, with a correspondingly steeper learning curve and a less pleasant catalogue.

**Best for:** people who want to tune the RAW conversion itself.

### Paint.NET — the light option

Windows only, and far simpler than the rest. Layers, basic adjustments, a good plugin library, and it opens instantly.

**Best for:** quick crops, resizes and simple corrections.

## Comparison

| Tool | Platform | RAW | Layers | Learning curve |
|---|---|---|---|---|
| GIMP | Win, macOS, Linux | Via plugin | Yes | Moderate |
| Photopea | Browser | Yes | Yes | Low |
| Darktable | Win, macOS, Linux | Yes | No | Moderate |
| Krita | Win, macOS, Linux | Limited | Yes | Moderate |
| RawTherapee | Win, macOS, Linux | Yes | No | High |
| Paint.NET | Windows | No | Yes | Low |

## Choosing between them

Pick by the job rather than by overall ranking. RAW photos in volume point to Darktable. Composites and retouching point to GIMP. A single PSD you need to open right now points to Photopea. Occasional crops on Windows point to Paint.NET.

Installing two is normal — a RAW processor and a pixel editor cover almost everything between them.

## FAQs

### Are free photo editors safe for commercial work?

The tools listed here permit commercial use under their respective licences. Always confirm the current licence for your specific situation, particularly for client work under contract.

### Can free editors open PSD files?

GIMP and Photopea both open PSDs. Complex files using advanced layer effects may not render identically, so check the result before relying on it.

### Do I still need paid software?

If your work depends on specific integrations, colour-managed print output or a shared team workflow, paid tools remain easier to justify. For individual work, the free options now cover a great deal.

## Conclusion

Free editors have reached the point where the limiting factor is familiarity, not capability. Choose based on which job you do most often, accept a short adjustment period, and add a second tool only when you hit an actual wall.`,
  },
  {
    title: 'Static Site Generators vs Headless CMS: Which to Choose',
    subtitle: 'A practical comparison for teams publishing content at moderate scale.',
    slug: 'static-site-generators-vs-headless-cms',
    category: 'Web Publishing',
    contentType: 'COMPARISON',
    intent: 'COMPARISON',
    primaryKeyword: 'static site generator vs headless cms',
    secondaryKeywords: ['headless cms comparison', 'jamstack publishing'],
    tags: ['cms', 'jamstack', 'architecture'],
    excerpt:
      'These are often presented as alternatives, but they solve different problems and are frequently used together. Here is how to decide what you actually need.',
    qualityScore: 87,
    markdown: `## Quick answer

They are not really competitors. A static site generator decides **how pages are built**; a headless CMS decides **where content is stored and who can edit it**. Many production sites use both.

Choose a generator alone when the people writing content are comfortable with Markdown and version control. Add a headless CMS when non-technical editors need to publish without touching a repository.

## Key takeaways

- The real question is who edits the content, not which technology is faster.
- Build times matter above roughly a thousand pages; below that they rarely decide anything.
- A CMS introduces a dependency and a recurring cost. A repository introduces a skills requirement.

## What each one actually does

### Static site generators

A generator takes content files and templates and outputs finished HTML at build time. Because pages are pre-rendered, hosting is cheap and fast, and there is very little to attack.

Content usually lives as Markdown in the same repository as the code. Editing means a commit — which is either excellent or disqualifying, depending entirely on your team.

### Headless CMS

A headless CMS stores content and exposes it over an API, with no opinion about presentation. Editors get a proper interface with drafts, roles, scheduling and media handling.

It does not render anything. Something else — often a static generator — consumes the API and produces pages.

## Where they differ

| Consideration | Static generator alone | With a headless CMS |
|---|---|---|
| Editing experience | Markdown + git | Web interface |
| Non-technical editors | Difficult | Straightforward |
| Content preview | Local build | Usually built in |
| Ongoing cost | Hosting only | Hosting + CMS |
| Vendor dependency | None | Real |
| Content reuse across sites | Awkward | Natural |

## Build time is usually a false concern

Build time is the argument raised most often and settled least often. It only becomes a genuine constraint at scale — a few hundred pages build in seconds with any modern tool.

Two things change the calculation: incremental builds, which rebuild only changed pages, and on-demand rendering, where pages are generated on first request and then cached. Both largely remove build time as a deciding factor.

Decide on editorial workflow first. Revisit build performance only if it actually bites.

## When a generator alone is enough

- The people writing are developers, or comfortable with Markdown and pull requests.
- Content volume is modest and changes are infrequent.
- You want zero recurring platform cost and no external dependency.
- Review through pull requests is a feature rather than an obstacle.

Documentation sites, personal blogs and engineering handbooks fit this well.

## When to add a headless CMS

- Non-technical editors publish regularly and independently.
- You need scheduling, roles, or an approval workflow.
- The same content feeds several destinations — website, app, newsletter.
- Media management through git has become painful.

Marketing sites, editorial publications and multi-brand setups fit this well.

## The cost people forget

A headless CMS is a dependency. Pricing changes, APIs deprecate, and content is now somewhere you do not fully control. Before committing, confirm you can export everything in a usable format, and check what happens to your content on the free tier if you stop paying.

The mitigation is straightforward: keep a scheduled export in your own storage from the beginning.

## FAQs

### Can I start with a generator and add a CMS later?

Yes, and it is a reasonable path. Keep content in a structured format from the start so the migration is a transformation rather than a rewrite.

### Is a static site always faster?

Pre-rendered pages served from a CDN are generally very fast, but a well-cached dynamic site can match it. Speed differences at this level are usually dominated by images and third-party scripts, not by the rendering strategy.

### Does a headless CMS hurt SEO?

Not inherently. What matters is that the final pages are server-rendered or pre-rendered with correct metadata. A CMS that forces client-side-only rendering can cause problems.

## Conclusion

Pick based on who edits, how often, and with what approval process. Build strategy follows from that, not the other way round. If those questions are genuinely open, start with a generator — adding a CMS to structured content later is far easier than untangling a CMS you did not need.`,
  },
];
