import { describe, expect, it } from 'vitest';
import type { Card, Highlight, JournalEntry } from '../db/types';
import { monthsAgo, onThisDay } from './onThisDay';

const at = (day: string) => new Date(`${day}T09:00:00`).getTime();

describe('En esta fecha', () => {
  it('calcula el mismo día meses atrás', () => {
    expect(monthsAgo('2026-10-18', 1)).toBe('2026-09-18');
    expect(monthsAgo('2026-10-18', 12)).toBe('2025-10-18');
    expect(monthsAgo('2026-03-31', 1)).toBeNull(); // no hay 31 de febrero
  });

  it('trae recuerdos de hace un año y un mes, lo más antiguo primero', () => {
    const journal = [
      { id: 'j', date: '2025-10-18', answers: [{ question: 'q', answer: 'Un día difícil' }], cardIds: [] } as unknown as JournalEntry,
    ];
    const cards = [{ id: 'c', idea: 'Idea', discarded: false, createdAt: at('2026-09-18') } as Card];
    const highlights = [
      { id: 'h', text: 'Subrayado', discarded: false, createdAt: at('2026-09-18') } as Highlight,
      { id: 'x', text: 'Otro día', discarded: false, createdAt: at('2026-09-17') } as Highlight,
    ];
    const m = onThisDay('2026-10-18', { journal, cards, highlights });
    expect(m.map((x) => [x.label, x.kind, x.id])).toEqual([
      ['Hace 1 año', 'journal', 'j'],
      ['Hace 1 mes', 'card', 'c'],
    ]);
  });

  it('no trae nada si no hay coincidencias', () => {
    expect(onThisDay('2026-10-18', { journal: [], cards: [], highlights: [] })).toEqual([]);
  });
});
