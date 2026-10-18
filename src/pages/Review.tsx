import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ReviewRunner } from '../components/ReviewRunner';
import { Empty, PageHeader } from '../components/ui';
import { db } from '../db/db';
import { dueFlashcards, getSettings } from '../db/repo';
import { useSettings } from '../hooks';
import { dayKey } from '../lib/dates';
import { getOrCreateDailySession, markSessionItemDone, reviewCandidates, unmarkSessionItemDone } from '../lib/dailyReview';
import { weightedSample } from '../lib/review';

export default function Review() {
  const settings = useSettings();
  const today = dayKey();
  const [ready, setReady] = useState(false);
  const session = useLiveQuery(() => db.dailySessions.get(today), [today]);
  const dueCards = useLiveQuery(async () => (await dueFlashcards()).length, [], 0);
  const total = useLiveQuery(async () => (await db.highlights.count()) + (await db.cards.count()), [], 0);

  // Crea la sesión de hoy al entrar (una vez cargados los ajustes).
  useEffect(() => {
    let alive = true;
    getSettings()
      .then((s) => getOrCreateDailySession(s.dailyCount))
      .then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [today]);

  const onDone = useCallback((i: number) => markSessionItemDone(today, i), [today]);
  const onUndo = useCallback((i: number) => unmarkSessionItemDone(today, i), [today]);

  const more = async () => {
    if (!session) return;
    const shown = new Set(session.items.map((x) => `${x.type}:${x.id}`));
    const candidates = (await reviewCandidates()).filter((c) => !shown.has(`${c.item.type}:${c.item.id}`));
    const extra = weightedSample(candidates, 5, Date.now());
    await db.dailySessions.update(today, { items: [...session.items, ...extra] });
  };

  if (!ready || !session) return null;
  const finished = session.done.length >= session.items.length;

  return (
    <div className="page">
      <PageHeader title="Repaso" />
      <div className="row" style={{ marginTop: -8 }}>
        <Link to="/repasos" className="btn small">
          Temáticos
        </Link>
        <Link to="/maestria" className="btn small">
          Maestría{dueCards > 0 ? ` (${dueCards})` : ''}
        </Link>
      </div>

      {total === 0 ? (
        <Empty>
          <Icon name="review" size={36} />
          <p>Cuando tengas subrayados o fichas, aquí aparecerá tu repaso diario.</p>
          <Link to="/capturar" className="btn primary">
            Capturar subrayado
          </Link>
        </Empty>
      ) : finished ? (
        <Empty>
          <Icon name="check" size={36} />
          <h2>Listo por hoy</h2>
          <p>Repasaste {session.items.length} elementos. Mañana habrá una nueva selección.</p>
          {dueCards > 0 && (
            <Link to="/maestria/repaso" className="btn primary big">
              Continuar con Maestría ({dueCards})
            </Link>
          )}
          <button className="btn" onClick={more}>
            Repasar 5 más
          </button>
        </Empty>
      ) : (
        <ReviewRunner items={session.items} done={session.done} recallFirst={settings.recallFirst} onDone={onDone} onUndo={onUndo} />
      )}
    </div>
  );
}
