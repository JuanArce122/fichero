import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Book, Card, Chapter, Highlight, Topic } from '../db/types';
import { useImageUrl } from '../hooks';
import { normalizeTags } from '../db/repo';
import { Icon } from './Icon';

export function BookCover({ book, large }: { book: Pick<Book, 'title' | 'coverId'>; large?: boolean }) {
  const url = useImageUrl(book.coverId);
  return (
    <div className={`cover${large ? ' large' : ''}`}>
      {url ? <img src={url} alt="" /> : <span>{book.title.trim().charAt(0).toUpperCase() || '·'}</span>}
    </div>
  );
}

export function sourceLine(book?: Book, chapter?: Chapter, page?: string): string {
  return [book?.title, chapter?.title, page && `p. ${page}`].filter(Boolean).join(' · ');
}

/** Ficha estilo 4x6: tema arriba, la idea en mis palabras, cita, nota y aplicación. */
export function CardView({
  card,
  topic,
  book,
  chapter,
  compact,
  footer,
}: {
  card: Card;
  topic?: Topic;
  book?: Book;
  chapter?: Chapter;
  compact?: boolean;
  footer?: ReactNode;
}) {
  const source = sourceLine(book, chapter, card.page);
  return (
    <article className="fcard">
      <div className="topic">
        <span style={{ flex: 1 }}>{topic?.name ?? 'Sin tema'}</span>
        {card.favorite && <Icon name="star" size={14} filled />}
      </div>
      <div className={`idea${compact ? ' clamp-3' : ''}`}>{card.idea}</div>
      {!compact && card.quote && <div className="quote">“{card.quote}”</div>}
      {!compact && card.note && (
        <div className="stack-sm">
          <span className="label">Mi nota</span>
          <div style={{ whiteSpace: 'pre-wrap' }}>{card.note}</div>
        </div>
      )}
      {!compact && card.application && (
        <div className="stack-sm">
          <span className="label">Cómo lo aplico</span>
          <div style={{ whiteSpace: 'pre-wrap' }}>{card.application}</div>
        </div>
      )}
      {(source || card.tags.length > 0) && (
        <div className="row source">
          {source && <span>{source}</span>}
          {card.tags.map((t) => (
            <span key={t} className="tag">
              #{t}
            </span>
          ))}
        </div>
      )}
      {footer}
    </article>
  );
}

export function HighlightView({
  h,
  book,
  chapter,
  showSource = true,
  compact,
}: {
  h: Highlight;
  book?: Book;
  chapter?: Chapter;
  showSource?: boolean;
  compact?: boolean;
}) {
  const source = sourceLine(showSource ? book : undefined, chapter, h.page);
  return (
    <>
      <div className={`reading-text${compact ? ' clamp-3' : ''}`}>{h.text}</div>
      {h.note && <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>✎ {h.note}</div>}
      <div className="row small muted">
        {h.favorite && <Icon name="star" size={14} filled />}
        {source && <span>{source}</span>}
        {h.tags.map((t) => (
          <span key={t} className="tag">
            #{t}
          </span>
        ))}
        {h.discarded && <span className="badge">descartado</span>}
      </div>
    </>
  );
}

export function HighlightLink(props: Parameters<typeof HighlightView>[0]) {
  return (
    <Link to={`/subrayado/${props.h.id}`} className="highlight-item">
      <HighlightView {...props} compact />
    </Link>
  );
}

/** Campo de etiquetas: escribe y pulsa Enter o coma. */
export function TagInput({
  value,
  onChange,
  suggestions = [],
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState('');
  const commit = (text = draft) => {
    const next = normalizeTags([...value, ...text.split(',')]);
    onChange(next);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const query = draft.trim().toLowerCase();
  const shown = suggestions.filter((s) => !value.includes(s) && (!query || s.includes(query))).slice(0, 8);
  return (
    <div className="stack-sm">
      {value.length > 0 && (
        <div className="chips">
          {value.map((t) => (
            <button key={t} type="button" className="chip on" onClick={() => onChange(value.filter((x) => x !== t))}>
              #{t} <Icon name="x" size={12} />
            </button>
          ))}
        </div>
      )}
      <input
        type="text"
        value={draft}
        placeholder="Agregar etiqueta…"
        autoCapitalize="none"
        autoCorrect="off"
        enterKeyHint="done"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => draft.trim() && commit()}
      />
      {shown.length > 0 && (
        <div className="chips">
          {shown.map((t) => (
            <button key={t} type="button" className="chip" onMouseDown={(e) => e.preventDefault()} onClick={() => commit(t)}>
              #{t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
