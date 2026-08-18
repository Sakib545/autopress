import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function normalizeTitle(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|a|an|of|for|to|in|on|and|or|best|top|guide)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function readingTimeMinutes(wordCount: number) {
  return Math.max(1, Math.round(wordCount / 225));
}

export function countWords(text: string) {
  return text.replace(/[#*_`>\-|]/g, ' ').split(/\s+/).filter(Boolean).length;
}

export function formatDate(date: Date | string | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', opts ?? { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
}

export function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Math.abs(value) < 1 && value !== 0 ? 4 : 2,
    maximumFractionDigits: Math.abs(value) < 1 && value !== 0 ? 4 : 2,
  }).format(value);
}

export function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Deterministic 32-bit hash — used for anchor dedupe and stable mock output. */
export function hash32(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function safeJson<T>(raw: string, fallback: T): T {
  try {
    const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const start = cleaned.search(/[[{]/);
    if (start === -1) return fallback;
    return JSON.parse(cleaned.slice(start)) as T;
  } catch {
    return fallback;
  }
}
