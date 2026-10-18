import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  DEFAULT_RECOVERY_DAYS,
  MAX_RECOVERY_DAYS,
  MIN_RECOVERY_DAYS,
  applyOutcome,
  baseWeight,
  effectiveWeight,
  freshness,
  newReviewMeta,
  teaser,
  weightedSample,
  type Candidate,
} from './review';

const NOW = Date.UTC(2026, 9, 18);

/** RNG determinista (mulberry32) para tests reproducibles. */
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cand(id: string, extra: Partial<Candidate<string>> = {}): Candidate<string> {
  return { item: id, review: newReviewMeta(), ...extra };
}

describe('baseWeight', () => {
  it('multiplica frecuencias de libro y tema', () => {
    expect(baseWeight({})).toBe(1);
    expect(baseWeight({ bookFrequency: 'more', topicFrequency: 'more' })).toBe(4);
    expect(baseWeight({ bookFrequency: 'never' })).toBe(0);
    expect(baseWeight({ topicFrequency: 'never', bookFrequency: 'more' })).toBe(0);
  });

  it('da más peso a favoritos', () => {
    expect(baseWeight({ favorite: true })).toBeGreaterThan(baseWeight({}));
  });
});

describe('freshness', () => {
  it('es 1 si nunca se mostró', () => {
    expect(freshness(newReviewMeta(), NOW)).toBe(1);
  });

  it('cae casi a cero al mostrarse y se recupera linealmente', () => {
    const r = { ...newReviewMeta(), lastShownAt: NOW };
    expect(freshness(r, NOW)).toBeLessThan(0.05);
    expect(freshness(r, NOW + (DEFAULT_RECOVERY_DAYS / 2) * DAY_MS)).toBeCloseTo(0.5);
    expect(freshness(r, NOW + DEFAULT_RECOVERY_DAYS * DAY_MS)).toBe(1);
    expect(freshness(r, NOW + 100 * DAY_MS)).toBe(1);
  });
});

describe('weightedSample', () => {
  it('no repite elementos y respeta k', () => {
    const cands = Array.from({ length: 20 }, (_, i) => cand(`c${i}`));
    const out = weightedSample(cands, 7, NOW, seeded(1));
    expect(out).toHaveLength(7);
    expect(new Set(out).size).toBe(7);
  });

  it('devuelve todos si hay menos que k', () => {
    const out = weightedSample([cand('a'), cand('b')], 10, NOW, seeded(2));
    expect(out.sort()).toEqual(['a', 'b']);
  });

  it('excluye frecuencia "nunca"', () => {
    const out = weightedSample(
      [cand('a', { bookFrequency: 'never' }), cand('b'), cand('c', { topicFrequency: 'never' })],
      5,
      NOW,
      seeded(3),
    );
    expect(out).toEqual(['b']);
  });

  it('prefiere elementos no mostrados recientemente', () => {
    const recent = { ...newReviewMeta(), lastShownAt: NOW - DAY_MS };
    let freshPicked = 0;
    const rng = seeded(4);
    for (let i = 0; i < 500; i++) {
      const [pick] = weightedSample([cand('fresh'), cand('recent', { review: recent })], 1, NOW, rng);
      if (pick === 'fresh') freshPicked++;
    }
    expect(freshPicked).toBeGreaterThan(450);
  });

  it('respeta la proporción de pesos aproximadamente', () => {
    const rng = seeded(5);
    let more = 0;
    const runs = 4000;
    for (let i = 0; i < runs; i++) {
      const [pick] = weightedSample([cand('more', { bookFrequency: 'more' }), cand('normal')], 1, NOW, rng);
      if (pick === 'more') more++;
    }
    // peso 2 vs 1 → ~2/3
    expect(more / runs).toBeGreaterThan(0.62);
    expect(more / runs).toBeLessThan(0.71);
  });

  it('con el tiempo todo va saliendo', () => {
    const cands = Array.from({ length: 30 }, (_, i) => cand(`c${i}`));
    const seen = new Set<string>();
    const rng = seeded(6);
    let now = NOW;
    for (let day = 0; day < 10; day++) {
      const picks = weightedSample(cands, 5, now, rng);
      for (const p of picks) {
        seen.add(p);
        const c = cands.find((x) => x.item === p)!;
        c.review = applyOutcome(c.review, 'seen', now);
      }
      now += DAY_MS;
    }
    expect(seen.size).toBe(30);
  });
});

describe('elementos nuevos', () => {
  it('tienen prioridad sobre los ya repasados y recuperados', () => {
    const old = { ...newReviewMeta(), shown: 3, lastShownAt: NOW - 100 * DAY_MS };
    expect(effectiveWeight(cand('new'), NOW)).toBeGreaterThan(effectiveWeight(cand('old', { review: old }), NOW));
  });
});

describe('applyOutcome', () => {
  it('registra la vista y ajusta el período de recuperación', () => {
    const base = newReviewMeta();
    const recalled = applyOutcome(base, 'recalled', NOW);
    expect(recalled.lastShownAt).toBe(NOW);
    expect(recalled.shown).toBe(1);
    expect(recalled.recalled).toBe(1);
    expect(recalled.recoveryDays).toBeGreaterThan(base.recoveryDays);

    const missed = applyOutcome(base, 'missed', NOW);
    expect(missed.missed).toBe(1);
    expect(missed.recoveryDays).toBeLessThan(base.recoveryDays);

    expect(applyOutcome(base, 'seen', NOW).recoveryDays).toBe(base.recoveryDays);
  });

  it('acota el período de recuperación', () => {
    let r = newReviewMeta();
    for (let i = 0; i < 30; i++) r = applyOutcome(r, 'recalled', NOW);
    expect(r.recoveryDays).toBe(MAX_RECOVERY_DAYS);
    for (let i = 0; i < 30; i++) r = applyOutcome(r, 'missed', NOW);
    expect(r.recoveryDays).toBe(MIN_RECOVERY_DAYS);
  });

  it('un elemento olvidado vuelve antes que uno recordado', () => {
    const missed = applyOutcome(newReviewMeta(), 'missed', NOW);
    const recalled = applyOutcome(newReviewMeta(), 'recalled', NOW);
    const later = NOW + 5 * DAY_MS;
    expect(effectiveWeight(cand('m', { review: missed }), later)).toBeGreaterThan(
      effectiveWeight(cand('r', { review: recalled }), later),
    );
  });
});

describe('teaser', () => {
  it('muestra solo el inicio', () => {
    expect(teaser('El obstáculo en el camino se convierte en el camino', 4)).toBe('El obstáculo en el…');
    expect(teaser('Corto', 4)).toBe('Corto…');
  });
});
