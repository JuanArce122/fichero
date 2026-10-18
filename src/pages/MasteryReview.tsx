import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClozeText } from '../components/ClozeText';
import { Icon } from '../components/Icon';
import { Empty, PageHeader } from '../components/ui';
import { db } from '../db/db';
import { dueFlashcards, gradeFlashcard } from '../db/repo';
import { RATING_LABELS, Rating, formatInterval, previewIntervals, type Grade } from '../lib/mastery';

const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

/** Sesión FSRS: muestra las tarjetas vencidas hasta que no quede ninguna. */
export default function MasteryReview() {
  const [now, setNow] = useState(Date.now());
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const grading = useRef(false);

  // Las tarjetas con pasos cortos (1-10 min) vuelven a aparecer al vencer.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  const due = useLiveQuery(() => dueFlashcards(undefined, now), [now]);
  const nextLater = useLiveQuery(
    async () => (await db.flashcards.where('due').above(now).toArray()).filter((c) => !c.suspended).sort((a, b) => a.due - b.due)[0],
    [now],
  );
  const card = due?.[0];
  const source = useLiveQuery(async () => {
    if (!card?.sourceId) return null;
    if (card.sourceType === 'card') {
      const c = await db.cards.get(card.sourceId);
      const topic = c && (await db.topics.get(c.topicId));
      return topic?.name ?? null;
    }
    const h = await db.highlights.get(card.sourceId);
    const b = h && (await db.books.get(h.bookId));
    return b?.title ?? null;
  }, [card?.id]);

  useEffect(() => setRevealed(false), [card?.id]);

  if (!due) return null;

  const rate = async (r: Grade) => {
    if (!card || grading.current) return;
    grading.current = true;
    await gradeFlashcard(card.id, r).finally(() => (grading.current = false));
    setReviewed((n) => n + 1);
    setNow(Date.now());
  };

  const intervals = card ? previewIntervals(card.fsrs) : null;

  return (
    <div className="page">
      <PageHeader title="Maestría" back="/maestria">
        {card && <span className="small muted">{due.length} por repasar</span>}
      </PageHeader>

      {!card ? (
        <Empty>
          <Icon name="check" size={36} />
          <h2>{reviewed ? '¡Listo!' : 'Nada por repasar'}</h2>
          {reviewed > 0 && <p>Repasaste {reviewed} {reviewed === 1 ? 'tarjeta' : 'tarjetas'}.</p>}
          {nextLater && <p className="small">La próxima vence en {formatInterval(nextLater.due - Date.now())}.</p>}
          <Link to="/" className="btn">
            Volver al inicio
          </Link>
        </Empty>
      ) : (
        <div className="review-stage">
          <article className="fcard">
            <div className="topic">{source ?? (card.kind === 'qa' ? 'Pregunta' : 'Completa')}</div>
            {card.kind === 'cloze' ? (
              <div className="idea">
                <ClozeText text={card.text} revealed={revealed} />
              </div>
            ) : (
              <>
                <div className="idea">{card.question}</div>
                {revealed && (
                  <div className="stack-sm">
                    <span className="label">Respuesta</span>
                    <div className="reading-text">{card.answer}</div>
                  </div>
                )}
              </>
            )}
          </article>

          {!revealed ? (
            <button className="btn primary big block" onClick={() => setRevealed(true)}>
              <Icon name="eye" /> Mostrar respuesta
            </button>
          ) : (
            <div className="grades">
              {GRADES.map((g) => (
                <button key={g} className={`btn${g === Rating.Good ? ' primary' : ''}`} onClick={() => rate(g)}>
                  {RATING_LABELS[g]}
                  <small>{intervals?.[g]}</small>
                </button>
              ))}
            </div>
          )}
          <Link to={`/maestria/${card.id}`} className="btn small ghost" style={{ alignSelf: 'center' }}>
            Editar tarjeta
          </Link>
        </div>
      )}
    </div>
  );
}
