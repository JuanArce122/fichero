import { describe, expect, it } from 'vitest';
import {
  Rating,
  buildCloze,
  clozeCount,
  formatInterval,
  grade,
  newFsrsState,
  parseCloze,
  previewIntervals,
  stripCloze,
  tokenize,
} from './mastery';

const NOW = Date.UTC(2026, 9, 18, 12);
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

describe('FSRS', () => {
  it('una tarjeta nueva vence de inmediato', () => {
    const s = newFsrsState(NOW);
    expect(s.due).toBe(NOW);
    expect(s.reps).toBe(0);
  });

  it('"Otra vez" la trae en minutos; "Fácil" en días', () => {
    const s = newFsrsState(NOW);
    const again = grade(s, Rating.Again, NOW);
    const easy = grade(s, Rating.Easy, NOW);
    expect(again.due - NOW).toBeLessThanOrEqual(10 * MIN);
    expect(easy.due - NOW).toBeGreaterThanOrEqual(DAY);
    expect(easy.due).toBeGreaterThan(again.due);
  });

  it('los intervalos crecen con respuestas correctas', () => {
    let s = newFsrsState(NOW);
    let now = NOW;
    const gaps: number[] = [];
    for (let i = 0; i < 5; i++) {
      s = grade(s, Rating.Good, now);
      gaps.push(s.due - now);
      now = s.due;
    }
    for (let i = 2; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
    expect(s.reps).toBe(5);
  });

  it('un fallo cuenta como lapso y acorta el intervalo', () => {
    let s = newFsrsState(NOW);
    let now = NOW;
    for (let i = 0; i < 4; i++) {
      s = grade(s, Rating.Good, now);
      now = s.due;
    }
    const lapsed = grade(s, Rating.Again, now);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.due - now).toBeLessThan(s.due - (s.last_review ?? now));
  });

  it('el estado es serializable a JSON sin pérdida', () => {
    const s = grade(newFsrsState(NOW), Rating.Good, NOW);
    const back = JSON.parse(JSON.stringify(s));
    expect(grade(back, Rating.Good, s.due)).toEqual(grade(s, Rating.Good, s.due));
  });

  it('muestra intervalos para cada calificación', () => {
    const p = previewIntervals(newFsrsState(NOW), NOW);
    expect(Object.keys(p)).toHaveLength(4);
    expect(p[Rating.Again]).toMatch(/min/);
  });

  it('formatea intervalos', () => {
    expect(formatInterval(30_000)).toBe('1 min');
    expect(formatInterval(10 * MIN)).toBe('10 min');
    expect(formatInterval(5 * 60 * MIN)).toBe('5 h');
    expect(formatInterval(3 * DAY)).toBe('3 d');
    expect(formatInterval(60 * DAY)).toBe('2 meses');
  });
});

describe('cloze', () => {
  it('separa partes visibles y ocultas', () => {
    expect(parseCloze('El {{obstáculo}} es el {{camino}}.')).toEqual([
      { text: 'El ', hidden: false },
      { text: 'obstáculo', hidden: true },
      { text: ' es el ', hidden: false },
      { text: 'camino', hidden: true },
      { text: '.', hidden: false },
    ]);
    expect(clozeCount('El {{obstáculo}} es el {{camino}}.')).toBe(2);
    expect(stripCloze('El {{obstáculo}} es el {{camino}}.')).toBe('El obstáculo es el camino.');
  });

  it('construye huecos desde las palabras elegidas', () => {
    const tokens = tokenize('Lo que se interpone en el camino se convierte en el camino.');
    // índices de palabras (los espacios ocupan índices impares)
    const word = (n: number) => n * 2;
    expect(buildCloze(tokens, new Set([word(3)]))).toBe(
      'Lo que se {{interpone}} en el camino se convierte en el camino.',
    );
    // palabras contiguas forman un solo hueco; la puntuación queda fuera
    expect(buildCloze(tokens, new Set([word(10), word(11)]))).toBe(
      'Lo que se interpone en el camino se convierte en {{el camino}}.',
    );
    expect(buildCloze(tokens, new Set())).toBe('Lo que se interpone en el camino se convierte en el camino.');
  });
});

describe('flashcards en la base de datos', async () => {
  const { FicheroDB } = await import('../db/db');
  const { createFlashcard, dueFlashcards, gradeFlashcard, updateFlashcard } = await import('../db/repo');

  it('vencen, se califican y se suspenden', async () => {
    const db = new FicheroDB('mastery-db');
    try {
      const a = await createFlashcard({ kind: 'cloze', text: 'El {{obstáculo}} es el camino' }, db);
      const b = await createFlashcard({ kind: 'qa', question: '¿Qué es el amor fati?', answer: 'Amar lo que sucede' }, db);
      expect((await dueFlashcards(db)).map((c) => c.id).sort()).toEqual([a.id, b.id].sort());

      await gradeFlashcard(a.id, Rating.Easy, db);
      await updateFlashcard(b.id, { suspended: true }, db);
      expect(await dueFlashcards(db)).toHaveLength(0);

      const later = Date.now() + 400 * DAY;
      expect((await dueFlashcards(db, later)).map((c) => c.id)).toEqual([a.id]);
    } finally {
      await db.delete();
    }
  });
});
