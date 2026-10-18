import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db/db';
import { updateCard, updateHighlight } from '../db/repo';
import type { ReviewItemRef } from '../db/types';
import { useBooksMap, useChaptersMap, useTopicsMap } from '../hooks';
import { recordOutcome } from '../lib/dailyReview';
import { teaser, type ReviewOutcome } from '../lib/review';
import { Icon } from './Icon';
import { CardView, HighlightView } from './items';
import { Sheet } from './ui';

/**
 * Muestra una lista de elementos (subrayados y fichas) uno a uno, con las
 * acciones del repaso. Lo usan el repaso diario y los repasos temáticos.
 */
export function ReviewRunner({
  items,
  done,
  recallFirst,
  onDone,
}: {
  items: ReviewItemRef[];
  done: number[];
  recallFirst: boolean;
  onDone: (index: number) => void;
}) {
  const index = items.findIndex((_, i) => !done.includes(i));
  const ref = index >= 0 ? items[index] : undefined;
  const [revealed, setRevealed] = useState(!recallFirst);
  const [noteOpen, setNoteOpen] = useState(false);
  const books = useBooksMap();
  const chapters = useChaptersMap();
  const topics = useTopicsMap();

  const item = useLiveQuery(async () => {
    if (!ref) return null;
    if (ref.type === 'card') {
      const card = await db.cards.get(ref.id);
      return card ? { type: 'card' as const, card } : { type: 'missing' as const };
    }
    const h = await db.highlights.get(ref.id);
    return h ? { type: 'highlight' as const, h } : { type: 'missing' as const };
  }, [ref?.type, ref?.id]);

  useEffect(() => setRevealed(!recallFirst), [index, recallFirst]);

  // Si un elemento se borró desde otro lugar, lo saltamos.
  useEffect(() => {
    if (item?.type === 'missing' && index >= 0) onDone(index);
  }, [item, index, onDone]);

  if (!ref || !item || item.type === 'missing') return null;

  const finish = async (outcome: ReviewOutcome) => {
    await recordOutcome(ref, outcome);
    onDone(index);
  };

  const toggle = async (field: 'favorite' | 'discarded') => {
    if (item.type === 'card') await updateCard(item.card.id, { [field]: !item.card[field] });
    else await updateHighlight(item.h.id, { [field]: !item.h[field] });
    if (field === 'discarded') await finish('seen');
  };

  const favorite = item.type === 'card' ? item.card.favorite : item.h.favorite;
  const editTo = item.type === 'card' ? `/ficha/${item.card.id}/editar` : `/subrayado/${item.h.id}`;
  const progress = (done.length / items.length) * 100;

  return (
    <div className="review-stage">
      <div className="row nowrap small muted">
        <span>
          {done.length + 1} de {items.length}
        </span>
        <div className="progress spacer">
          <div style={{ width: `${progress}%` }} />
        </div>
      </div>

      {!revealed ? (
        <article className="fcard">
          <div className="topic">
            {item.type === 'card' ? topics.get(item.card.topicId)?.name ?? 'Ficha' : books.get(item.h.bookId)?.title ?? 'Subrayado'}
          </div>
          <div className="idea muted">{teaser(item.type === 'card' ? item.card.idea : item.h.text)}</div>
          <p className="small muted">Intenta recordar la idea completa antes de revelarla.</p>
          <button className="btn primary big" onClick={() => setRevealed(true)}>
            <Icon name="eye" /> Mostrar
          </button>
        </article>
      ) : item.type === 'card' ? (
        <CardView
          card={item.card}
          topic={topics.get(item.card.topicId)}
          book={item.card.bookId ? books.get(item.card.bookId) : undefined}
          chapter={item.card.chapterId ? chapters.get(item.card.chapterId) : undefined}
        />
      ) : (
        <article className="fcard">
          <div className="topic">Subrayado</div>
          <HighlightView
            h={item.h}
            book={books.get(item.h.bookId)}
            chapter={item.h.chapterId ? chapters.get(item.h.chapterId) : undefined}
          />
        </article>
      )}

      {revealed && (
        <>
          <div className="actions-2">
            <button className="btn big" onClick={() => finish('missed')}>
              No lo recordaba
            </button>
            <button className="btn big primary" onClick={() => finish('recalled')}>
              Lo recordaba
            </button>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className={`icon-btn${favorite ? ' on' : ''}`} aria-label="Favorito" onClick={() => toggle('favorite')}>
              <Icon name="star" filled={favorite} />
            </button>
            <Link to={editTo} className="icon-btn" aria-label="Editar">
              <Icon name="edit" />
            </Link>
            <button className="icon-btn" aria-label="Agregar nota" onClick={() => setNoteOpen(true)}>
              <Icon name="note" />
            </button>
            <button className="icon-btn" aria-label="Descartar" onClick={() => toggle('discarded')}>
              <Icon name="archive" />
            </button>
            <button className="btn small ghost" onClick={() => finish('seen')}>
              Siguiente <Icon name="chevron" size={16} />
            </button>
          </div>
        </>
      )}

      <NoteSheet
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        current={item.type === 'card' ? item.card.note : item.h.note}
        onSave={async (note) => {
          if (item.type === 'card') await updateCard(item.card.id, { note });
          else await updateHighlight(item.h.id, { note });
        }}
      />
    </div>
  );
}

function NoteSheet({
  open,
  onClose,
  current,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  current: string;
  onSave: (note: string) => Promise<void>;
}) {
  const [text, setText] = useState(current);
  useEffect(() => {
    if (open) setText(current);
  }, [open, current]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await onSave(text.trim());
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <h2>Nota</h2>
        <textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        <div className="actions-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary">
            Guardar
          </button>
        </div>
      </form>
    </Sheet>
  );
}
