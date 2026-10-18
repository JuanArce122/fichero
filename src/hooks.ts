import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from './db/db';
import { getSettings } from './db/repo';
import { DEFAULT_SETTINGS, type ID, type Settings } from './db/types';

export function useSettings(): Settings {
  return useLiveQuery(() => getSettings(), [], DEFAULT_SETTINGS);
}

/** URL temporal para una imagen guardada en IndexedDB. */
export function useImageUrl(id?: ID): string | undefined {
  const record = useLiveQuery(() => (id ? db.images.get(id) : undefined), [id]);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!record) {
      setUrl(undefined);
      return;
    }
    const u = URL.createObjectURL(new Blob([record.data], { type: record.type }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [record]);
  return url;
}

export function useBooksMap() {
  return useLiveQuery(async () => new Map((await db.books.toArray()).map((b) => [b.id, b])), [], new Map());
}

export function useTopics() {
  return useLiveQuery(
    async () => (await db.topics.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [],
    [],
  );
}

export function useTopicsMap() {
  const topics = useTopics();
  return new Map(topics.map((t) => [t.id, t]));
}

export function useChaptersMap() {
  return useLiveQuery(async () => new Map((await db.chapters.toArray()).map((c) => [c.id, c])), [], new Map());
}
