// Modo Maestría: flashcards con repetición espaciada FSRS (ts-fsrs).
//
// El estado FSRS se guarda con las fechas como números (ms) para que viaje sin
// problemas en el respaldo JSON; se convierte a Date solo al calcular.

import { Rating, createEmptyCard, fsrs, generatorParameters, type Card as FsrsCard, type Grade } from 'ts-fsrs';

export { Rating };
export type { Grade };

export interface StoredFsrs {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: number;
}

const scheduler = fsrs(
  generatorParameters({
    enable_fuzz: true,
    // Pasos cortos: lo que olvidas vuelve a los pocos minutos dentro de la misma sesión.
    enable_short_term: true,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
    maximum_interval: 3650,
  }),
);

function toStored(c: FsrsCard): StoredFsrs {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.getTime() : undefined,
  };
}

function fromStored(s: StoredFsrs): FsrsCard {
  return {
    ...s,
    due: new Date(s.due),
    last_review: s.last_review !== undefined ? new Date(s.last_review) : undefined,
  };
}

export function newFsrsState(now = Date.now()): StoredFsrs {
  return toStored(createEmptyCard(new Date(now)));
}

export function grade(state: StoredFsrs, rating: Grade, now = Date.now()): StoredFsrs {
  return toStored(scheduler.next(fromStored(state), new Date(now), rating).card);
}

/** Próximo intervalo para cada botón, para mostrarlo bajo la calificación. */
export function previewIntervals(state: StoredFsrs, now = Date.now()): Record<Grade, string> {
  const preview = scheduler.repeat(fromStored(state), new Date(now));
  const out = {} as Record<Grade, string>;
  for (const r of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]) {
    out[r] = formatInterval(preview[r].card.due.getTime() - now);
  }
  return out;
}

export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} d`;
  const m = Math.round(d / 30);
  if (m < 12) return `${m} mes${m === 1 ? '' : 'es'}`;
  const y = Math.round((d / 365) * 10) / 10;
  return `${String(y).replace('.', ',')} año${y === 1 ? '' : 's'}`;
}

export const RATING_LABELS: Record<Grade, string> = {
  [Rating.Again]: 'Otra vez',
  [Rating.Hard]: 'Difícil',
  [Rating.Good]: 'Bien',
  [Rating.Easy]: 'Fácil',
};

// ---------- cloze ----------

export interface ClozePart {
  text: string;
  hidden: boolean;
}

const CLOZE = /\{\{(.+?)\}\}/g;

/** "El {{obstáculo}} es el camino" → partes visibles y ocultas. */
export function parseCloze(text: string): ClozePart[] {
  const parts: ClozePart[] = [];
  let last = 0;
  for (const m of text.matchAll(CLOZE)) {
    if (m.index! > last) parts.push({ text: text.slice(last, m.index), hidden: false });
    parts.push({ text: m[1], hidden: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), hidden: false });
  return parts;
}

export function clozeCount(text: string): number {
  return [...text.matchAll(CLOZE)].length;
}

export function stripCloze(text: string): string {
  return text.replace(CLOZE, '$1');
}

/** Separa un texto en palabras (con su espacio y puntuación) para elegir cuáles ocultar. */
export function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/**
 * Construye el texto cloze a partir de los índices de palabras ocultas.
 * Palabras ocultas contiguas forman un solo hueco; la puntuación final queda fuera.
 */
export function buildCloze(tokens: string[], hidden: Set<number>): string {
  let out = '';
  let open = false;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const isSpace = /^\s+$/.test(tok);
    if (isSpace) {
      // Un espacio entre dos palabras ocultas queda dentro del hueco.
      const nextHidden = hidden.has(i + 1);
      if (open && !nextHidden) {
        out += '}}';
        open = false;
      }
      out += tok;
      continue;
    }
    if (hidden.has(i)) {
      const [, word, punct] = tok.match(/^(.*?)([.,;:!?»”")\]]*)$/u)!;
      if (!open) {
        out += '{{';
        open = true;
      }
      out += word;
      if (punct) {
        out += '}}' + punct;
        open = false;
      }
    } else {
      if (open) {
        out += '}}';
        open = false;
      }
      out += tok;
    }
  }
  if (open) out += '}}';
  return out.replace(/\{\{\}\}/g, '');
}
