import { describe, expect, it } from 'vitest';
import type { Book, Highlight, Practice } from '../db/types';
import {
  appliedCount,
  daysUntilTransfer,
  isExpired,
  needsCheckin,
  pendingHighlights,
  practiceDayNumber,
  practiceDays,
  practiceEndDate,
  readyForTransfer,
} from './apply';
import { DAY_MS } from './review';

const NOW = Date.UTC(2026, 9, 18, 12);

function book(patch: Partial<Book>): Book {
  return { id: 'b', title: 'T', author: '', status: 'reading', frequency: 'normal', createdAt: 0, updatedAt: 0, ...patch };
}

describe('reposo y transferencia', () => {
  it('avisa solo cuando pasa el período de reposo', () => {
    const resting = book({ status: 'resting', restingSince: NOW - 13 * DAY_MS });
    expect(readyForTransfer(resting, 14, NOW)).toBe(false);
    expect(daysUntilTransfer(resting, 14, NOW)).toBe(1);
    expect(readyForTransfer(resting, 14, NOW + DAY_MS)).toBe(true);
    expect(daysUntilTransfer(resting, 14, NOW + DAY_MS)).toBe(0);
  });

  it('no avisa para libros en lectura o procesados', () => {
    expect(readyForTransfer(book({ status: 'reading' }), 14, NOW)).toBe(false);
    expect(readyForTransfer(book({ status: 'processed', restingSince: 0 }), 14, NOW)).toBe(false);
  });

  it('cuenta subrayados pendientes', () => {
    const h = (processed: boolean, discarded: boolean) => ({ processed, discarded }) as Highlight;
    expect(pendingHighlights([h(false, false), h(true, false), h(false, true), h(false, false)])).toHaveLength(2);
  });
});

describe('idea de la semana', () => {
  const practice = (patch: Partial<Practice> = {}): Practice => ({
    id: 'p',
    cardId: 'c',
    startDate: '2026-10-18',
    endDate: practiceEndDate('2026-10-18'),
    checkins: [],
    reflection: '',
    status: 'active',
    createdAt: 0,
    ...patch,
  });

  it('dura 7 días, cruzando meses', () => {
    expect(practiceEndDate('2026-10-28')).toBe('2026-11-03');
    expect(practiceDays(practice())).toEqual([
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
    ]);
  });

  it('calcula el día actual', () => {
    expect(practiceDayNumber(practice(), '2026-10-18')).toBe(1);
    expect(practiceDayNumber(practice(), '2026-10-24')).toBe(7);
    expect(practiceDayNumber(practice(), '2026-10-25')).toBeNull();
  });

  it('pide check-in una vez por día', () => {
    expect(needsCheckin(practice(), '2026-10-19')).toBe(true);
    const done = practice({ checkins: [{ date: '2026-10-19', applied: true, note: '' }] });
    expect(needsCheckin(done, '2026-10-19')).toBe(false);
    expect(needsCheckin(done, '2026-10-20')).toBe(true);
    expect(needsCheckin(practice({ status: 'completed' }), '2026-10-19')).toBe(false);
  });

  it('termina sola al pasar el último día', () => {
    expect(isExpired(practice(), '2026-10-24')).toBe(false);
    expect(isExpired(practice(), '2026-10-25')).toBe(true);
  });

  it('cuenta los días aplicados', () => {
    const p = practice({
      checkins: [
        { date: '2026-10-18', applied: true, note: '' },
        { date: '2026-10-19', applied: false, note: '' },
        { date: '2026-10-20', applied: true, note: '' },
      ],
    });
    expect(appliedCount(p)).toBe(2);
  });
});
