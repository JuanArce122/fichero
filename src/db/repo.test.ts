import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FicheroDB } from './db';
import {
  activePractice,
  closeExpiredPractices,
  createBook,
  createCard,
  createHighlight,
  createTopic,
  journalFor,
  markProcessed,
  saveCheckin,
  saveJournal,
  setBookStatus,
  startPractice,
} from './repo';

let n = 0;
let db: FicheroDB;
beforeEach(async () => {
  db = new FicheroDB(`repo-${n++}`);
  await db.open();
});
afterEach(() => db.delete());

describe('libros', () => {
  it('terminar un libro lo deja en reposo y conserva la fecha de inicio del reposo', async () => {
    const b = await createBook({ title: 'T', author: '' }, db);
    await setBookStatus(b.id, 'finished', db);
    const first = await db.books.get(b.id);
    expect(first!.status).toBe('resting');
    expect(first!.restingSince).toBeTypeOf('number');
    await setBookStatus(b.id, 'resting', db);
    expect((await db.books.get(b.id))!.restingSince).toBe(first!.restingSince);
  });
});

describe('transferencia', () => {
  it('crear una ficha desde subrayados los marca como procesados', async () => {
    const b = await createBook({ title: 'T', author: '' }, db);
    const t = await createTopic('Acción', db);
    const h1 = await createHighlight({ bookId: b.id, text: 'uno' }, db);
    const h2 = await createHighlight({ bookId: b.id, text: 'dos' }, db);
    await createCard({ topicId: t.id, idea: 'idea', highlightIds: [h1.id], source: 'transfer' }, db);
    await markProcessed(h2.id, true, db);
    expect((await db.highlights.get(h1.id))!.processed).toBe(true);
    expect(await db.highlights.get(h2.id)).toMatchObject({ processed: true, discarded: true });
  });
});

describe('idea de la semana', () => {
  it('solo hay una práctica activa y los check-ins se reemplazan por día', async () => {
    const t = await createTopic('Acción', db);
    const c1 = await createCard({ topicId: t.id, idea: 'a' }, db);
    const c2 = await createCard({ topicId: t.id, idea: 'b' }, db);
    const p1 = await startPractice(c1.id, db, '2026-10-18');
    const p2 = await startPractice(c2.id, db, '2026-10-19');
    expect((await activePractice(db))!.id).toBe(p2.id);
    expect((await db.practices.get(p1.id))!.status).toBe('stopped');

    await saveCheckin(p2.id, { date: '2026-10-19', applied: false, note: '' }, db);
    await saveCheckin(p2.id, { date: '2026-10-19', applied: true, note: ' en la reunión ' }, db);
    expect((await db.practices.get(p2.id))!.checkins).toEqual([{ date: '2026-10-19', applied: true, note: 'en la reunión' }]);

    await closeExpiredPractices(db, '2026-10-25');
    expect((await db.practices.get(p2.id))!.status).toBe('active');
    await closeExpiredPractices(db, '2026-10-26');
    expect((await db.practices.get(p2.id))!.status).toBe('completed');
  });
});

describe('diario', () => {
  it('una entrada por día, editable', async () => {
    await saveJournal('2026-10-18', { answers: [{ question: '¿Qué obstáculo?', answer: ' el tráfico ' }], cardIds: [] }, db);
    await saveJournal('2026-10-18', { answers: [{ question: '¿Qué obstáculo?', answer: 'la reunión' }], cardIds: ['c'] }, db);
    expect(await db.journal.count()).toBe(1);
    expect(await journalFor('2026-10-18', db)).toMatchObject({
      answers: [{ question: '¿Qué obstáculo?', answer: 'la reunión' }],
      cardIds: ['c'],
    });
  });
});
