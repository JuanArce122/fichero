import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClozeText } from '../components/ClozeText';
import { Icon } from '../components/Icon';
import { Empty, PageHeader } from '../components/ui';
import { db } from '../db/db';
import { formatInterval } from '../lib/mastery';

/** Lista de flashcards y acceso al repaso FSRS. */
export default function Mastery() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const cards = useLiveQuery(() => db.flashcards.orderBy('due').toArray(), []);
  if (!cards) return null;
  const active = cards.filter((c) => !c.suspended);
  const due = active.filter((c) => c.due <= now);
  const next = active.find((c) => c.due > now);

  return (
    <div className="page">
      <PageHeader title="Maestría" back>
        <Link to="/maestria/nueva" className="btn small">
          <Icon name="plus" size={16} /> Nueva
        </Link>
      </PageHeader>

      {cards.length === 0 ? (
        <Empty>
          <p>
            Las flashcards usan repetición espaciada (FSRS): cada tarjeta vuelve justo antes de que la olvides. Créalas
            desde cualquier subrayado o ficha con “Crear flashcard”.
          </p>
        </Empty>
      ) : (
        <>
          <div className="panel stack center">
            <div style={{ fontSize: '2.2rem', fontWeight: 700 }}>{due.length}</div>
            <div className="muted">{due.length === 1 ? 'tarjeta por repasar' : 'tarjetas por repasar'}</div>
            {due.length > 0 ? (
              <Link to="/maestria/repaso" className="btn primary big block">
                Repasar ahora
              </Link>
            ) : (
              next && <div className="small muted">La próxima vence en {formatInterval(next.due - now)}.</div>
            )}
          </div>

          <div className="section-title">Todas · {cards.length}</div>
          <div className="list">
            {cards.map((c) => (
              <Link key={c.id} to={`/maestria/${c.id}`} className="list-item" style={{ opacity: c.suspended ? 0.5 : 1 }}>
                <div className="grow">
                  <div className="clamp-3" style={{ fontFamily: 'var(--font-read)' }}>
                    {c.kind === 'cloze' ? <ClozeText text={c.text} revealed /> : c.question}
                  </div>
                  <div className="tiny muted">
                    {c.suspended ? 'Suspendida' : c.due <= now ? 'Para hoy' : `En ${formatInterval(c.due - now)}`}
                    {c.kind === 'qa' ? ' · pregunta' : ' · huecos'}
                  </div>
                </div>
                <Icon name="chevron" size={18} />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
