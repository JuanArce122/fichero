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
