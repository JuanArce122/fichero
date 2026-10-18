// Sesión de repaso diario: se genera una vez al día (estable si cierras y vuelves
// a abrir la app) y registra el resultado de cada tarjeta.

import { db as defaultDb, type FicheroDB } from '../db/db';
import type { Card, DailySession, Highlight, ReviewItemRef, ReviewMeta } from '../db/types';
import { dayKey } from './dates';
import { applyOutcome, weightedSample, type Candidate, type ReviewOutcome } from './review';

export interface ReviewFilter {
  topicIds?: string[];
  bookIds?: string[];
  tags?: string[];
}

/** Candidatos al repaso (subrayados y fichas no descartados), con sus frecuencias. */
export async function reviewCandidates(
  db: FicheroDB = defaultDb,
  filter: ReviewFilter = {},
): Promise<Candidate<ReviewItemRef>[]> {
  const [books, topics, highlights, cards] = await Promise.all([
    db.books.toArray(),
    db.topics.toArray(),
    db.highlights.toArray(),
    db.cards.toArray(),
  ]);
  const bookFreq = new Map(books.map((b) => [b.id, b.frequency]));
  const topicFreq = new Map(topics.map((t) => [t.id, t.frequency]));
  const matches = matcher(filter);

  const out: Candidate<ReviewItemRef>[] = [];
  for (const h of highlights) {
    if (h.discarded || !matches(h, undefined)) continue;
    out.push({
      item: { type: 'highlight', id: h.id },
      review: h.review,
      bookFrequency: bookFreq.get(h.bookId),
      favorite: h.favorite,
    });
  }
  for (const c of cards) {
    if (c.discarded || !matches(c, c.topicId)) continue;
    out.push({
      item: { type: 'card', id: c.id },
      review: c.review,
      bookFrequency: c.bookId ? bookFreq.get(c.bookId) : undefined,
      topicFrequency: topicFreq.get(c.topicId),
      favorite: c.favorite,
    });
  }
  return out;
}

/** Un filtro vacío lo deja pasar todo; si hay varios criterios se combinan con Y. */
export function matcher(filter: ReviewFilter) {
  const { topicIds = [], bookIds = [], tags = [] } = filter;
  return (item: Highlight | Card, topicId: string | undefined): boolean => {
    if (topicIds.length && (!topicId || !topicIds.includes(topicId))) return false;
    if (bookIds.length && (!item.bookId || !bookIds.includes(item.bookId))) return false;
    if (tags.length && !tags.some((t) => item.tags.includes(t))) return false;
    return true;
  };
}

export async function getOrCreateDailySession(
  count: number,
  db: FicheroDB = defaultDb,
  now = Date.now(),
  rng: () => number = Math.random,
): Promise<DailySession> {
  const date = dayKey(now);
  const existing = await db.dailySessions.get(date);
  // Una sesión vacía (aún no había contenido) se vuelve a generar.
  if (existing && existing.items.length > 0) return existing;
  const items = weightedSample(await reviewCandidates(db), count, now, rng);
  const session: DailySession = { date, items, done: [], createdAt: now };
  await db.transaction('rw', db.dailySessions, async () => {
    // Guardamos solo los últimos días; las sesiones viejas no aportan nada.
    const old = await db.dailySessions.where('date').below(date).primaryKeys();
    if (old.length > 30) await db.dailySessions.bulkDelete(old.sort().slice(0, old.length - 30));
    await db.dailySessions.put(session);
  });
  return session;
}

/** Genera de nuevo la sesión de hoy (por ejemplo, tras agregar mucho contenido). */
export async function regenerateDailySession(count: number, db: FicheroDB = defaultDb): Promise<DailySession> {
  await db.dailySessions.delete(dayKey());
  return getOrCreateDailySession(count, db);
}

export async function recordOutcome(
  ref: ReviewItemRef,
  outcome: ReviewOutcome,
  db: FicheroDB = defaultDb,
  now = Date.now(),
): Promise<void> {
  const table = ref.type === 'highlight' ? db.highlights : db.cards;
  const item = await (table as typeof db.cards).get(ref.id);
  if (!item) return;
  await (table as typeof db.cards).update(ref.id, { review: applyOutcome(item.review, outcome, now) });
}

/** Deshace el último resultado: restaura el estado anterior del elemento. */
export async function restoreReview(
  ref: ReviewItemRef,
  previous: ReviewMeta,
  db: FicheroDB = defaultDb,
): Promise<void> {
  const table = (ref.type === 'highlight' ? db.highlights : db.cards) as typeof db.cards;
  await table.update(ref.id, { review: previous });
}

export async function unmarkSessionItemDone(date: string, index: number, db: FicheroDB = defaultDb): Promise<void> {
  await db.dailySessions
    .where('date')
    .equals(date)
    .modify((s) => {
      s.done = s.done.filter((i) => i !== index);
    });
}

export async function markSessionItemDone(date: string, index: number, db: FicheroDB = defaultDb): Promise<void> {
  await db.dailySessions
    .where('date')
    .equals(date)
    .modify((s) => {
      if (!s.done.includes(index)) s.done.push(index);
    });
}
