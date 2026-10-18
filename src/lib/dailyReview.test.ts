import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FicheroDB } from '../db/db';
import { createBook, createCard, createHighlight, createTopic, updateBook } from '../db/repo';
import { getOrCreateDailySession, markSessionItemDone, recordOutcome, reviewCandidates } from './dailyReview';

let n = 0;
let db: FicheroDB;
const NOW = new Date(2026, 9, 18, 9).getTime();

beforeEach(async () => {
  db = new FicheroDB(`daily-${n++}`);
  await db.open();
});
afterEach(() => db.delete());

async function seed() {
  const a = await createBook({ title: 'A', author: '' }, db);
  const b = await createBook({ title: 'B', author: '' }, db);
  const t = await createTopic('Percepción', db);
  for (let i = 0; i < 6; i++) await createHighlight({ bookId: a.id, text: `a${i}`, tags: i < 2 ? ['ira'] : [] }, db);
  for (let i = 0; i < 4; i++) await createHighlight({ bookId: b.id, text: `b${i}` }, db);
  const card = await createCard({ topicId: t.id, idea: 'idea', bookId: a.id }, db);
  return { a, b, t, card };
}

describe('sesión diaria', () => {
  it('es estable durante el día y respeta el tamaño', async () => {
    await seed();
    const s1 = await getOrCreateDailySession(5, db, NOW);
    const s2 = await getOrCreateDailySession(5, db, NOW + 3600_000);
    expect(s1.items).toHaveLength(5);
    expect(s2.items).toEqual(s1.items);
  });

  it('se regenera si estaba vacía', async () => {
    const empty = await getOrCreateDailySession(5, db, NOW);
    expect(empty.items).toHaveLength(0);
    await seed();
    expect((await getOrCreateDailySession(5, db, NOW)).items).toHaveLength(5);
  });

  it('excluye libros en "nunca" y elementos descartados', async () => {
    const { b } = await seed();
    await updateBook(b.id, { frequency: 'never' }, db);
    const h = (await db.highlights.toArray()).find((x) => x.text === 'a0')!;
    await db.highlights.update(h.id, { discarded: true });
    const cands = await reviewCandidates(db);
    expect(cands).toHaveLength(10); // el descartado no está
    // Los de B siguen siendo candidatos pero con peso 0: nunca salen en la sesión.
    const s = await getOrCreateDailySession(50, db, NOW);
    expect(s.items).toHaveLength(6); // 5 de A + 1 ficha
  });

  it('filtra por etiqueta, libro y tema', async () => {
    const { a, t } = await seed();
    expect(await reviewCandidates(db, { tags: ['ira'] })).toHaveLength(2);
    expect(await reviewCandidates(db, { bookIds: [a.id] })).toHaveLength(7);
    expect(await reviewCandidates(db, { topicIds: [t.id] })).toHaveLength(1);
  });

  it('registra resultados y marca avance', async () => {
    const { card } = await seed();
    await recordOutcome({ type: 'card', id: card.id }, 'recalled', db, NOW);
    const updated = await db.cards.get(card.id);
    expect(updated!.review.lastShownAt).toBe(NOW);
    expect(updated!.review.recalled).toBe(1);

    const s = await getOrCreateDailySession(3, db, NOW);
    await markSessionItemDone(s.date, 0, db);
    await markSessionItemDone(s.date, 0, db);
    expect((await db.dailySessions.get(s.date))!.done).toEqual([0]);
  });
});
