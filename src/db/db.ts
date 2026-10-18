import Dexie, { type EntityTable } from 'dexie';
import type {
  Book,
  Card,
  Chapter,
  DailySession,
  Flashcard,
  Highlight,
  ImageRecord,
  JournalEntry,
  Practice,
  SavedFilter,
  SettingRow,
  Topic,
} from './types';

export class FicheroDB extends Dexie {
  books!: EntityTable<Book, 'id'>;
  chapters!: EntityTable<Chapter, 'id'>;
  highlights!: EntityTable<Highlight, 'id'>;
  topics!: EntityTable<Topic, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  images!: EntityTable<ImageRecord, 'id'>;
  dailySessions!: EntityTable<DailySession, 'date'>;
  flashcards!: EntityTable<Flashcard, 'id'>;
  practices!: EntityTable<Practice, 'id'>;
  journal!: EntityTable<JournalEntry, 'id'>;
  savedFilters!: EntityTable<SavedFilter, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;

  constructor(name = 'fichero') {
    super(name);
    this.version(1).stores({
      books: 'id, status, updatedAt',
      chapters: 'id, bookId, [bookId+order]',
      highlights: 'id, bookId, chapterId, createdAt, *tags',
      topics: 'id, name',
      cards: 'id, topicId, bookId, chapterId, createdAt, *tags',
      images: 'id',
      dailySessions: 'date',
      flashcards: 'id, due, sourceId',
      practices: 'id, status, cardId',
      journal: 'id, date',
      savedFilters: 'id',
      settings: 'key',
    });
  }
}

export const db = new FicheroDB();

/** Tablas incluidas en el respaldo, en orden estable. */
export const BACKUP_TABLES = [
  'books',
  'chapters',
  'highlights',
  'topics',
  'cards',
  'images',
  'dailySessions',
  'flashcards',
  'practices',
  'journal',
  'savedFilters',
  'settings',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];
