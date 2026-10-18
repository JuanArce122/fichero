// Operaciones de datos de alto nivel. La UI usa estas funciones en vez de tocar
// las tablas directamente, para que las reglas (fechas, cascadas, estados) vivan
// en un solo lugar.

import { db as defaultDb, type FicheroDB } from './db';
import {
  DEFAULT_SETTINGS,
  type Book,
  type BookStatus,
  type Card,
  type Chapter,
  type Flashcard,
  type Highlight,
  type ID,
  type JournalEntry,
  type Practice,
  type Settings,
  type Topic,
} from './types';
import { isExpired, practiceEndDate } from '../lib/apply';
import { dayKey } from '../lib/dates';
import { grade, newFsrsState, type Grade } from '../lib/mastery';
import { newReviewMeta } from '../lib/review';

export function uid(): ID {
  return crypto.randomUUID();
}

export function normalizeTags(tags: string[]): string[] {
  const out = new Set<string>();
  for (const t of tags) {
    const clean = t.trim().replace(/^#/, '').toLowerCase();
    if (clean) out.add(clean);
  }
  return [...out];
}

export function parseTags(input: string): string[] {
  return normalizeTags(input.split(/[,\n]/));
}

// ---------- ajustes ----------

export async function getSettings(db: FicheroDB = defaultDb): Promise<Settings> {
  const row = await db.settings.get('settings');
  return { ...DEFAULT_SETTINGS, ...(row?.value ?? {}) };
}

export async function updateSettings(patch: Partial<Settings>, db: FicheroDB = defaultDb): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const value = { ...(await getSettings(db)), ...patch };
    await db.settings.put({ key: 'settings', value });
    return value;
  });
}

// ---------- libros ----------

export async function createBook(
  data: Pick<Book, 'title' | 'author'> & Partial<Pick<Book, 'status' | 'coverId'>>,
  db: FicheroDB = defaultDb,
): Promise<Book> {
  const now = Date.now();
  const book: Book = {
    id: uid(),
    title: data.title.trim(),
    author: data.author.trim(),
    coverId: data.coverId,
    status: data.status ?? 'reading',
    frequency: 'normal',
    createdAt: now,
    updatedAt: now,
  };
  await db.books.add(book);
  return book;
}

export async function updateBook(id: ID, patch: Partial<Book>, db: FicheroDB = defaultDb): Promise<void> {
  await db.books.update(id, { ...patch, updatedAt: Date.now() });
}

/**
 * Cambia el estado de un libro. Marcarlo como "terminado" lo deja "en reposo"
 * (método Holiday): pasado el período de reposo se propone la transferencia.
 */
export async function setBookStatus(id: ID, status: BookStatus, db: FicheroDB = defaultDb): Promise<void> {
  const patch: Partial<Book> = { status };
  if (status === 'finished' || status === 'resting') {
    patch.status = 'resting';
    const current = await db.books.get(id);
    patch.restingSince = current?.status === 'resting' && current.restingSince ? current.restingSince : Date.now();
  }
  await updateBook(id, patch, db);
}

export async function deleteBook(id: ID, db: FicheroDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.books, db.chapters, db.highlights, db.cards, db.images], async () => {
    const book = await db.books.get(id);
    const highlights = await db.highlights.where('bookId').equals(id).toArray();
    const imageIds = [book?.coverId, ...highlights.map((h) => h.photoId)].filter((x): x is string => !!x);
    await db.images.bulkDelete(imageIds);
    await db.highlights.where('bookId').equals(id).delete();
    await db.chapters.where('bookId').equals(id).delete();
    // Las fichas son conocimiento propio: se conservan, solo se desvinculan del libro.
    await db.cards.where('bookId').equals(id).modify({ bookId: undefined, chapterId: undefined });
    await db.books.delete(id);
  });
}

// ---------- capítulos ----------

export async function addChapter(bookId: ID, title: string, db: FicheroDB = defaultDb): Promise<Chapter> {
  const existing = await db.chapters.where('bookId').equals(bookId).toArray();
  const order = existing.reduce((m, c) => Math.max(m, c.order), 0) + 1;
  const chapter: Chapter = { id: uid(), bookId, title: title.trim(), order, createdAt: Date.now() };
  await db.chapters.add(chapter);
  return chapter;
}

export async function chaptersOf(bookId: ID, db: FicheroDB = defaultDb): Promise<Chapter[]> {
  const list = await db.chapters.where('bookId').equals(bookId).toArray();
  return list.sort((a, b) => a.order - b.order);
}

export async function deleteChapter(id: ID, db: FicheroDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.chapters, db.highlights, db.cards], async () => {
    await db.highlights.where('chapterId').equals(id).modify({ chapterId: undefined });
    await db.cards.where('chapterId').equals(id).modify({ chapterId: undefined });
    await db.chapters.delete(id);
  });
}

// ---------- subrayados ----------

export type HighlightInput = Pick<Highlight, 'bookId' | 'text'> &
  Partial<Pick<Highlight, 'chapterId' | 'page' | 'note' | 'tags' | 'photoId'>>;

export async function createHighlight(data: HighlightInput, db: FicheroDB = defaultDb): Promise<Highlight> {
  const now = Date.now();
  const h: Highlight = {
    id: uid(),
    bookId: data.bookId,
    chapterId: data.chapterId || undefined,
    page: data.page?.trim() || undefined,
    text: data.text.trim(),
    note: data.note?.trim() ?? '',
    tags: normalizeTags(data.tags ?? []),
    photoId: data.photoId,
    favorite: false,
    discarded: false,
    processed: false,
    review: newReviewMeta(),
    createdAt: now,
    updatedAt: now,
  };
  await db.highlights.add(h);
  return h;
}

export async function updateHighlight(id: ID, patch: Partial<Highlight>, db: FicheroDB = defaultDb): Promise<void> {
  if (patch.tags) patch = { ...patch, tags: normalizeTags(patch.tags) };
  await db.highlights.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteHighlight(id: ID, db: FicheroDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.highlights, db.images], async () => {
    const h = await db.highlights.get(id);
    if (h?.photoId) await db.images.delete(h.photoId);
    await db.highlights.delete(id);
  });
}

// ---------- temas ----------

export const DEFAULT_TOPICS = ['Percepción', 'Acción', 'Voluntad', 'Disciplina'];

export async function ensureDefaultTopics(db: FicheroDB = defaultDb): Promise<void> {
  if ((await db.topics.count()) > 0) return;
  const now = Date.now();
  await db.topics.bulkAdd(
    DEFAULT_TOPICS.map((name, i) => ({ id: uid(), name, frequency: 'normal' as const, createdAt: now + i })),
  );
}

export async function createTopic(name: string, db: FicheroDB = defaultDb): Promise<Topic> {
  const clean = name.trim();
  const existing = (await db.topics.toArray()).find((t) => t.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing;
  const topic: Topic = { id: uid(), name: clean, frequency: 'normal', createdAt: Date.now() };
  await db.topics.add(topic);
  return topic;
}

/** Borra un tema moviendo sus fichas a otro. */
export async function deleteTopic(id: ID, moveTo: ID, db: FicheroDB = defaultDb): Promise<void> {
  if (id === moveTo) return;
  await db.transaction('rw', [db.topics, db.cards], async () => {
    await db.cards.where('topicId').equals(id).modify({ topicId: moveTo });
    await db.topics.delete(id);
  });
}

// ---------- fichas ----------

export type CardInput = Pick<Card, 'topicId' | 'idea'> &
  Partial<
    Pick<Card, 'quote' | 'note' | 'application' | 'bookId' | 'chapterId' | 'page' | 'highlightIds' | 'tags' | 'source'>
  >;

export async function createCard(data: CardInput, db: FicheroDB = defaultDb): Promise<Card> {
  const now = Date.now();
  const card: Card = {
    id: uid(),
    topicId: data.topicId,
    idea: data.idea.trim(),
    quote: data.quote?.trim() ?? '',
    note: data.note?.trim() ?? '',
    application: data.application?.trim() ?? '',
    bookId: data.bookId || undefined,
    chapterId: data.chapterId || undefined,
    page: data.page?.trim() || undefined,
    highlightIds: data.highlightIds ?? [],
    tags: normalizeTags(data.tags ?? []),
    favorite: false,
    discarded: false,
    source: data.source ?? 'manual',
    review: newReviewMeta(),
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction('rw', [db.cards, db.highlights], async () => {
    await db.cards.add(card);
    if (card.highlightIds.length) {
      await db.highlights.where('id').anyOf(card.highlightIds).modify({ processed: true });
    }
  });
  return card;
}

export async function updateCard(id: ID, patch: Partial<Card>, db: FicheroDB = defaultDb): Promise<void> {
  if (patch.tags) patch = { ...patch, tags: normalizeTags(patch.tags) };
  await db.cards.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteCard(id: ID, db: FicheroDB = defaultDb): Promise<void> {
  await db.cards.delete(id);
}

// ---------- flashcards (Maestría) ----------

export type FlashcardInput = Pick<Flashcard, 'kind'> &
  Partial<Pick<Flashcard, 'text' | 'question' | 'answer' | 'sourceType' | 'sourceId'>>;

export async function createFlashcard(data: FlashcardInput, db: FicheroDB = defaultDb): Promise<Flashcard> {
  const now = Date.now();
  const fsrs = newFsrsState(now);
  const card: Flashcard = {
    id: uid(),
    kind: data.kind,
    sourceType: data.sourceType,
    sourceId: data.sourceId,
    text: data.text?.trim() ?? '',
    question: data.question?.trim() ?? '',
    answer: data.answer?.trim() ?? '',
    fsrs,
    due: fsrs.due,
    suspended: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.flashcards.add(card);
  return card;
}

export async function updateFlashcard(id: ID, patch: Partial<Flashcard>, db: FicheroDB = defaultDb): Promise<void> {
  await db.flashcards.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteFlashcard(id: ID, db: FicheroDB = defaultDb): Promise<void> {
  await db.flashcards.delete(id);
}

export async function gradeFlashcard(id: ID, rating: Grade, db: FicheroDB = defaultDb, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.flashcards, async () => {
    const card = await db.flashcards.get(id);
    if (!card) return;
    const fsrs = grade(card.fsrs, rating, now);
    await db.flashcards.update(id, { fsrs, due: fsrs.due, updatedAt: now });
  });
}

/** Tarjetas vencidas (no suspendidas), las más atrasadas primero. */
export async function dueFlashcards(db: FicheroDB = defaultDb, now = Date.now()): Promise<Flashcard[]> {
  const list = await db.flashcards.where('due').belowOrEqual(now).toArray();
  return list.filter((c) => !c.suspended).sort((a, b) => a.due - b.due);
}

// ---------- transferencia ----------

/** Marca un subrayado como revisado en la transferencia (y opcionalmente lo descarta). */
export async function markProcessed(id: ID, discard = false, db: FicheroDB = defaultDb): Promise<void> {
  await updateHighlight(id, discard ? { processed: true, discarded: true } : { processed: true }, db);
}

// ---------- idea de la semana ----------

export async function activePractice(db: FicheroDB = defaultDb): Promise<Practice | undefined> {
  return db.practices.where('status').equals('active').first();
}

/** Empieza a practicar una ficha durante 7 días. Detiene la práctica activa anterior. */
export async function startPractice(cardId: ID, db: FicheroDB = defaultDb, today = dayKey()): Promise<Practice> {
  return db.transaction('rw', db.practices, async () => {
    await db.practices.where('status').equals('active').modify({ status: 'stopped' });
    const p: Practice = {
      id: uid(),
      cardId,
      startDate: today,
      endDate: practiceEndDate(today),
      checkins: [],
      reflection: '',
      status: 'active',
      createdAt: Date.now(),
    };
    await db.practices.add(p);
    return p;
  });
}

export async function saveCheckin(
  id: ID,
  checkin: { date: string; applied: boolean; note: string },
  db: FicheroDB = defaultDb,
): Promise<void> {
  await db.practices
    .where('id')
    .equals(id)
    .modify((p) => {
      p.checkins = [...p.checkins.filter((c) => c.date !== checkin.date), { ...checkin, note: checkin.note.trim() }].sort(
        (a, b) => a.date.localeCompare(b.date),
      );
    });
}

export async function finishPractice(
  id: ID,
  status: 'completed' | 'stopped',
  reflection?: string,
  db: FicheroDB = defaultDb,
): Promise<void> {
  const patch: Partial<Practice> = { status };
  if (reflection !== undefined) patch.reflection = reflection.trim();
  await db.practices.update(id, patch);
}

/** Da por completadas las prácticas cuyo último día ya pasó. */
export async function closeExpiredPractices(db: FicheroDB = defaultDb, today = dayKey()): Promise<void> {
  await db.practices
    .where('status')
    .equals('active')
    .modify((p) => {
      if (isExpired(p, today)) p.status = 'completed';
    });
}

// ---------- diario ----------

export async function journalFor(date: string, db: FicheroDB = defaultDb): Promise<JournalEntry | undefined> {
  return db.journal.where('date').equals(date).first();
}

/** Guarda la entrada del día (una por día). */
export async function saveJournal(
  date: string,
  data: Pick<JournalEntry, 'answers' | 'cardIds'>,
  db: FicheroDB = defaultDb,
): Promise<JournalEntry> {
  return db.transaction('rw', db.journal, async () => {
    const now = Date.now();
    const existing = await journalFor(date, db);
    const answers = data.answers.map((a) => ({ question: a.question, answer: a.answer.trim() }));
    const entry: JournalEntry = existing
      ? { ...existing, answers, cardIds: data.cardIds, updatedAt: now }
      : { id: uid(), date, answers, cardIds: data.cardIds, createdAt: now, updatedAt: now };
    await db.journal.put(entry);
    return entry;
  });
}

export async function deleteJournal(id: ID, db: FicheroDB = defaultDb): Promise<void> {
  await db.journal.delete(id);
}

// ---------- imágenes ----------

export async function saveImage(
  kind: 'cover' | 'page',
  blob: Blob,
  db: FicheroDB = defaultDb,
): Promise<ID> {
  const id = uid();
  await db.images.add({ id, kind, type: blob.type || 'image/jpeg', data: await blob.arrayBuffer(), createdAt: Date.now() });
  return id;
}

/** Todas las etiquetas usadas, ordenadas. */
export async function allTags(db: FicheroDB = defaultDb): Promise<string[]> {
  let keys: unknown[];
  try {
    const [h, c] = await Promise.all([db.highlights.orderBy('tags').uniqueKeys(), db.cards.orderBy('tags').uniqueKeys()]);
    keys = [...h, ...c];
  } catch {
    // Algunas versiones de Safari fallan con índices de varias entradas: lo calculamos a mano.
    const [h, c] = await Promise.all([db.highlights.toArray(), db.cards.toArray()]);
    keys = [...h, ...c].flatMap((x) => x.tags ?? []);
  }
  return [...new Set(keys.map(String))].sort((a, b) => a.localeCompare(b, 'es'));
}
