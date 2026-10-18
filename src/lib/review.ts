// Repaso diario ponderado (lógica pura, sin acceso a la base de datos).
//
// Cada elemento tiene un peso base (frecuencia del libro × frecuencia del tema
// × favorito). Al mostrarse, su peso cae casi a cero y se recupera linealmente
// durante `recoveryDays`. "Lo recordaba" alarga ese período (sale menos);
// "No lo recordaba" lo acorta (vuelve antes). La selección es un muestreo
// ponderado sin reemplazo, así nada se repite en una sesión y todo va saliendo.

import type { Frequency, ReviewMeta } from '../db/types';

export const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_RECOVERY_DAYS = 14;
export const MIN_RECOVERY_DAYS = 3;
export const MAX_RECOVERY_DAYS = 180;
/** Peso mínimo de un elemento recién mostrado (para que nunca sea imposible). */
export const MIN_FRESHNESS = 0.01;

export const FREQUENCY_MULTIPLIER: Record<Frequency, number> = {
  more: 2,
  normal: 1,
  less: 0.35,
  never: 0,
};

export const FAVORITE_MULTIPLIER = 1.5;

export function newReviewMeta(): ReviewMeta {
  return { recoveryDays: DEFAULT_RECOVERY_DAYS, shown: 0, recalled: 0, missed: 0 };
}

export interface Candidate<T = unknown> {
  item: T;
  review: ReviewMeta;
  bookFrequency?: Frequency;
  topicFrequency?: Frequency;
  favorite?: boolean;
}

export function baseWeight(c: Omit<Candidate, 'item' | 'review'>): number {
  const book = FREQUENCY_MULTIPLIER[c.bookFrequency ?? 'normal'];
  const topic = FREQUENCY_MULTIPLIER[c.topicFrequency ?? 'normal'];
  return book * topic * (c.favorite ? FAVORITE_MULTIPLIER : 1);
}

/** Factor 0..1 según cuánto tiempo pasó desde que se mostró por última vez. */
export function freshness(review: ReviewMeta, now: number): number {
  if (review.lastShownAt === undefined) return 1;
  const days = Math.max(0, (now - review.lastShownAt) / DAY_MS);
  const f = days / Math.max(review.recoveryDays, 1);
  return Math.min(1, Math.max(MIN_FRESHNESS, f));
}

export function effectiveWeight(c: Candidate, now: number): number {
  const base = baseWeight(c);
  if (base <= 0) return 0;
  return base * freshness(c.review, now);
}

/**
 * Muestreo ponderado sin reemplazo (Efraimidis–Spirakis):
 * a cada elemento se le asigna la clave u^(1/w) y se toman las k mayores.
 */
export function weightedSample<T>(
  candidates: Candidate<T>[],
  k: number,
  now: number,
  rng: () => number = Math.random,
): T[] {
  const keyed: { item: T; key: number }[] = [];
  for (const c of candidates) {
    const w = effectiveWeight(c, now);
    if (w <= 0) continue;
    // rng() puede devolver 0; lo evitamos para no obtener claves iguales a 0.
    const u = Math.max(rng(), Number.EPSILON);
    keyed.push({ item: c.item, key: Math.log(u) / w });
  }
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, Math.max(0, k)).map((x) => x.item);
}

export type ReviewOutcome = 'recalled' | 'missed' | 'seen';

/** Nuevo estado tras mostrar un elemento en el repaso. */
export function applyOutcome(review: ReviewMeta, outcome: ReviewOutcome, now: number): ReviewMeta {
  let recoveryDays = review.recoveryDays || DEFAULT_RECOVERY_DAYS;
  if (outcome === 'recalled') recoveryDays = Math.min(MAX_RECOVERY_DAYS, recoveryDays * 1.5);
  if (outcome === 'missed') recoveryDays = Math.max(MIN_RECOVERY_DAYS, recoveryDays / 2);
  return {
    lastShownAt: now,
    recoveryDays: Math.round(recoveryDays * 10) / 10,
    shown: review.shown + 1,
    recalled: review.recalled + (outcome === 'recalled' ? 1 : 0),
    missed: review.missed + (outcome === 'missed' ? 1 : 0),
  };
}

/** Texto parcial para el modo "intenta recordar primero". */
export function teaser(text: string, words = 5): string {
  const parts = text.trim().split(/\s+/);
  if (parts.length <= words) return parts.slice(0, Math.max(1, Math.ceil(parts.length / 2))).join(' ') + '…';
  return parts.slice(0, words).join(' ') + '…';
}
