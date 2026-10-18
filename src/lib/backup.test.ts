import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FicheroDB } from '../db/db';
import {
  addChapter,
  createBook,
  createCard,
  createHighlight,
  createTopic,
  getSettings,
  saveImage,
  updateSettings,
} from '../db/repo';
import {
  BACKUP_FORMAT,
  BackupError,
  SCHEMA_VERSION,
  base64ToBuffer,
  bufferToBase64,
  createBackup,
  hasUserData,
  parseBackup,
  restoreBackup,
  serializeBackup,
  summarizeBackup,
} from './backup';

let counter = 0;
let db: FicheroDB;

beforeEach(async () => {
  db = new FicheroDB(`test-${counter++}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

function imageBlob(bytes: number[]) {
  return new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
}

async function seed(target: FicheroDB) {
  const coverId = await saveImage('cover', imageBlob([1, 2, 3, 255]), target);
  const book = await createBook({ title: 'The Obstacle Is the Way', author: 'Ryan Holiday', coverId }, target);
  const chapter = await addChapter(book.id, 'Percepción', target);
  const photoId = await saveImage('page', imageBlob([9, 8, 7]), target);
  const h = await createHighlight(
    { bookId: book.id, chapterId: chapter.id, page: '12', text: 'El obstáculo es el camino', tags: ['Estoicismo'], photoId },
    target,
  );
  const topic = await createTopic('Percepción', target);
  await createCard(
    { topicId: topic.id, idea: 'Lo que impide la acción impulsa la acción', bookId: book.id, highlightIds: [h.id] },
    target,
  );
  await updateSettings({ dailyCount: 9 }, target);
  return { book, chapter, h, topic, coverId, photoId };
}

describe('base64', () => {
  it('ida y vuelta sin pérdida', () => {
    const bytes = new Uint8Array(70000).map((_, i) => i % 256);
    const back = new Uint8Array(base64ToBuffer(bufferToBase64(bytes.buffer)));
    expect(back).toEqual(bytes);
  });
});

describe('createBackup / parseBackup', () => {
  it('incluye metadatos y todas las tablas', async () => {
    await seed(db);
    const backup = await createBackup(db, { includeImages: true, now: new Date('2026-10-18T10:00:00Z') });
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION);
    expect(backup.exportedAt).toBe('2026-10-18T10:00:00.000Z');
    expect(backup.tables.books).toHaveLength(1);
    expect(backup.tables.images).toHaveLength(2);
    expect(typeof backup.tables.images[0].data).toBe('string');
  });

  it('puede excluir las fotos', async () => {
    await seed(db);
    const backup = await createBackup(db, { includeImages: false });
    expect(backup.includesImages).toBe(false);
    expect(backup.tables.images).toHaveLength(0);
    const withImages = await createBackup(db, { includeImages: true });
    expect(serializeBackup(backup).length).toBeLessThan(serializeBackup(withImages).length);
  });

  it('resume el contenido para la vista previa', async () => {
    await seed(db);
    const s = summarizeBackup(parseBackup(serializeBackup(await createBackup(db, { includeImages: true }))));
    expect(s).toMatchObject({ books: 1, highlights: 1, cards: 1, topics: 1, images: 2, includesImages: true });
    expect(s.bookTitles).toEqual(['The Obstacle Is the Way']);
  });
});

describe('parseBackup: validación', () => {
  const valid = () => ({ format: BACKUP_FORMAT, schemaVersion: 1, exportedAt: '', includesImages: false, tables: {} });

  it('rechaza JSON inválido', () => {
    expect(() => parseBackup('{no')).toThrow(BackupError);
  });

  it('rechaza archivos que no son respaldos', () => {
    expect(() => parseBackup(JSON.stringify({ hello: 1 }))).toThrow(/no es un respaldo/);
  });

  it('rechaza versiones futuras', () => {
    expect(() => parseBackup(JSON.stringify({ ...valid(), schemaVersion: SCHEMA_VERSION + 1 }))).toThrow(
      /versión más nueva/,
    );
  });

  it('rechaza versiones inválidas', () => {
    expect(() => parseBackup(JSON.stringify({ ...valid(), schemaVersion: '1' }))).toThrow(BackupError);
  });

  it('rechaza filas dañadas', () => {
    expect(() => parseBackup(JSON.stringify({ ...valid(), tables: { books: [{ title: 'sin id' }] } }))).toThrow(
      /books/,
    );
    expect(() => parseBackup(JSON.stringify({ ...valid(), tables: { highlights: 'x' } }))).toThrow(/highlights/);
  });

  it('acepta tablas ausentes como vacías', () => {
    const b = parseBackup(JSON.stringify(valid()));
    expect(b.tables.books).toEqual([]);
    expect(b.tables.settings).toEqual([]);
  });
});

describe('restoreBackup', () => {
  it('restaura exactamente los mismos datos en otro dispositivo', async () => {
    const { h, coverId } = await seed(db);
    const text = serializeBackup(await createBackup(db, { includeImages: true }));

    const other = new FicheroDB(`test-other-${counter++}`);
    try {
      expect(await hasUserData(other)).toBe(false);
      await restoreBackup(other, parseBackup(text));
      expect(await hasUserData(other)).toBe(true);
      expect(await other.highlights.get(h.id)).toEqual(await db.highlights.get(h.id));
      expect(await other.cards.toArray()).toEqual(await db.cards.toArray());
      expect((await getSettings(other)).dailyCount).toBe(9);
      const img = await other.images.get(coverId);
      expect(new Uint8Array(img!.data)).toEqual(new Uint8Array([1, 2, 3, 255]));
    } finally {
      await other.delete();
    }
  });

  it('reemplaza todo lo que había antes', async () => {
    await createBook({ title: 'Libro viejo', author: 'X' }, db);
    const source = new FicheroDB(`test-src-${counter++}`);
    try {
      await seed(source);
      await restoreBackup(db, parseBackup(serializeBackup(await createBackup(source, { includeImages: true }))));
      const titles = (await db.books.toArray()).map((b) => b.title);
      expect(titles).toEqual(['The Obstacle Is the Way']);
    } finally {
      await source.delete();
    }
  });

  it('sin fotos en el respaldo, conserva las fotos locales que siguen referenciadas', async () => {
    const { coverId, photoId } = await seed(db);
    const orphan = await saveImage('page', imageBlob([5]), db);
    const backup = parseBackup(serializeBackup(await createBackup(db, { includeImages: false })));
    await restoreBackup(db, backup);
    expect(await db.images.get(coverId)).toBeDefined();
    expect(await db.images.get(photoId)).toBeDefined();
    expect(await db.images.get(orphan)).toBeUndefined();
  });

  it('es atómico: si falla, no borra los datos existentes', async () => {
    await seed(db);
    const backup = parseBackup(serializeBackup(await createBackup(db, { includeImages: true })));
    // Dos libros con el mismo id provocan un error en bulkAdd.
    backup.tables.books.push({ ...backup.tables.books[0] });
    await expect(restoreBackup(db, backup)).rejects.toThrow();
    expect(await db.books.count()).toBe(1);
    expect(await db.highlights.count()).toBe(1);
  });
});
