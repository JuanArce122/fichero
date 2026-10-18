// Respaldo completo en JSON, versionado para migraciones futuras.
//
// Formato:
// {
//   "format": "fichero-backup",
//   "schemaVersion": 1,
//   "exportedAt": "2026-10-18T12:00:00.000Z",
//   "includesImages": false,
//   "tables": { "books": [...], "highlights": [...], ..., "images": [...] }
// }
// Las imágenes se guardan en base64 (solo si includesImages es true).

import { BACKUP_TABLES, type BackupTable, type FicheroDB } from '../db/db';
import type { ImageRecord } from '../db/types';

export const BACKUP_FORMAT = 'fichero-backup';
export const SCHEMA_VERSION = 1;

export interface SerializedImage extends Omit<ImageRecord, 'data'> {
  data: string;
}

export type BackupTables = { [K in BackupTable]: K extends 'images' ? SerializedImage[] : Record<string, unknown>[] };

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  includesImages: boolean;
  tables: BackupTables;
}

/** Clave primaria de cada tabla, para validar filas. */
const PRIMARY_KEY: Record<BackupTable, string> = {
  books: 'id',
  chapters: 'id',
  highlights: 'id',
  topics: 'id',
  cards: 'id',
  images: 'id',
  dailySessions: 'date',
  flashcards: 'id',
  practices: 'id',
  journal: 'id',
  savedFilters: 'id',
  settings: 'key',
};

/**
 * Migraciones de respaldos antiguos: MIGRATIONS[n] convierte un respaldo de la
 * versión n a la n + 1. Al cambiar el esquema, sube SCHEMA_VERSION y agrega aquí
 * la migración correspondiente (y su test).
 */
export const MIGRATIONS: Record<number, (b: BackupFile) => BackupFile> = {};

// ---------- base64 ----------

export function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ---------- exportar ----------

export async function createBackup(
  db: FicheroDB,
  opts: { includeImages: boolean; now?: Date },
): Promise<BackupFile> {
  const tables = {} as BackupTables;
  await db.transaction('r', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const name of BACKUP_TABLES) {
      if (name === 'images') {
        if (!opts.includeImages) {
          tables.images = [];
          continue;
        }
        const imgs = (await db.images.toArray()) as ImageRecord[];
        tables.images = imgs.map((img) => ({ ...img, data: bufferToBase64(img.data) }));
      } else {
        (tables as Record<string, unknown[]>)[name] = await db.table(name).toArray();
      }
    }
  });
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: (opts.now ?? new Date()).toISOString(),
    includesImages: opts.includeImages,
    tables,
  };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup);
}

export function backupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `fichero-respaldo-${stamp}.json`;
}

// ---------- importar ----------

export class BackupError extends Error {}

/** Lee, valida y migra un respaldo. Lanza BackupError con un mensaje en español. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('El archivo no es un JSON válido.');
  }
  if (!raw || typeof raw !== 'object' || (raw as { format?: unknown }).format !== BACKUP_FORMAT) {
    throw new BackupError('El archivo no es un respaldo de Fichero.');
  }
  const obj = raw as Record<string, unknown>;
  const version = obj.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new BackupError('El respaldo no indica una versión de esquema válida.');
  }
  if (version > SCHEMA_VERSION) {
    throw new BackupError(
      `Este respaldo es de una versión más nueva de la app (esquema ${version}). Actualiza la app e inténtalo de nuevo.`,
    );
  }
  if (!obj.tables || typeof obj.tables !== 'object') {
    throw new BackupError('El respaldo no contiene datos.');
  }

  const rawTables = obj.tables as Record<string, unknown>;
  const tables = {} as BackupTables;
  for (const name of BACKUP_TABLES) {
    const rows = rawTables[name] ?? [];
    if (!Array.isArray(rows)) throw new BackupError(`La tabla "${name}" está dañada.`);
    const key = PRIMARY_KEY[name];
    rows.forEach((row, i) => {
      if (!row || typeof row !== 'object' || typeof (row as Record<string, unknown>)[key] !== 'string') {
        throw new BackupError(`La fila ${i + 1} de "${name}" está dañada.`);
      }
      if (name === 'images' && typeof (row as Record<string, unknown>).data !== 'string') {
        throw new BackupError(`La imagen ${i + 1} está dañada.`);
      }
    });
    (tables as Record<string, unknown[]>)[name] = rows;
  }

  let backup: BackupFile = {
    format: BACKUP_FORMAT,
    schemaVersion: version,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
    includesImages: obj.includesImages === true,
    tables,
  };

  while (backup.schemaVersion < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[backup.schemaVersion];
    if (!migrate) throw new BackupError(`No hay migración desde la versión ${backup.schemaVersion}.`);
    backup = migrate(backup);
  }
  return backup;
}

export interface BackupSummary {
  exportedAt: string;
  includesImages: boolean;
  books: number;
  highlights: number;
  cards: number;
  topics: number;
  flashcards: number;
  journal: number;
  practices: number;
  images: number;
  bookTitles: string[];
}

export function summarizeBackup(b: BackupFile): BackupSummary {
  return {
    exportedAt: b.exportedAt,
    includesImages: b.includesImages,
    books: b.tables.books.length,
    highlights: b.tables.highlights.length,
    cards: b.tables.cards.length,
    topics: b.tables.topics.length,
    flashcards: b.tables.flashcards.length,
    journal: b.tables.journal.length,
    practices: b.tables.practices.length,
    images: b.tables.images.length,
    bookTitles: b.tables.books.map((x) => String(x.title ?? '')).filter(Boolean),
  };
}

/** ¿Hay datos del usuario en este dispositivo? (ignora ajustes y sesiones). */
export async function hasUserData(db: FicheroDB): Promise<boolean> {
  const counts = await Promise.all([
    db.books.count(),
    db.highlights.count(),
    db.cards.count(),
    db.flashcards.count(),
    db.journal.count(),
  ]);
  return counts.some((n) => n > 0);
}

/**
 * Reemplaza TODOS los datos por los del respaldo, en una sola transacción
 * (si algo falla, no se pierde nada).
 * Si el respaldo no trae fotos, se conservan las fotos locales que el respaldo
 * siga referenciando (mismo libro/subrayado en este dispositivo).
 */
export async function restoreBackup(db: FicheroDB, backup: BackupFile): Promise<void> {
  await db.transaction('rw', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    let keptImages: ImageRecord[] = [];
    if (!backup.includesImages) {
      const referenced = new Set<string>();
      for (const b of backup.tables.books) if (typeof b.coverId === 'string') referenced.add(b.coverId);
      for (const h of backup.tables.highlights) if (typeof h.photoId === 'string') referenced.add(h.photoId);
      const existing = (await db.images.bulkGet([...referenced])) as (ImageRecord | undefined)[];
      keptImages = existing.filter((x): x is ImageRecord => !!x);
    }

    for (const name of BACKUP_TABLES) await db.table(name).clear();

    for (const name of BACKUP_TABLES) {
      if (name === 'images') {
        const imgs: ImageRecord[] = backup.includesImages
          ? backup.tables.images.map((img) => ({ ...img, data: base64ToBuffer(img.data) }))
          : keptImages;
        await db.images.bulkAdd(imgs);
      } else {
        await db.table(name).bulkAdd(backup.tables[name]);
      }
    }
  });
}
