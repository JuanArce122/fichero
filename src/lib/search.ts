// Búsqueda de texto completo por palabras (sin semántica): un resultado coincide
// si contiene todas las palabras buscadas, ignorando mayúsculas y acentos.

import type { Book, Card, Highlight, JournalEntry, Topic } from '../db/types';
import { normalize } from './text';

export type ResultType = 'highlight' | 'card' | 'journal';

export interface SearchFilters {
  types: ResultType[];
  bookId?: string;
  topicId?: string;
  tag?: string;
  from?: string; // 'YYYY-MM-DD'
  to?: string;
  favorites: boolean;
}

export interface SearchResult {
  type: ResultType;
  id: string;
  /** Texto principal para mostrar. */
  title: string;
  /** Fragmento con la coincidencia (si la coincidencia no está en el título). */
  snippet?: string;
  date: number;
  to: string;
}

export function queryTerms(q: string): string[] {
  return normalize(q)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function matchesAll(text: string, terms: string[]): boolean {
  if (!terms.length) return true;
  const n = normalize(text);
  return terms.every((t) => n.includes(t));
}

/** Fragmento de ~`radius` caracteres alrededor de la primera coincidencia. */
export function snippet(text: string, terms: string[], radius = 70): string | undefined {
  if (!terms.length) return undefined;
  const n = normalize(text);
  let pos = -1;
  for (const t of terms) {
    const i = n.indexOf(t);
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
  }
  if (pos < 0) return undefined;
  const start = Math.max(0, pos - radius);
  const end = Math.min(text.length, pos + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

function dayOf(ms: number): string {
  const d = new Date(ms);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function inRange(day: string, f: SearchFilters): boolean {
  if (f.from && day < f.from) return false;
  if (f.to && day > f.to) return false;
  return true;
}

export interface SearchData {
  highlights: Highlight[];
  cards: Card[];
  journal: JournalEntry[];
  books: Map<string, Book>;
  topics: Map<string, Topic>;
}

export function search(q: string, f: SearchFilters, data: SearchData): SearchResult[] {
  const terms = queryTerms(q);
  const out: SearchResult[] = [];
  const want = (t: ResultType) => !f.types.length || f.types.includes(t);

  if (want('highlight') && !f.topicId) {
    for (const h of data.highlights) {
      if (f.bookId && h.bookId !== f.bookId) continue;
      if (f.tag && !h.tags.includes(f.tag)) continue;
      if (f.favorites && !h.favorite) continue;
      if (!inRange(dayOf(h.createdAt), f)) continue;
      const book = data.books.get(h.bookId);
      const haystack = [h.text, h.note, h.tags.join(' '), book?.title ?? '', book?.author ?? ''].join(' \n ');
      if (!matchesAll(haystack, terms)) continue;
      out.push({
        type: 'highlight',
        id: h.id,
        title: h.text,
        snippet: matchesAll(h.text, terms) ? undefined : snippet(h.note, terms),
        date: h.createdAt,
        to: `/subrayado/${h.id}`,
      });
    }
  }

  if (want('card')) {
    for (const c of data.cards) {
      if (f.bookId && c.bookId !== f.bookId) continue;
      if (f.topicId && c.topicId !== f.topicId) continue;
      if (f.tag && !c.tags.includes(f.tag)) continue;
      if (f.favorites && !c.favorite) continue;
      if (!inRange(dayOf(c.createdAt), f)) continue;
      const topic = data.topics.get(c.topicId)?.name ?? '';
      const body = [c.quote, c.note, c.application].join(' \n ');
      const haystack = [c.idea, body, topic, c.tags.join(' '), c.bookId ? data.books.get(c.bookId)?.title ?? '' : ''].join(' \n ');
      if (!matchesAll(haystack, terms)) continue;
      out.push({
        type: 'card',
        id: c.id,
        title: c.idea,
        snippet: matchesAll(c.idea, terms) ? undefined : snippet(body, terms),
        date: c.createdAt,
        to: `/ficha/${c.id}`,
      });
    }
  }

  // El diario no tiene libro, tema, etiquetas ni favoritos: se excluye si se usan esos filtros.
  if (want('journal') && !f.bookId && !f.topicId && !f.tag && !f.favorites) {
    for (const e of data.journal) {
      if (!inRange(e.date, f)) continue;
      const text = e.answers.map((a) => a.answer).join('\n');
      if (!matchesAll(text, terms)) continue;
      out.push({
        type: 'journal',
        id: e.id,
        title: e.date,
        snippet: snippet(text, terms) ?? e.answers[0]?.answer,
        date: new Date(`${e.date}T12:00:00`).getTime(),
        to: `/diario/${e.date}`,
      });
    }
  }

  return out.sort((a, b) => b.date - a.date);
}
