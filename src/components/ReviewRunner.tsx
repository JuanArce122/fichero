import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import { updateBook, updateCard, updateHighlight } from '../db/repo';
import { FREQUENCY_LABELS, type Frequency, type ReviewItemRef, type ReviewMeta } from '../db/types';
import { useBooksMap, useChaptersMap, useTopicsMap } from '../hooks';
import { recordOutcome, restoreReview } from '../lib/dailyReview';
import { teaser, type ReviewOutcome } from '../lib/review';
import { canSpeak, speak, stopSpeaking } from '../lib/speech';
import { Icon } from './Icon';
import { CardView, HighlightView } from './items';
import { SwipeCard } from './SwipeCard';
import { Segmented, Sheet, useToast } from './ui';

const OUTCOME_TOAST: Record<ReviewOutcome, string> = {
  recalled: 'Lo recordabas',
  missed: 'Volverá antes',
  seen: 'Siguiente',
};

/**
 * Muestra una lista de elementos (subrayados y fichas) uno a uno, con las
 * acciones del repaso. Lo usan el repaso diario y los repasos temáticos.
 *
 * Gestos: desliza → "Lo recordaba", ← "No lo recordaba".
 * Teclado (iPad/Mac): Espacio revela · → / 2 recordaba · ← / 1 no · ↓ siguiente ·
 * F favorito · D descartar · N nota · E editar · L escuchar.
 */
export function ReviewRunner({
  items,
  done,
  recallFirst,
  onDone,
  onUndo,
}: {
  items: ReviewItemRef[];
  done: number[];
  recallFirst: boolean;
  onDone: (index: number) => void | Promise<void>;
  onUndo?: (index: number) => void | Promise<void>;
}) {
  const index = items.findIndex((_, i) => !done.includes(i));
  const ref = index >= 0 ? items[index] : undefined;
  const [revealed, setRevealed] = useState(!recallFirst);
  const [noteOpen, setNoteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  // Evita registrar dos veces un doble toque rápido.
  const busy = useRef(false);
  const navigate = useNavigate();
  const toast = useToast();
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

  useEffect(() => {
    setRevealed(!recallFirst);
    stopSpeaking();
    setSpeaking(false);
  }, [index, recallFirst]);

  useEffect(() => () => stopSpeaking(), []);

  // Si un elemento se borró desde otro lugar, lo saltamos.
  useEffect(() => {
    if (item?.type === 'missing' && index >= 0) onDone(index);
  }, [item, index, onDone]);

  const ready = !!ref && !!item && item.type !== 'missing';

  const finish = useCallback(
    async (outcome: ReviewOutcome, extra?: { message: string; revert: () => Promise<void> }) => {
      if (!ref || !item || item.type === 'missing' || busy.current) return;
      busy.current = true;
      const previous: ReviewMeta = item.type === 'card' ? item.card.review : item.h.review;
      const i = index;
      try {
        await recordOutcome(ref, outcome);
        await onDone(i);
      } finally {
        busy.current = false;
      }
      if (onUndo) {
        toast(extra?.message ?? OUTCOME_TOAST[outcome], {
          label: 'Deshacer',
          run: async () => {
            await restoreReview(ref, previous);
            await extra?.revert();
            onUndo(i);
          },
        });
      }
    },
    [ref, item, index, onDone, onUndo, toast],
  );

  const toggle = useCallback(
    async (field: 'favorite' | 'discarded') => {
      if (!item || item.type === 'missing') return;
      const current = item.type === 'card' ? item.card[field] : item.h[field];
      const set = (v: boolean) =>
        item.type === 'card' ? updateCard(item.card.id, { [field]: v }) : updateHighlight(item.h.id, { [field]: v });
      await set(!current);
      if (field === 'discarded') {
        await finish('seen', { message: 'Descartado: ya no saldrá en el repaso', revert: () => set(current) });
      } else {
        toast(current ? 'Quitado de favoritos' : 'Marcado como favorito');
      }
    },
    [item, finish, toast],
  );

  const text = !ready ? '' : item.type === 'card' ? [item.card.idea, item.card.quote].filter(Boolean).join('. ') : item.h.text;
  const editTo = !ready ? '' : item.type === 'card' ? `/ficha/${item.card.id}/editar` : `/subrayado/${item.h.id}`;

  const toggleSpeak = useCallback(() => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
    } else {
      setSpeaking(true);
      speak(text, () => setSpeaking(false));
    }
  }, [speaking, text]);

  // Atajos de teclado para iPad con teclado y Mac.
  useEffect(() => {
    if (!ready) return;
    const onKey = (e: KeyboardEvent) => {
      if (noteOpen || menuOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      if (!revealed) {
        if (k === ' ' || k === 'enter') {
          e.preventDefault();
          setRevealed(true);
        }
        return;
      }
      const actions: Record<string, () => void> = {
        arrowright: () => finish('recalled'),
        '2': () => finish('recalled'),
        arrowleft: () => finish('missed'),
        '1': () => finish('missed'),
        arrowdown: () => finish('seen'),
        ' ': () => finish('seen'),
        f: () => toggle('favorite'),
        d: () => toggle('discarded'),
        n: () => setNoteOpen(true),
        e: () => navigate(editTo),
        l: () => canSpeak() && toggleSpeak(),
      };
      const run = actions[k];
      if (run) {
        e.preventDefault();
        run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ready, revealed, noteOpen, menuOpen, finish, toggle, navigate, editTo, toggleSpeak]);

  if (!ready) return null;

  const favorite = item.type === 'card' ? item.card.favorite : item.h.favorite;
  const progress = (done.length / items.length) * 100;
  const book = item.type === 'card' ? (item.card.bookId ? books.get(item.card.bookId) : undefined) : books.get(item.h.bookId);
  const topic = item.type === 'card' ? topics.get(item.card.topicId) : undefined;

  return (
    <div className="review-stage">
      <div className="row nowrap small muted">
        <span>
          {done.length + 1} de {items.length}
        </span>
        <div className="progress spacer">
          <div style={{ width: `${progress}%` }} />
        </div>
        {canSpeak() && revealed && (
          <button className={`icon-btn${speaking ? ' on' : ''}`} aria-label={speaking ? 'Detener lectura' : 'Escuchar'} onClick={toggleSpeak}>
            <Icon name={speaking ? 'stop' : 'speaker'} size={20} />
          </button>
        )}
        <button className="icon-btn" aria-label="Más opciones" onClick={() => setMenuOpen(true)}>
          <Icon name="more" size={20} />
        </button>
      </div>

      <SwipeCard
        enabled={revealed}
        leftLabel="No lo recordaba"
        rightLabel="Lo recordaba"
        onSwipe={(dir) => finish(dir === 'right' ? 'recalled' : 'missed')}
      >
        {!revealed ? (
          <article className="fcard" onClick={() => setRevealed(true)} style={{ cursor: 'pointer' }}>
            <div className="topic">{topic?.name ?? (item.type === 'card' ? 'Ficha' : book?.title ?? 'Subrayado')}</div>
            <div className="idea muted">{teaser(item.type === 'card' ? item.card.idea : item.h.text)}</div>
            <p className="small muted">Intenta recordar la idea completa. Toca para revelarla.</p>
          </article>
        ) : item.type === 'card' ? (
          <CardView
            card={item.card}
            topic={topic}
            book={book}
            chapter={item.card.chapterId ? chapters.get(item.card.chapterId) : undefined}
          />
        ) : (
          <article className="fcard">
            <div className="topic">Subrayado</div>
            <HighlightView h={item.h} book={book} chapter={item.h.chapterId ? chapters.get(item.h.chapterId) : undefined} />
          </article>
        )}
      </SwipeCard>

      {!revealed ? (
        <button className="btn primary big block" onClick={() => setRevealed(true)}>
          <Icon name="eye" /> Mostrar
        </button>
      ) : (
        <>
          <div className="actions-2">
            <button className="btn big" onClick={() => finish('missed')}>
              No lo recordaba
            </button>
            <button className="btn big primary" onClick={() => finish('recalled')}>
              Lo recordaba
            </button>
          </div>
          <p className="tiny muted center swipe-hint">Desliza la tarjeta: → lo recordaba · ← no lo recordaba</p>
          <div className="toolbar">
            <button className={`tool${favorite ? ' on' : ''}`} onClick={() => toggle('favorite')}>
              <Icon name="star" filled={favorite} size={20} />
              <span>Favorito</span>
            </button>
            <Link to={editTo} className="tool">
              <Icon name="edit" size={20} />
              <span>Editar</span>
            </Link>
            <button className="tool" onClick={() => setNoteOpen(true)}>
              <Icon name="note" size={20} />
              <span>Nota</span>
            </button>
            <button className="tool" onClick={() => toggle('discarded')}>
              <Icon name="archive" size={20} />
              <span>Descartar</span>
            </button>
            <button className="tool" onClick={() => finish('seen')}>
              <Icon name="chevron" size={20} />
              <span>Siguiente</span>
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

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)}>
        <h2>Opciones</h2>
        {book && (
          <FrequencyRow
            label={`Frecuencia de “${book.title}”`}
            value={book.frequency}
            onChange={async (f) => {
              await updateBook(book.id, { frequency: f });
              toast('Frecuencia del libro actualizada');
            }}
          />
        )}
        {topic && (
          <FrequencyRow
            label={`Frecuencia del tema “${topic.name}”`}
            value={topic.frequency}
            onChange={async (f) => {
              await db.topics.update(topic.id, { frequency: f });
              toast('Frecuencia del tema actualizada');
            }}
          />
        )}
        <div className="list">
          {item.type === 'card' ? (
            <Link to={`/ficha/${item.card.id}`} className="list-item">
              <Icon name="cards" size={20} />
              <span className="grow">Abrir ficha</span>
            </Link>
          ) : (
            <Link to={`/ficha/nueva?desde=${item.h.id}`} className="list-item">
              <Icon name="cards" size={20} />
              <span className="grow">Convertir en ficha</span>
            </Link>
          )}
          <Link to={`/maestria/nueva?${item.type === 'card' ? 'ficha' : 'subrayado'}=${ref!.id}`} className="list-item">
            <Icon name="review" size={20} />
            <span className="grow">Crear flashcard</span>
          </Link>
          {book && (
            <Link to={`/libro/${book.id}`} className="list-item">
              <Icon name="book" size={20} />
              <span className="grow">Ver libro</span>
            </Link>
          )}
        </div>
        <p className="tiny muted">Atajos con teclado: Espacio, ← →, F, D, N, E, L.</p>
      </Sheet>
    </div>
  );
}

function FrequencyRow({ label, value, onChange }: { label: string; value: Frequency; onChange: (f: Frequency) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <Segmented
        value={value}
        onChange={onChange}
        options={(['more', 'normal', 'less', 'never'] as const).map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }))}
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
