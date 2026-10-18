import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useState } from 'react';
import { ReviewRunner } from '../components/ReviewRunner';
import { Icon } from '../components/Icon';
import { Empty, PageHeader, Segmented, useConfirm, useToast } from '../components/ui';
import { db } from '../db/db';
import { allTags, uid } from '../db/repo';
import type { ReviewItemRef, SavedFilter } from '../db/types';
import { useSettings, useTopics } from '../hooks';
import { reviewCandidates, type ReviewFilter } from '../lib/dailyReview';
import { weightedSample } from '../lib/review';

type Size = '10' | '20' | 'all';

/**
 * Repasos temáticos: sesiones filtradas por tema, etiqueta y/o libro.
 * Dentro de cada grupo basta con que coincida uno; entre grupos deben cumplirse todos.
 */
export default function ThemedReview() {
  const topics = useTopics();
  const books = useLiveQuery(() => db.books.orderBy('updatedAt').reverse().toArray(), [], []);
  const tags = useLiveQuery(() => allTags(), [], []);
  const saved = useLiveQuery(() => db.savedFilters.orderBy('id').toArray(), [], []);
  const settings = useSettings();
  const toast = useToast();
  const confirm = useConfirm();

  const [filter, setFilter] = useState<Required<ReviewFilter>>({ topicIds: [], bookIds: [], tags: [] });
  const [size, setSize] = useState<Size>('10');
  const [session, setSession] = useState<{ items: ReviewItemRef[]; done: number[] } | null>(null);
  const [name, setName] = useState('');

  const matching = useLiveQuery(() => reviewCandidates(db, filter).then((c) => c.length), [filter], 0);
  const empty = !filter.topicIds.length && !filter.bookIds.length && !filter.tags.length;

  const toggle = (key: keyof ReviewFilter, value: string) =>
    setFilter((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value],
    }));

  const start = async (f: ReviewFilter = filter) => {
    // Aquí la frecuencia de libros y temas no aplica: lo pediste explícitamente.
    const candidates = (await reviewCandidates(db, f)).map((c) => ({ ...c, bookFrequency: undefined, topicFrequency: undefined }));
    const k = size === 'all' ? candidates.length : Number(size);
    const items = weightedSample(candidates, k, Date.now());
    if (!items.length) return toast('No hay nada con esos filtros.');
    setSession({ items, done: [] });
  };

  const saveFilter = async () => {
    if (!name.trim() || empty) return;
    const row: SavedFilter = { id: uid(), name: name.trim(), ...filter, createdAt: Date.now() };
    await db.savedFilters.add(row);
    setName('');
    toast('Repaso guardado');
  };

  const removeSaved = async (s: SavedFilter) => {
    if (await confirm({ title: `¿Borrar “${s.name}”?`, confirm: 'Borrar', danger: true })) await db.savedFilters.delete(s.id);
  };

  const onDone = useCallback((i: number) => setSession((s) => (s ? { ...s, done: [...s.done, i] } : s)), []);

  if (session) {
    const finished = session.done.length >= session.items.length;
    return (
      <div className="page">
        <PageHeader title="Repaso temático">
          <button className="btn small" onClick={() => setSession(null)}>
            Terminar
          </button>
        </PageHeader>
        {finished ? (
          <Empty>
            <Icon name="check" size={36} />
            <h2>Repaso terminado</h2>
            <p>Repasaste {session.items.length} elementos.</p>
            <button className="btn" onClick={() => setSession(null)}>
              Volver a los filtros
            </button>
          </Empty>
        ) : (
          <ReviewRunner items={session.items} done={session.done} recallFirst={settings.recallFirst} onDone={onDone} />
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Repasos temáticos" back="/repaso" />
      <p className="small muted">
        Elige temas, etiquetas o libros. Dentro de cada grupo basta con que coincida uno; si eliges en varios grupos,
        deben cumplirse todos. Los temas solo aplican a fichas.
      </p>

      {saved.length > 0 && (
        <section className="stack-sm">
          <div className="section-title">Guardados</div>
          <div className="list">
            {saved.map((s) => (
              <div key={s.id} className="list-item">
                <button
                  className="grow btn ghost"
                  style={{ justifyContent: 'flex-start', padding: 0 }}
                  onClick={() => start({ topicIds: s.topicIds, bookIds: s.bookIds, tags: s.tags })}
                >
                  {s.name}
                </button>
                <button className="btn small" onClick={() => setFilter({ topicIds: s.topicIds, bookIds: s.bookIds, tags: s.tags })}>
                  Editar
                </button>
                <button className="icon-btn" aria-label="Borrar" onClick={() => removeSaved(s)}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <FilterGroup title="Temas" items={topics.map((t) => ({ id: t.id, label: t.name }))} selected={filter.topicIds} onToggle={(v) => toggle('topicIds', v)} />
      <FilterGroup title="Etiquetas" items={tags.map((t) => ({ id: t, label: `#${t}` }))} selected={filter.tags} onToggle={(v) => toggle('tags', v)} />
      <FilterGroup title="Libros" items={books.map((b) => ({ id: b.id, label: b.title }))} selected={filter.bookIds} onToggle={(v) => toggle('bookIds', v)} />

      <div className="panel stack">
        <div className="row">
          <span className="spacer">
            {empty ? 'Sin filtros: todo tu fichero' : 'Coinciden'} · <b>{matching}</b>
          </span>
        </div>
        <Segmented
          value={size}
          onChange={setSize}
          options={[
            { value: '10', label: '10' },
            { value: '20', label: '20' },
            { value: 'all', label: 'Todos' },
          ]}
        />
        <button className="btn primary big block" onClick={() => start()} disabled={!matching}>
          Empezar repaso
        </button>
        {!empty && (
          <div className="row nowrap">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej. Manejo de la ira)" />
            <button className="btn" onClick={saveFilter} disabled={!name.trim()}>
              Guardar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterGroup({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <section className="stack-sm">
      <div className="section-title">{title}</div>
      <div className="chips">
        {items.map((i) => (
          <button key={i.id} className={`chip${selected.includes(i.id) ? ' on' : ''}`} onClick={() => onToggle(i.id)}>
            {i.label}
          </button>
        ))}
      </div>
    </section>
  );
}
