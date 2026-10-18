// Avisos de pendientes en la pantalla de inicio (no hay notificaciones push).

import { db as defaultDb, type FicheroDB } from '../db/db';
import type { Settings } from '../db/types';
import { needsCheckin, pendingHighlights, practiceDayNumber, readyForTransfer } from './apply';
import { dayKey, daysBetween } from './dates';
import { DAY_MS } from './review';

export type NoticeKind = 'review' | 'mastery' | 'practice' | 'journal' | 'transfer' | 'backup';

export interface Notice {
  kind: NoticeKind;
  title: string;
  detail?: string;
  to?: string;
  warn?: boolean;
}

/** A partir de esta hora se sugiere escribir el diario. */
export const JOURNAL_HOUR = 18;

export function backupOverdue(settings: Settings, hasData: boolean, now = Date.now()): boolean {
  if (!hasData) return false;
  if (!settings.lastBackupAt) return true;
  return now - settings.lastBackupAt >= settings.backupReminderDays * DAY_MS;
}

export async function computeNotices(settings: Settings, db: FicheroDB = defaultDb, now = Date.now()): Promise<Notice[]> {
  const notices: Notice[] = [];
  const [highlights, cards] = await Promise.all([db.highlights.count(), db.cards.count()]);

  const session = await db.dailySessions.get(dayKey(now));
  if (highlights + cards > 0) {
    if (!session) {
      notices.push({ kind: 'review', title: 'Repaso de hoy', detail: `${settings.dailyCount} elementos`, to: '/repaso' });
    } else if (session.done.length < session.items.length) {
      const left = session.items.length - session.done.length;
      notices.push({ kind: 'review', title: 'Repaso de hoy', detail: `Quedan ${left}`, to: '/repaso' });
    }
  }

  const dueCards = (await db.flashcards.where('due').belowOrEqual(now).toArray()).filter((c) => !c.suspended).length;
  if (dueCards > 0) {
    notices.push({
      kind: 'mastery',
      title: 'Maestría',
      detail: `${dueCards} ${dueCards === 1 ? 'tarjeta por repasar' : 'tarjetas por repasar'}`,
      to: '/maestria/repaso',
    });
  }

  const today = dayKey(now);
  const practice = await db.practices.where('status').equals('active').first();
  if (practice && needsCheckin(practice, today)) {
    notices.push({
      kind: 'practice',
      title: 'Idea de la semana',
      detail: `Día ${practiceDayNumber(practice, today)}: ¿la aplicaste hoy?`,
      to: '/practica',
    });
  }

  if (new Date(now).getHours() >= JOURNAL_HOUR && !(await db.journal.where('date').equals(today).count())) {
    notices.push({ kind: 'journal', title: 'Diario de hoy', detail: 'Unos minutos para revisar el día', to: '/diario' });
  }

  for (const book of await db.books.where('status').equals('resting').toArray()) {
    if (!readyForTransfer(book, settings.restDays, now)) continue;
    const pending = pendingHighlights(await db.highlights.where('bookId').equals(book.id).toArray()).length;
    notices.push({
      kind: 'transfer',
      title: `Hora de la transferencia: ${book.title}`,
      detail: pending
        ? `${pending} ${pending === 1 ? 'subrayado por procesar' : 'subrayados por procesar'}`
        : 'Revisa el libro y márcalo como procesado',
      to: `/transferir/${book.id}`,
    });
  }

  return notices;
}

/** Aviso de respaldo vencido. Se muestra en Ajustes (en Inicio solo un punto en el ícono). */
export async function backupNotice(settings: Settings, db: FicheroDB = defaultDb, now = Date.now()): Promise<Notice | null> {
  const hasData = (await db.books.count()) + (await db.highlights.count()) + (await db.cards.count()) > 0;
  if (!backupOverdue(settings, hasData, now)) return null;
  return {
    kind: 'backup',
    warn: true,
    title: 'Respaldo pendiente',
    detail: settings.lastBackupAt
      ? `Último respaldo hace ${daysBetween(settings.lastBackupAt, now)} días`
      : 'Aún no has hecho ningún respaldo',
  };
}
