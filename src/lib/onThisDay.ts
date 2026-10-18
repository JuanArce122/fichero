// "En esta fecha" (como Day One): lo que escribiste o capturaste un día como
// hoy, hace un mes, unos meses o años.

import type { Card, Highlight, JournalEntry } from '../db/types';
import { dayKey } from './dates';

export interface Memory {
  label: string;
  kind: 'journal' | 'card' | 'highlight';
  id: string;
  text: string;
  to: string;
}

const OFFSETS: { months: number; label: string }[] = [
  { months: 1, label: 'Hace 1 mes' },
  { months: 3, label: 'Hace 3 meses' },
  { months: 6, label: 'Hace 6 meses' },
  { months: 12, label: 'Hace 1 año' },
  { months: 24, label: 'Hace 2 años' },
  { months: 36, label: 'Hace 3 años' },
];

/** Mismo día del mes, N meses atrás (o null si ese día no existe, p. ej. 31 de febrero). */
export function monthsAgo(today: string, months: number): string | null {
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(y, m - 1 - months, d);
  if (date.getDate() !== d) return null;
  return dayKey(date);
}

export function onThisDay(
  today: string,
  data: { journal: JournalEntry[]; cards: Card[]; highlights: Highlight[] },
  limit = 3,
): Memory[] {
  const out: Memory[] = [];
  for (const { months, label } of [...OFFSETS].reverse()) {
    const day = monthsAgo(today, months);
    if (!day) continue;
    const j = data.journal.find((e) => e.date === day && e.answers.some((a) => a.answer));
    if (j) {
      out.push({ label, kind: 'journal', id: j.id, text: j.answers.find((a) => a.answer)!.answer, to: `/diario/${j.date}` });
    }
    const c = data.cards.find((x) => !x.discarded && dayKey(x.createdAt) === day);
    if (c) out.push({ label, kind: 'card', id: c.id, text: c.idea, to: `/ficha/${c.id}` });
    else {
      const h = data.highlights.find((x) => !x.discarded && dayKey(x.createdAt) === day);
      if (h) out.push({ label, kind: 'highlight', id: h.id, text: h.text, to: `/subrayado/${h.id}` });
    }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}
