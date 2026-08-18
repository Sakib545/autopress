/**
 * Narration voices for MoneyPrinterTurbo.
 *
 * MPT picks its TTS backend from the *shape* of the voice name, and it does not
 * default an empty one: `voice_name: ""` is routed to Azure, which then fails
 * with `Invalid voice ''` and kills the task at the audio stage. So AutoPress
 * must always send a concrete name.
 *
 * Format is `<locale>-<Name>Neural-<Gender>` (MPT strips the gender suffix in
 * parse_voice_name). Names ending in `-V2` go to Azure and need an Azure key —
 * everything here is a plain Neural voice, which edge-tts serves for free.
 */

/** Free edge-tts voice per language, used when no voice is configured. */
const DEFAULT_VOICES: Record<string, string> = {
  en: 'en-US-AriaNeural-Female',
  es: 'es-ES-ElviraNeural-Female',
  fr: 'fr-FR-DeniseNeural-Female',
  de: 'de-DE-KatjaNeural-Female',
  pt: 'pt-BR-FranciscaNeural-Female',
  hi: 'hi-IN-SwaraNeural-Female',
  bn: 'bn-IN-TanishaaNeural-Female',
  ar: 'ar-EG-SalmaNeural-Female',
  id: 'id-ID-GadisNeural-Female',
  ja: 'ja-JP-NanamiNeural-Female',
  ko: 'ko-KR-SunHiNeural-Female',
  zh: 'zh-CN-XiaoxiaoNeural-Female',
  ru: 'ru-RU-SvetlanaNeural-Female',
  vi: 'vi-VN-HoaiMyNeural-Female',
  tr: 'tr-TR-EmelNeural-Female',
};

export const FALLBACK_VOICE = DEFAULT_VOICES.en;

/**
 * Resolves the voice to send to MoneyPrinterTurbo.
 *
 * An explicitly configured voice always wins, even an Azure `-V2` one — that is
 * the operator's choice. Otherwise a free edge-tts voice is chosen from the
 * article's language, matching on the base language so both `en` and `en-GB`
 * resolve. The return value is never empty.
 */
export function resolveVoiceName(configured: string | null | undefined, language: string): string {
  const explicit = (configured ?? '').trim();
  if (explicit) return explicit;

  const base = (language ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return DEFAULT_VOICES[base] ?? FALLBACK_VOICE;
}

/** True for voices that require an Azure Speech key rather than free edge-tts. */
export function requiresAzureKey(voiceName: string): boolean {
  return /-V2(-Female|-Male)?$/i.test((voiceName ?? '').trim());
}
