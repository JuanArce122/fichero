// Exportaciones en Markdown y CSV (lógica pura).

import type { Book, Card, Chapter, Highlight, Topic } from '../db/types';

export interface ExportData {
  books: Map<string, Book>;
  chapters: Map<string, Chapter>;
  topics: Map<string, Topic>;
  highlights: Highlight[];
  cards: Card[];
}

const dateStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function quoteBlock(text: string): string {
  return text
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
}

function tagsLine(tags: string[]): string {
  return tags.map((t) => `#${t.replace(/\s+/g, '-')}`).join(' ');
}

function cardMarkdown(c: Card, d: ExportData, opts: { showTopic: boolean; showBook: boolean }): string {
  const lines: string[] = [];
  const topic = d.topics.get(c.topicId)?.name ?? 'Sin tema';
  lines.push(`### ${opts.showTopic ? `${topic}: ` : ''}${c.idea.split('\n')[0]}`);
  const rest = c.idea.split('\n').slice(1).join('\n').trim();
  if (rest) lines.push('', rest);
  if (c.quote) lines.push('', quoteBlock(`“${c.quote}”`));
  if (c.application) lines.push('', `**Cómo lo aplico:** ${c.application}`);
  if (c.note) lines.push('', `**Nota:** ${c.note}`);
  const source = [
    opts.showBook && c.bookId ? d.books.get(c.bookId)?.title : undefined,
    c.chapterId ? d.chapters.get(c.chapterId)?.title : undefined,
    c.page ? `p. ${c.page}` : undefined,
  ].filter(Boolean);
  const meta = [source.join(' · '), tagsLine(c.tags)].filter(Boolean).join(' — ');
  if (meta) lines.push('', `*${meta}*`);
  return lines.join('\n');
}

export function bookMarkdown(bookId: string, d: ExportData): string {
  const book = d.books.get(bookId);
  if (!book) return '';
  const out: string[] = [`# ${book.title}`];
  if (book.author) out.push('', `*${book.author}*`);

  const cards = d.cards.filter((c) => c.bookId === bookId && !c.discarded);
  if (cards.length) {
    out.push('', '## Fichas');
    for (const c of cards) out.push('', cardMarkdown(c, d, { showTopic: true, showBook: false }));
  }

  const highlights = d.highlights.filter((h) => h.bookId === bookId && !h.discarded);
  if (highlights.length) {
    out.push('', '## Subrayados');
    const chapters = [...d.chapters.values()].filter((c) => c.bookId === bookId).sort((a, b) => a.order - b.order);
    const groups = [
      ...chapters.map((c) => ({ title: c.title, items: highlights.filter((h) => h.chapterId === c.id) })),
      { title: 'Sin capítulo', items: highlights.filter((h) => !h.chapterId || !d.chapters.has(h.chapterId)) },
    ].filter((g) => g.items.length);
    for (const g of groups) {
      out.push('', `### ${g.title}`);
      for (const h of g.items.sort((a, b) => a.createdAt - b.createdAt)) {
        out.push('', quoteBlock(h.text + (h.page ? ` (p. ${h.page})` : '')));
        if (h.note) out.push('', `**Nota:** ${h.note}`);
        if (h.tags.length) out.push('', tagsLine(h.tags));
      }
    }
  }
  return out.join('\n') + '\n';
}

export function topicMarkdown(topicId: string, d: ExportData): string {
  const topic = d.topics.get(topicId);
  if (!topic) return '';
  const cards = d.cards.filter((c) => c.topicId === topicId && !c.discarded);
  const out = [`# ${topic.name}`];
  for (const c of cards) out.push('', cardMarkdown(c, d, { showTopic: false, showBook: true }));
  return out.join('\n') + '\n';
}

// ---------- CSV ----------

export function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV con BOM (para que Excel/Numbers detecten UTF-8) y saltos CRLF. */
export function toCsv(rows: unknown[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function highlightsCsv(d: ExportData): string {
  const rows: unknown[][] = [
    ['libro', 'autor', 'capitulo', 'pagina', 'texto', 'nota', 'etiquetas', 'favorito', 'descartado', 'creado'],
  ];
  for (const h of d.highlights) {
    const b = d.books.get(h.bookId);
    rows.push([
      b?.title,
      b?.author,
      h.chapterId ? d.chapters.get(h.chapterId)?.title : '',
      h.page,
      h.text,
      h.note,
      h.tags.join(' '),
      h.favorite ? 'sí' : 'no',
      h.discarded ? 'sí' : 'no',
      dateStr(h.createdAt),
    ]);
  }
  return toCsv(rows);
}

export function cardsCsv(d: ExportData): string {
  const rows: unknown[][] = [
    ['tema', 'idea', 'cita', 'como_lo_aplico', 'nota', 'libro', 'capitulo', 'pagina', 'etiquetas', 'favorito', 'creado'],
  ];
  for (const c of d.cards) {
    rows.push([
      d.topics.get(c.topicId)?.name,
      c.idea,
      c.quote,
      c.application,
      c.note,
      c.bookId ? d.books.get(c.bookId)?.title : '',
      c.chapterId ? d.chapters.get(c.chapterId)?.title : '',
      c.page,
      c.tags.join(' '),
      c.favorite ? 'sí' : 'no',
      dateStr(c.createdAt),
    ]);
  }
  return toCsv(rows);
}

export function slug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'export'
  );
}
