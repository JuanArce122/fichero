// Avisos de pendientes en la pantalla de inicio (no hay notificaciones push).

import { db as defaultDb, type FicheroDB } from '../db/db';
import type { Settings } from '../db/types';
import { dayKey, daysBetween } from './dates';
import { DAY_MS } from './review';

export type NoticeKind = 'review' | 'backup';

export interface Notice {
  kind: NoticeKind;
  title: string;
  detail?: string;
  to?: string;
  warn?: boolean;
}

export function backupOverdue(settings: Settings, hasData: boolean, now = Date.now()): boolean {
  if (!hasData) return false;
  if (!settings.lastBackupAt) return true;
  return now - settings.lastBackupAt >= settings.backupReminderDays * DAY_MS;
}

export async function computeNotices(settings: Settings, db: FicheroDB = defaultDb, now = Date.now()): Promise<Notice[]> {
  const notices: Notice[] = [];
  const [highlights, cards] = await Promise.all([db.highlights.count(), db.cards.count()]);
  const hasData = highlights + cards > 0 || (await db.books.count()) > 0;

  const session = await db.dailySessions.get(dayKey(now));
  if (highlights + cards > 0) {
    if (!session) {
      notices.push({ kind: 'review', title: 'Repaso de hoy', detail: `${settings.dailyCount} elementos`, to: '/repaso' });
    } else if (session.done.length < session.items.length) {
      const left = session.items.length - session.done.length;
      notices.push({ kind: 'review', title: 'Repaso de hoy', detail: `Quedan ${left}`, to: '/repaso' });
    }
  }

  if (backupOverdue(settings, hasData, now)) {
    notices.push({
      kind: 'backup',
      warn: true,
      title: 'Respaldo pendiente',
      detail: settings.lastBackupAt
        ? `Último respaldo hace ${daysBetween(settings.lastBackupAt, now)} días`
        : 'Aún no has hecho ningún respaldo',
    });
  }
  return notices;
}
