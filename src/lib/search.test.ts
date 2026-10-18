import { describe, expect, it } from 'vitest';
import type { Book, Card, Highlight, JournalEntry, Topic } from '../db/types';
import { newReviewMeta } from './review';
import { matchesAll, queryTerms, search, snippet, type SearchData, type SearchFilters } from './search';

const D = (s: string) => new Date(`${s}T10:00:00`).getTime();

const h = (id: string, text: string, patch: Partial<Highlight> = {}): Highlight => ({
  id,
  bookId: 'b1',
  text,
  note: '',
  tags: [],
  favorite: false,
  discarded: false,
  processed: false,
  review: newReviewMeta(),
  createdAt: D('2026-10-01'),
  updatedAt: 0,
  ...patch,
});

const c = (id: string, idea: string, patch: Partial<Card> = {}): Card => ({
  id,
  topicId: 't1',
  idea,
  quote: '',
  note: '',
  application: '',
  highlightIds: [],
  tags: [],
  favorite: false,
  discarded: false,
  source: 'manual',
  review: newReviewMeta(),
  createdAt: D('2026-10-05'),
  updatedAt: 0,
  ...patch,
});

const data: SearchData = {
  highlights: [
    h('h1', 'Lo que impide la acción hace avanzar la acción', { tags: ['estoicismo'], favorite: true }),
    h('h2', 'La ira es un ácido', { note: 'Recordar en el tráfico', bookId: 'b2', createdAt: D('2026-09-01') }),
  ],
  cards: [
    c('c1', 'Los obstáculos son oportunidades', { quote: 'El obstáculo es el camino', application: 'En el trabajo' }),
    c('c2', 'Controlar la ira con una pausa', { topicId: 't2', tags: ['ira'], bookId: 'b2' }),
  ],
  journal: [
    {
      id: 'j1',
      date: '2026-10-10',
      answers: [{ question: '¿Qué obstáculo tuve hoy?', answer: 'Una discusión; sentí ira pero hice una pausa' }],
      cardIds: [],
      createdAt: 0,
      updatedAt: 0,
    } as JournalEntry,
  ],
  books: new Map([
    ['b1', { id: 'b1', title: 'The Obstacle Is the Way', author: 'Ryan Holiday' } as Book],
    ['b2', { id: 'b2', title: 'Sobre la ira', author: 'Séneca' } as Book],
  ]),
  topics: new Map([
    ['t1', { id: 't1', name: 'Percepción' } as Topic],
    ['t2', { id: 't2', name: 'Ira' } as Topic],
  ]),
};

const all: SearchFilters = { types: [], favorites: false };
const ids = (q: string, f: Partial<SearchFilters> = {}) => search(q, { ...all, ...f }, data).map((r) => r.id);

describe('términos y coincidencias', () => {
  it('ignora acentos, mayúsculas y puntuación', () => {
    expect(queryTerms('  Acción, IRA! ')).toEqual(['accion', 'ira']);
    expect(matchesAll('La ACCIÓN avanza', ['accion'])).toBe(true);
    expect(matchesAll('La acción avanza', ['accion', 'ira'])).toBe(false);
  });

  it('genera fragmentos alrededor de la coincidencia', () => {
    const s = snippet('a'.repeat(200) + ' ira ' + 'b'.repeat(200), ['ira'], 10);
    expect(s).toMatch(/^….*ira.*…$/);
  });
});

describe('search', () => {
  it('busca en subrayados, notas, fichas y diario', () => {
    expect(ids('ira').sort()).toEqual(['c2', 'h2', 'j1']);
    expect(ids('tráfico')).toEqual(['h2']); // en la nota
    expect(ids('camino obstaculo')).toEqual(['c1']); // en la cita
  });

  it('exige todas las palabras', () => {
    expect(ids('ira pausa').sort()).toEqual(['c2', 'j1']);
  });

  it('filtra por tipo, libro, tema, etiqueta y favoritos', () => {
    expect(ids('', { types: ['card'] }).sort()).toEqual(['c1', 'c2']);
    expect(ids('', { bookId: 'b2' }).sort()).toEqual(['c2', 'h2']);
    expect(ids('', { topicId: 't2' })).toEqual(['c2']);
    expect(ids('', { tag: 'estoicismo' })).toEqual(['h1']);
    expect(ids('', { favorites: true })).toEqual(['h1']);
  });

  it('filtra por fecha', () => {
    expect(ids('', { from: '2026-10-02' }).sort()).toEqual(['c1', 'c2', 'j1']);
    expect(ids('', { to: '2026-09-30' })).toEqual(['h2']);
  });

  it('ordena por fecha, lo más reciente primero', () => {
    expect(ids('')).toEqual(['j1', 'c1', 'c2', 'h1', 'h2']);
  });
});
