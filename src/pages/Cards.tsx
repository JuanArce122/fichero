import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { CardView } from '../components/items';
import { Empty, PageHeader } from '../components/ui';
import { db } from '../db/db';
import { useBooksMap, useChaptersMap, useTopics } from '../hooks';

/** Caja de fichas: agrupadas por tema, mezclando libros. */
export default function Cards() {
  const topics = useTopics();
  const books = useBooksMap();
  const chapters = useChaptersMap();
  const cards = useLiveQuery(() => db.cards.orderBy('createdAt').reverse().toArray(), []);
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [showDiscarded, setShowDiscarded] = useState(false);

  if (!cards) return null;
  const visible = cards.filter((c) => showDiscarded || !c.discarded);
  const counts = new Map<string, number>();
  for (const c of visible) counts.set(c.topicId, (counts.get(c.topicId) ?? 0) + 1);
  const sections = topics
    .filter((t) => (topicFilter ? t.id === topicFilter : counts.get(t.id)))
    .map((t) => ({ topic: t, cards: visible.filter((c) => c.topicId === t.id) }));
  const discardedCount = cards.length - cards.filter((c) => !c.discarded).length;

  return (
    <div className="page wide">
      <PageHeader title="Fichas">
        <Link to="/temas" className="btn small">
          Temas
        </Link>
        <Link to="/ficha/nueva" className="btn small primary">
          <Icon name="plus" size={16} /> Ficha
        </Link>
      </PageHeader>

      {cards.length === 0 ? (
        <Empty>
          <Icon name="cards" size={36} />
          <p>
            Una ficha es una idea en tus palabras, bajo un tema. Créalas desde un subrayado, al cerrar un capítulo o
            directamente aquí.
          </p>
          <Link to="/ficha/nueva" className="btn primary">
            Crear ficha
          </Link>
        </Empty>
      ) : (
        <>
          <div className="chips">
            <button className={`chip${topicFilter === null ? ' on' : ''}`} onClick={() => setTopicFilter(null)}>
              Todas ({visible.length})
            </button>
            {topics
              .filter((t) => counts.get(t.id))
              .map((t) => (
                <button
                  key={t.id}
                  className={`chip${topicFilter === t.id ? ' on' : ''}`}
                  onClick={() => setTopicFilter(topicFilter === t.id ? null : t.id)}
                >
                  {t.name} ({counts.get(t.id)})
                </button>
              ))}
          </div>

          {sections.map(({ topic, cards: list }) => (
            <section key={topic.id} className="stack-sm">
              <div className="section-title">
                {topic.name} · {list.length}
              </div>
              {list.length === 0 ? (
                <p className="muted small">Sin fichas en este tema.</p>
              ) : (
                <div className="grid">
                  {list.map((c) => (
                    <Link key={c.id} to={`/ficha/${c.id}`} style={{ opacity: c.discarded ? 0.5 : 1 }}>
                      <CardView
                        card={c}
                        topic={topic}
                        book={c.bookId ? books.get(c.bookId) : undefined}
                        chapter={c.chapterId ? chapters.get(c.chapterId) : undefined}
                        compact
                      />
                    </Link>
                  ))}
                </div>
              )}
            </section>
          ))}

          {discardedCount > 0 && (
            <button className="btn ghost small" onClick={() => setShowDiscarded((v) => !v)}>
              {showDiscarded ? 'Ocultar descartadas' : `Mostrar descartadas (${discardedCount})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
