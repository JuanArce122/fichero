// Reposo y transferencia (método Holiday) e idea de la semana: lógica pura.

import type { Book, Highlight, Practice } from '../db/types';
import { addDays } from './dates';
import { DAY_MS } from './review';

export const PRACTICE_DAYS = 7;

// ---------- reposo y transferencia ----------

/** ¿Pasó el período de reposo desde que se terminó el libro? */
export function readyForTransfer(book: Book, restDays: number, now = Date.now()): boolean {
  if (book.status !== 'resting' || !book.restingSince) return false;
  return now - book.restingSince >= restDays * DAY_MS;
}

/** Días que faltan para la transferencia (0 si ya toca). */
export function daysUntilTransfer(book: Book, restDays: number, now = Date.now()): number {
  if (!book.restingSince) return 0;
  return Math.max(0, Math.ceil((book.restingSince + restDays * DAY_MS - now) / DAY_MS));
}

/** Subrayados que todavía no se revisaron en la transferencia. */
export function pendingHighlights(highlights: Highlight[]): Highlight[] {
  return highlights.filter((h) => !h.processed && !h.discarded);
}

// ---------- idea de la semana ----------

export function practiceEndDate(startDate: string): string {
  return addDays(startDate, PRACTICE_DAYS - 1);
}

export function practiceDays(p: Pick<Practice, 'startDate'>): string[] {
  return Array.from({ length: PRACTICE_DAYS }, (_, i) => addDays(p.startDate, i));
}

/** Día de la práctica (1..7) o null si today está fuera del rango. */
export function practiceDayNumber(p: Pick<Practice, 'startDate'>, today: string): number | null {
  const i = practiceDays(p).indexOf(today);
  return i >= 0 ? i + 1 : null;
}

export function needsCheckin(p: Practice, today: string): boolean {
  return p.status === 'active' && practiceDayNumber(p, today) !== null && !p.checkins.some((c) => c.date === today);
}

/** Una práctica activa cuyo último día ya pasó se da por completada. */
export function isExpired(p: Practice, today: string): boolean {
  return p.status === 'active' && today > p.endDate;
}

export function appliedCount(p: Practice): number {
  return p.checkins.filter((c) => c.applied).length;
}
