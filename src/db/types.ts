// Modelo de datos. Todo se guarda localmente en IndexedDB (Dexie).
// Las fechas son timestamps en milisegundos; los días de calendario, 'YYYY-MM-DD'.

export type ID = string;

export type BookStatus = 'reading' | 'resting' | 'finished' | 'processed';
export type Frequency = 'more' | 'normal' | 'less' | 'never';

/** Estado del repaso diario ponderado (no confundir con FSRS de Maestría). */
export interface ReviewMeta {
  lastShownAt?: number;
  /** Días que tarda el peso en recuperarse por completo después de mostrarse. */
  recoveryDays: number;
  shown: number;
  recalled: number;
  missed: number;
}

export interface Book {
  id: ID;
  title: string;
  author: string;
  coverId?: ID;
  status: BookStatus;
  frequency: Frequency;
  /** Momento en que pasó a "en reposo" (al terminarlo). */
  restingSince?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Chapter {
  id: ID;
  bookId: ID;
  title: string;
  order: number;
  createdAt: number;
}

export interface Highlight {
  id: ID;
  bookId: ID;
  chapterId?: ID;
  page?: string;
  text: string;
  note: string;
  tags: string[];
  photoId?: ID;
  favorite: boolean;
  discarded: boolean;
  /** Ya se revisó en la sesión de transferencia (se convirtió en ficha o se descartó). */
  processed: boolean;
  review: ReviewMeta;
  createdAt: number;
  updatedAt: number;
}

export interface Topic {
  id: ID;
  name: string;
  frequency: Frequency;
  createdAt: number;
}

export type CardSource = 'manual' | 'chapter-close' | 'transfer' | 'highlight';

/** Ficha temática estilo commonplace book (tarjeta 4x6). */
export interface Card {
  id: ID;
  topicId: ID;
  idea: string;
  quote: string;
  note: string;
  application: string;
  bookId?: ID;
  chapterId?: ID;
  page?: string;
  highlightIds: ID[];
  tags: string[];
  favorite: boolean;
  discarded: boolean;
  source: CardSource;
  review: ReviewMeta;
  createdAt: number;
  updatedAt: number;
}

export interface ImageRecord {
  id: ID;
  kind: 'cover' | 'page';
  type: string;
  /** ArrayBuffer en vez de Blob: más portable entre motores y fácil de serializar. */
  data: ArrayBuffer;
  createdAt: number;
}

export type ReviewItemRef = { type: 'highlight' | 'card'; id: ID };

export interface DailySession {
  date: string;
  items: ReviewItemRef[];
  /** Índices ya trabajados. */
  done: number[];
  createdAt: number;
}

export type FlashcardKind = 'cloze' | 'qa';

/** Tarjeta de Maestría (FSRS). El estado FSRS se guarda tal cual lo produce ts-fsrs. */
export interface Flashcard {
  id: ID;
  kind: FlashcardKind;
  sourceType?: 'highlight' | 'card';
  sourceId?: ID;
  /** Cloze: texto con marcadores {{palabras}}. */
  text: string;
  question: string;
  answer: string;
  fsrs: Record<string, unknown>;
  due: number;
  suspended: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WeeklyCheckin {
  date: string;
  applied: boolean;
  note: string;
}

/** Idea de la semana: una ficha practicada durante 7 días. */
export interface Practice {
  id: ID;
  cardId: ID;
  startDate: string;
  endDate: string;
  checkins: WeeklyCheckin[];
  reflection: string;
  status: 'active' | 'completed' | 'stopped';
  createdAt: number;
}

export interface JournalEntry {
  id: ID;
  date: string;
  answers: { question: string; answer: string }[];
  cardIds: ID[];
  createdAt: number;
  updatedAt: number;
}

export interface SavedFilter {
  id: ID;
  name: string;
  topicIds: ID[];
  bookIds: ID[];
  tags: string[];
  createdAt: number;
}

export interface Settings {
  dailyCount: number;
  recallFirst: boolean;
  backupReminderDays: number;
  restDays: number;
  includePhotosInBackup: boolean;
  journalQuestions: string[];
  lastBackupAt?: number;
  lastBookId?: ID;
  lastChapterId?: ID;
}

export interface SettingRow {
  key: 'settings';
  value: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  dailyCount: 7,
  recallFirst: false,
  backupReminderDays: 7,
  restDays: 14,
  includePhotosInBackup: false,
  journalQuestions: [
    '¿Qué obstáculo tuve hoy?',
    '¿Cómo lo usé o cómo pude haberlo usado?',
    '¿Qué haré distinto mañana?',
  ],
};

export const STATUS_LABELS: Record<BookStatus, string> = {
  reading: 'Leyendo',
  resting: 'En reposo',
  finished: 'Terminado',
  processed: 'Procesado',
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  more: 'Más',
  normal: 'Normal',
  less: 'Menos',
  never: 'Nunca',
};
