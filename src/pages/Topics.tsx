import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { PageHeader, Segmented, Sheet, useToast } from '../components/ui';
import { db } from '../db/db';
import { createTopic, deleteTopic, ensureDefaultTopics } from '../db/repo';
import { FREQUENCY_LABELS, type Frequency, type Topic } from '../db/types';
import { useTopics } from '../hooks';

export default function Topics() {
  const topics = useTopics();
  const counts = useLiveQuery(async () => {
    const m = new Map<string, number>();
    for (const c of await db.cards.toArray()) m.set(c.topicId, (m.get(c.topicId) ?? 0) + 1);
    return m;
  }, [], new Map<string, number>());
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Topic | null>(null);

  useEffect(() => {
    ensureDefaultTopics();
  }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createTopic(name);
    setName('');
  };

  return (
    <div className="page">
      <PageHeader title="Temas" back />
      <p className="muted small">
        Los temas son las categorías de tu caja de fichas. Ajusta su frecuencia para ver más o menos sus fichas en el
        repaso.
      </p>

      <div className="list">
        {topics.map((t) => (
          <button key={t.id} className="list-item" onClick={() => setEditing(t)}>
            <span className="grow">
              {t.name}
              <div className="tiny muted">
                {counts.get(t.id) ?? 0} fichas
                {t.frequency !== 'normal' && ` · repaso: ${FREQUENCY_LABELS[t.frequency].toLowerCase()}`}
              </div>
            </span>
            <Icon name="chevron" size={18} />
          </button>
        ))}
      </div>

      <form className="row nowrap" onSubmit={add}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nuevo tema (ej. Ira, Ego…)" />
        <button className="btn primary" type="submit" disabled={!name.trim()}>
          Agregar
        </button>
      </form>

      <TopicSheet topic={editing} topics={topics} count={editing ? counts.get(editing.id) ?? 0 : 0} onClose={() => setEditing(null)} />
    </div>
  );
}

function TopicSheet({ topic, topics, count, onClose }: { topic: Topic | null; topics: Topic[]; count: number; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('normal');
  const [moveTo, setMoveTo] = useState('');
  const others = topics.filter((t) => t.id !== topic?.id);

  useEffect(() => {
    if (!topic) return;
    setName(topic.name);
    setFrequency(topic.frequency);
    setMoveTo(others[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);

  if (!topic) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await db.topics.update(topic.id, { name: name.trim(), frequency });
    onClose();
  };

  const remove = async () => {
    if (!moveTo) return toast('Crea otro tema antes de borrar este.');
    await deleteTopic(topic.id, moveTo);
    onClose();
  };

  return (
    <Sheet open onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <h2>Editar tema</h2>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="field">
          <span>Frecuencia en el repaso</span>
          <Segmented
            value={frequency}
            onChange={setFrequency}
            options={(['more', 'normal', 'less', 'never'] as const).map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }))}
          />
        </div>
        <button className="btn primary" type="submit">
          Guardar
        </button>
        {others.length > 0 && (
          <div className="panel stack-sm">
            <span className="small muted">
              Eliminar tema{count > 0 ? ` y mover sus ${count} fichas a:` : ''}
            </span>
            {count > 0 && (
              <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                {others.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="btn danger" onClick={remove}>
              Eliminar tema
            </button>
          </div>
        )}
      </form>
    </Sheet>
  );
}
