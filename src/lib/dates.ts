import { DAY_MS } from './review';

/** Día local en formato 'YYYY-MM-DD'. */
export function dayKey(date: Date | number = new Date()): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + days));
}

export function daysBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / DAY_MS);
}

const dateFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' });

export function formatDate(ms: number | string): string {
  return dateFmt.format(typeof ms === 'string' ? new Date(ms) : ms);
}

export function formatDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayFmt.format(new Date(y, m - 1, d));
}

export function relativeDays(ms: number, now = Date.now()): string {
  const days = daysBetween(ms, now);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

export function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
