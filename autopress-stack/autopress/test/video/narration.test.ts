import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeNarration, wordBudget, ensureCta, clampToWords, countWordsIn, deriveTitle, deriveDescription,
  splitSentences, deriveTerms,
} from '../../src/lib/video/narration';

describe('wordBudget', () => {
  it('sizes the script from the target duration', () => {
    const b = wordBudget(45);
    assert.ok(b.min >= 40 && b.min < b.max);
    assert.ok(b.max <= 160, `45s should not ask for ${b.max} words`);
  });
});

describe('sanitizeNarration', () => {
  it('removes markdown headings and list markers, terminating each one', () => {
    // Without the terminator these run together: "Why it matters first point..."
    const got = sanitizeNarration('## Why it matters\n- first point\n- second point');
    assert.equal(got, 'Why it matters. first point. second point.');
  });

  it('does not double up punctuation a heading already has', () => {
    assert.equal(sanitizeNarration('## Is it worth it?\nUsually.'), 'Is it worth it? Usually.');
  });

  it('removes URLs and bare domains', () => {
    const got = sanitizeNarration('See https://example.com/guide and www.example.org for more.');
    assert.ok(!got.includes('http'), got);
    assert.ok(!got.includes('www.'), got);
  });

  it('removes bracketed citations and footnotes', () => {
    assert.equal(sanitizeNarration('Compression cuts size by half [1]. (Source: FFmpeg docs)'), 'Compression cuts size by half.');
  });

  it('removes emoji and hashtags', () => {
    const got = sanitizeNarration('Great results 🚀🔥 #video #tips');
    assert.equal(got, 'Great results');
  });

  it('keeps a markdown link label but drops the target', () => {
    assert.equal(sanitizeNarration('Try [HandBrake](https://handbrake.fr) today.'), 'Try HandBrake today.');
  });
});

describe('clampToWords', () => {
  it('cuts on a sentence boundary', () => {
    const text = 'One two three four. Five six seven eight. Nine ten.';
    // 7 is below the 8-word mark of the second sentence, so it is dropped whole.
    assert.equal(clampToWords(text, 7), 'One two three four.');
    // Exactly at the boundary the second sentence still fits.
    assert.equal(clampToWords(text, 8), 'One two three four. Five six seven eight.');
  });

  it('leaves a short script alone', () => {
    assert.equal(clampToWords('Short and sweet.', 50), 'Short and sweet.');
  });
});

describe('ensureCta', () => {
  it('appends the CTA when the script has none', () => {
    const got = ensureCta('Compression keeps quality high.', 'Read the full article on our website.', 60);
    assert.match(got, /Read the full article on our website\.$/);
  });

  it('does not duplicate a CTA the model already wrote', () => {
    const script = 'Compression keeps quality high. Read the full article on our website.';
    const got = ensureCta(script, 'Read the full article on our website.', 60);
    assert.equal(got, script);
  });

  it('drops narration rather than the CTA when over budget', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ') + '.';
    const got = ensureCta(long, 'Read the full article on our website.', 20);
    assert.match(got, /Read the full article on our website\.$/);
    assert.ok(countWordsIn(got) <= 21, `got ${countWordsIn(got)} words`);
  });
});

describe('title and description', () => {
  it('keeps hyphenated words intact', () => {
    // Regression: the site-name strip matched a bare hyphen, so "Wi-Fi 7
    // explained" became "Wi" and "Self-hosting Plex on a NAS" became "Self".
    assert.equal(deriveTitle('Wi-Fi 7 explained'), 'Wi-Fi 7 explained');
    assert.equal(deriveTitle('Self-hosting Plex on a NAS'), 'Self-hosting Plex on a NAS');
    assert.equal(deriveTitle('State-of-the-art video compression'), 'State-of-the-art video compression');
  });

  it('still strips a spaced site-name suffix', () => {
    assert.equal(deriveTitle('How to compress video | Signal Review'), 'How to compress video');
    assert.equal(deriveTitle('How to compress video — Signal Review'), 'How to compress video');
    assert.equal(deriveTitle('How to compress video - Signal Review'), 'How to compress video');
  });

  it('shortens a long title without clickbait padding', () => {
    const got = deriveTitle('How to compress a video without losing quality — a complete practical walkthrough', 40);
    assert.ok(got.length <= 41, got);
  });

  it('builds a 2-4 sentence description from the excerpt', () => {
    const got = deriveDescription('First sentence. Second sentence. Third sentence. Fourth. Fifth.', '');
    assert.ok(got.startsWith('First sentence.'));
    assert.ok(!got.includes('Fifth'), got);
  });
});


describe('splitSentences', () => {
  it('does not split inside a codec name', () => {
    // The real failure: "...use H.265 (HEVC) today." narrated as "... H." then stopped.
    assert.deepEqual(
      splitSentences('Use H.265 (HEVC) today. It halves the file.'),
      ['Use H.265 (HEVC) today.', 'It halves the file.'],
    );
  });

  it('does not split inside decimals or version numbers', () => {
    assert.deepEqual(
      splitSentences('Set CRF to 22.5 for best results. Try v1.2 as well.'),
      ['Set CRF to 22.5 for best results.', 'Try v1.2 as well.'],
    );
  });

  it('does not split on common abbreviations', () => {
    assert.deepEqual(
      splitSentences('Dr. Smith tested it. It worked.'),
      ['Dr. Smith tested it.', 'It worked.'],
    );
    assert.equal(splitSentences('Codecs, containers, etc. all matter.').length, 1);
  });

  it('still splits ordinary sentences', () => {
    assert.equal(splitSentences('One. Two! Three? Four').length, 4);
  });

  it('returns nothing for empty input', () => {
    assert.deepEqual(splitSentences('   '), []);
  });
});

describe('deriveTerms', () => {
  const TITLE = 'How to Compress a Video Without Losing Quality';

  it('drops stopwords that produce useless stock footage', () => {
    const terms = deriveTerms(TITLE);
    // The old implementation returned ['compress','video','without','losing'].
    assert.ok(!terms.includes('without'), terms.join(', '));
    assert.ok(!terms.includes('losing'), terms.join(', '));
    assert.ok(!terms.some((t) => t.split(' ').includes('without')), terms.join(', '));
  });

  it('prefers filmable two-word phrases', () => {
    const terms = deriveTerms(TITLE);
    assert.ok(terms.some((t) => t.includes(' ')), `expected a phrase, got ${terms.join(', ')}`);
    assert.ok(terms[0].includes('compress') || terms[0].includes('video'), terms[0]);
  });

  it('pulls extra terms from the article body', () => {
    const terms = deriveTerms('Short Title', 'Handbrake handbrake handbrake exports smaller files.');
    assert.ok(terms.includes('handbrake'), terms.join(', '));
  });

  it('respects the maximum and never returns duplicates', () => {
    const terms = deriveTerms(TITLE, 'video video compression compression bitrate', 3);
    assert.ok(terms.length <= 3);
    assert.equal(new Set(terms).size, terms.length);
  });

  it('falls back to something usable when the title is all stopwords', () => {
    const terms = deriveTerms('How to know what you should do');
    assert.ok(terms.length > 0);
  });
});
