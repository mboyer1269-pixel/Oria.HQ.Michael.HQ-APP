/**
 * Single display-text rule for every user-chosen label (agent display names,
 * employee profile fields). Used by the UI, the API/server actions and the
 * server stores; mirrored in SQL by `public.oria_display_text_ok` (migration
 * 0034_display_text_rule.sql), whose character classes are generated from the
 * ranges below and checked by display-text-rule.test.mjs.
 *
 * A valid value is:
 *  - NFC-normalized (callers normalize first via `normalizeDisplayText`);
 *  - non-empty after trimming, with no leading/trailing whitespace;
 *  - at most `maxLength` code points;
 *  - free of \p{Cc} (C0/C1 controls), \p{Cf} (bidi overrides/isolates,
 *    zero-width characters, BOM, tags…) and U+2028/U+2029. Multi-line fields
 *    may additionally contain TAB, LF and CR.
 */

/** Exactly [\p{Cc}\p{Cf}\u2028\u2029] (Unicode 17, verified by test). */
export const FORBIDDEN_DISPLAY_TEXT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x001f], [0x007f, 0x009f], [0x00ad, 0x00ad], [0x0600, 0x0605], [0x061c, 0x061c],
  [0x06dd, 0x06dd], [0x070f, 0x070f], [0x0890, 0x0891], [0x08e2, 0x08e2], [0x180e, 0x180e],
  [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0x2066, 0x206f], [0xfeff, 0xfeff],
  [0xfff9, 0xfffb], [0x110bd, 0x110bd], [0x110cd, 0x110cd], [0x13430, 0x1343f],
  [0x1bca0, 0x1bca3], [0x1d173, 0x1d17a], [0xe0001, 0xe0001], [0xe0020, 0xe007f],
];

/** Characters removed by String.prototype.trim (WhiteSpace + LineTerminator). */
export const EDGE_WHITESPACE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0009, 0x000d], [0x0020, 0x0020], [0x00a0, 0x00a0], [0x1680, 0x1680], [0x2000, 0x200a],
  [0x2028, 0x2029], [0x202f, 0x202f], [0x205f, 0x205f], [0x3000, 0x3000], [0xfeff, 0xfeff],
];

export const FORBIDDEN_DISPLAY_TEXT = /[\p{Cc}\p{Cf}\u2028\u2029]/u;
const MULTILINE_ALLOWED = /[\t\n\r]/gu;

export type DisplayTextOptions = { maxLength: number; multiline?: boolean };

export function isValidDisplayText(value: unknown, { maxLength, multiline = false }: DisplayTextOptions): value is string {
  if (typeof value !== "string" || !value) return false;
  if (value !== value.normalize("NFC") || value !== value.trim()) return false;
  if (Array.from(value).length > maxLength) return false;
  return !FORBIDDEN_DISPLAY_TEXT.test(multiline ? value.replace(MULTILINE_ALLOWED, "") : value);
}

/** NFC-normalizes and trims, then validates. Returns null when the value is not acceptable. */
export function normalizeDisplayText(value: unknown, options: DisplayTextOptions): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").trim();
  return isValidDisplayText(normalized, options) ? normalized : null;
}

/** PostgreSQL ARE bracket expression for the given ranges (NUL is impossible in PG text). */
export function toPostgresCharClass(ranges: ReadonlyArray<readonly [number, number]>): string {
  const esc = (cp: number) => (cp > 0xffff ? `\\U${cp.toString(16).padStart(8, "0")}` : `\\u${cp.toString(16).padStart(4, "0")}`);
  return `[${ranges
    .map(([a, b]) => [Math.max(a, 1), b] as const)
    .map(([a, b]) => (a === b ? esc(a) : `${esc(a)}-${esc(b)}`))
    .join("")}]`;
}
