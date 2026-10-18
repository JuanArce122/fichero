import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import type { Card } from '../db/types';
import { useTopicsMap } from '../hooks';
import { normalize } from '../lib/text';
import { Sheet } from './ui';

/** Hoja para elegir una ficha (buscando por texto). */
export function CardPicker({
  open,
  onClose,
  onPick,
  exclude = [],
  title = 'Elegir ficha',
}: {
  open: boolean;
  onClose: () => void;
  onPick: (card: Card) => void;
  exclude?: string[];
  title?: string;
}) {
  const [q, setQ] = useState('');
  const topics = useTopicsMap();
  const cards = useLiveQuery(() => db.cards.orderBy('createdAt').reverse().toArray(), [], []);
  const query = normalize(q);
  const list = cards
    .filter((c) => !c.discarded && !exclude.includes(c.id))
    .filter((c) => !query || normalize(`${c.idea} ${c.quote} ${topics.get(c.topicId)?.name ?? ''}`).includes(query))
    .slice(0, 50);

  return (
    <Sheet open={open} onClose={onClose}>
      <h2>{title}</h2>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en mis fichas…" />
      <div className="list">
        {list.map((c) => (
          <button
            key={c.id}
            className="list-item"
            onClick={() => {
              onPick(c);
              onClose();
            }}
          >
            <div className="grow">
              <div className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {topics.get(c.topicId)?.name}
              </div>
              <div className="clamp-3">{c.idea}</div>
            </div>
          </button>
        ))}
        {list.length === 0 && <div className="list-item muted">No hay fichas que coincidan.</div>}
      </div>
    </Sheet>
  );
}
