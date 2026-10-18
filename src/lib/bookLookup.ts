// Búsqueda opcional de datos del libro en Open Library (catálogo público y
// gratuito). Solo se envía lo que escribes en el buscador; necesita conexión.

export interface BookCandidate {
  title: string;
  author: string;
  year?: number;
  coverId?: number;
}

interface OpenLibraryDoc {
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
}

export function parseSearch(json: { docs?: OpenLibraryDoc[] }): BookCandidate[] {
  const seen = new Set<string>();
  const out: BookCandidate[] = [];
  for (const d of json.docs ?? []) {
    if (!d.title) continue;
    const author = d.author_name?.slice(0, 2).join(', ') ?? '';
    const key = `${d.title.toLowerCase()}|${author.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: d.title, author, year: d.first_publish_year, coverId: d.cover_i });
  }
  return out;
}

export function isIsbn(q: string): boolean {
  return /^(97[89])?\d{9}[\dX]$/i.test(q.replace(/[-\s]/g, ''));
}

export async function searchBooks(q: string, signal?: AbortSignal): Promise<BookCandidate[]> {
  const query = q.trim();
  if (!query) return [];
  const param = isIsbn(query) ? `isbn=${encodeURIComponent(query.replace(/[-\s]/g, ''))}` : `q=${encodeURIComponent(query)}`;
  const res = await fetch(
    `https://openlibrary.org/search.json?${param}&limit=8&fields=title,author_name,first_publish_year,cover_i`,
    { signal },
  );
  if (!res.ok) throw new Error(`Open Library respondió ${res.status}`);
  return parseSearch(await res.json());
}

export function coverUrl(coverId: number, size: 'S' | 'M' | 'L' = 'M'): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}

export async function fetchCover(coverId: number): Promise<Blob> {
  const res = await fetch(coverUrl(coverId, 'L'));
  if (!res.ok) throw new Error('Sin portada');
  return res.blob();
}
