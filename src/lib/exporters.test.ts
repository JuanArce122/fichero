import { describe, expect, it } from 'vitest';
import type { Book, Card, Chapter, Highlight, Topic } from '../db/types';
import { bookMarkdown, cardsCsv, csvCell, highlightsCsv, slug, topicMarkdown, type ExportData } from './exporters';
import { cardsPdf, toWinAnsi } from './pdf';
import { newReviewMeta } from './review';

const base = { review: newReviewMeta(), favorite: false, discarded: false, createdAt: Date.UTC(2026, 9, 18), updatedAt: 0 };

const data: ExportData = {
  books: new Map([['b1', { id: 'b1', title: 'The Obstacle Is the Way', author: 'Ryan Holiday' } as Book]]),
  chapters: new Map([['ch1', { id: 'ch1', bookId: 'b1', title: '1. Percepción', order: 1, createdAt: 0 } as Chapter]]),
  topics: new Map([['t1', { id: 't1', name: 'Percepción', frequency: 'normal', createdAt: 0 } as Topic]]),
  highlights: [
    { ...base, id: 'h1', bookId: 'b1', chapterId: 'ch1', page: '7', text: 'El obstáculo es el camino', note: 'Clave', tags: ['estoicismo'], processed: false } as Highlight,
    { ...base, id: 'h2', bookId: 'b1', text: 'Texto con "comillas", comas\ny saltos', note: '', tags: [], processed: false } as Highlight,
    { ...base, id: 'h3', bookId: 'b1', text: 'Descartado', note: '', tags: [], processed: true, discarded: true } as Highlight,
  ],
  cards: [
    {
      ...base,
      id: 'c1',
      topicId: 't1',
      idea: 'Lo que me frena puede ser el camino',
      quote: 'El obstáculo es el camino',
      note: '',
      application: 'En el trabajo',
      bookId: 'b1',
      chapterId: 'ch1',
      page: '7',
      highlightIds: ['h1'],
      tags: ['estoicismo'],
      source: 'manual',
    } as Card,
  ],
};

describe('Markdown', () => {
  it('por libro: fichas y subrayados agrupados por capítulo, sin descartados', () => {
    const md = bookMarkdown('b1', data);
    expect(md).toContain('# The Obstacle Is the Way');
    expect(md).toContain('*Ryan Holiday*');
    expect(md).toContain('### Percepción: Lo que me frena puede ser el camino');
    expect(md).toContain('**Cómo lo aplico:** En el trabajo');
    expect(md).toContain('### 1. Percepción\n\n> El obstáculo es el camino (p. 7)');
    expect(md).toContain('### Sin capítulo');
    expect(md).not.toContain('Descartado');
  });

  it('por tema: incluye la fuente', () => {
    const md = topicMarkdown('t1', data);
    expect(md).toMatch(/^# Percepción/);
    expect(md).toContain('*The Obstacle Is the Way · 1. Percepción · p. 7 — #estoicismo*');
  });
});

describe('CSV', () => {
  it('escapa comillas, comas y saltos de línea', () => {
    expect(csvCell('simple')).toBe('simple');
    expect(csvCell('a, "b"\nc')).toBe('"a, ""b""\nc"');
    expect(csvCell(undefined)).toBe('');
  });

  it('exporta subrayados y fichas con encabezado y BOM', () => {
    const h = highlightsCsv(data);
    expect(h.startsWith('﻿libro,autor,')).toBe(true);
    expect(h.split('\r\n').filter(Boolean)).toHaveLength(1 + 3);
    expect(h).toContain('"Texto con ""comillas"", comas\ny saltos"');
    const c = cardsCsv(data);
    expect(c).toContain('Percepción,Lo que me frena puede ser el camino,El obstáculo es el camino,En el trabajo');
  });
});

describe('PDF 4x6', () => {
  it('genera una tarjeta por ficha en tamaño 6x4 pulgadas', () => {
    const doc = cardsPdf([data.cards[0], { ...data.cards[0], id: 'c2' }], data);
    expect(doc.getNumberOfPages()).toBe(2);
    expect(Math.round(doc.internal.pageSize.getWidth())).toBe(432);
    expect(Math.round(doc.internal.pageSize.getHeight())).toBe(288);
    const bytes = new Uint8Array(doc.output('arraybuffer'));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('reparte en varias tarjetas una ficha demasiado larga', () => {
    const long = { ...data.cards[0], idea: 'Una idea muy larga. '.repeat(120) };
    expect(cardsPdf([long], data).getNumberOfPages()).toBeGreaterThan(1);
  });

  it('quita caracteres que las fuentes estándar no pueden dibujar', () => {
    expect(toWinAnsi('¿Acción? “sí” — ñ 🙂')).toBe('¿Acción? “sí” — ñ ');
  });
});

describe('slug', () => {
  it('genera nombres de archivo seguros', () => {
    expect(slug('The Obstacle Is the Way: Percepción!')).toBe('the-obstacle-is-the-way-percepcion');
  });
});
