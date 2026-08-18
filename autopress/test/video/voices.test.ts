import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVoiceName, requiresAzureKey, FALLBACK_VOICE } from '../../src/lib/video/voices';

describe('resolveVoiceName', () => {
  it('never returns an empty string', () => {
    // The whole point: MPT fails the audio stage on an empty voice.
    for (const input of [null, undefined, '', '   ']) {
      assert.ok(resolveVoiceName(input, 'en').length > 0);
    }
  });

  it('picks a free edge-tts voice for the article language', () => {
    assert.equal(resolveVoiceName('', 'en'), 'en-US-AriaNeural-Female');
    assert.equal(resolveVoiceName('', 'bn'), 'bn-IN-TanishaaNeural-Female');
  });

  it('matches on the base language, so en-GB still resolves', () => {
    assert.equal(resolveVoiceName('', 'en-GB'), FALLBACK_VOICE);
    assert.equal(resolveVoiceName('', 'PT_BR'), 'pt-BR-FranciscaNeural-Female');
  });

  it('falls back to English for an unknown language', () => {
    assert.equal(resolveVoiceName('', 'xx'), FALLBACK_VOICE);
    assert.equal(resolveVoiceName('', ''), FALLBACK_VOICE);
  });

  it('always prefers an explicitly configured voice', () => {
    assert.equal(resolveVoiceName('en-US-GuyNeural-Male', 'bn'), 'en-US-GuyNeural-Male');
    assert.equal(resolveVoiceName('  en-US-GuyNeural-Male  ', 'en'), 'en-US-GuyNeural-Male');
  });

  it('defaults are all free voices, never Azure-only ones', () => {
    for (const lang of ['en', 'es', 'fr', 'de', 'hi', 'bn', 'zh', 'ja']) {
      const voice = resolveVoiceName('', lang);
      assert.equal(requiresAzureKey(voice), false, `${lang} -> ${voice} needs an Azure key`);
    }
  });
});

describe('requiresAzureKey', () => {
  it('flags -V2 voices, which edge-tts cannot serve', () => {
    assert.equal(requiresAzureKey('en-US-AvaMultilingualNeural-V2-Female'), true);
    assert.equal(requiresAzureKey('en-US-AriaNeural-Female'), false);
  });
});
