import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { slugify } from '../utils';

marked.setOptions({ gfm: true, breaks: false });

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'blockquote', 'strong', 'em', 'code', 'pre',
    'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'br', 'img', 'figure', 'figcaption', 'sup',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'rel', 'target', 'data-internal'],
    img: ['src', 'alt', 'width', 'height', 'loading'],
    h2: ['id'],
    h3: ['id'],
    th: ['scope'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href ?? '';
      const isExternal = /^https?:\/\//i.test(href);
      return {
        tagName,
        attribs: {
          ...attribs,
          ...(isExternal ? { rel: 'noopener noreferrer nofollow', target: '_blank' } : {}),
        },
      };
    },
  },
};

export type Heading = { id: string; text: string; level: 2 | 3 };

export function markdownToHtml(md: string) {
  const rawHtml = marked.parse(md, { async: false }) as string;
  return sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
}

/** Adds stable ids to H2/H3 so the table of contents can anchor to them. */
export function addHeadingIds(html: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const used = new Set<string>();

  const out = html.replace(/<(h2|h3)>([\s\S]*?)<\/\1>/g, (_m, tag: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, '').trim();
    let id = slugify(text) || `section-${headings.length + 1}`;
    let n = 2;
    while (used.has(id)) id = `${id}-${n++}`;
    used.add(id);
    headings.push({ id, text, level: tag === 'h2' ? 2 : 3 });
    return `<${tag} id="${id}">${inner}</${tag}>`;
  });

  return { html: out, headings };
}

export function extractExternalLinks(html: string) {
  const links: { url: string; anchorText: string }[] = [];
  const re = /<a\s+[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    links.push({ url: m[1], anchorText: m[2].replace(/<[^>]+>/g, '').trim() });
  }
  return links;
}

/** Pulls Q/A pairs out of an FAQ section so FAQ schema mirrors visible content. */
export function extractFaqs(html: string) {
  const faqs: { question: string; answer: string }[] = [];
  const faqStart = html.search(/<h2[^>]*>\s*FAQs?\b/i);
  if (faqStart === -1) return faqs;
  const section = html.slice(faqStart);
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section))) {
    faqs.push({
      question: m[1].replace(/<[^>]+>/g, '').trim(),
      answer: m[2].replace(/<[^>]+>/g, '').trim(),
    });
  }
  return faqs;
}

export function stripMarkdown(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`|-]/g, ' ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
