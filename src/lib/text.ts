/** Une líneas cortadas por el OCR o por Texto en Vivo (guiones y saltos de línea). */
export function cleanText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/(\p{L})-\n(\p{L})/gu, '$1$2')
    .replace(/([^\n])\n(?!\n)/g, '$1 ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Minúsculas y sin acentos, para búsquedas por palabras. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Palabras (y espacios) de un texto, para seleccionar un tramo tocando. */
export function words(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/** Texto entre dos tokens (inclusive), en cualquier orden. */
export function sliceTokens(tokens: string[], a: number, b: number): string {
  const [from, to] = a <= b ? [a, b] : [b, a];
  return tokens.slice(from, to + 1).join('').trim();
}
