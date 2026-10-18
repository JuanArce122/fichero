import { useLiveQuery } from 'dexie-react-hooks';
import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Empty, PageHeader } from '../components/ui';
import { db } from '../db/db';
import { allTags } from '../db/repo';
import { useBooksMap, useTopics, useTopicsMap } from '../hooks';
import { formatDate, formatDay } from '../lib/dates';
import { queryTerms, search, type ResultType, type SearchFilters } from '../lib/search';
import { normalize } from '../lib/text';

const TYPE_LABELS: Record<ResultType, string> = { highlight: 'Subrayados', card: 'Fichas', journal: 'Diario' };

export default function Search() {
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({ types: [], favorites: false });
  const [showFilters, setShowFilters] = useState(false);
  const deferredQ = useDeferredValue(q);
  const books = useBooksMap();
  const topicList = useTopics();
  const topics = useTopicsMap();
  const tags = useLiveQuery(() => allTags(), [], []);

  const data = useLiveQuery(async () => {
    const [highlights, cards, journal] = await Promise.all([db.highlights.toArray(), db.cards.toArray(), db.journal.toArray()]);
    return { highlights, cards, journal };
  }, []);

  const active =
    deferredQ.trim() || filters.types.length || filters.bookId || filters.topicId || filters.tag || filters.from || filters.to || filters.favorites;
  const results = data && active ? search(deferredQ, filters, { ...data, books, topics }) : [];
  const terms = queryTerms(deferredQ);
  const set = (patch: Partial<SearchFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const filterCount = [filters.bookId, filters.topicId, filters.tag, filters.from, filters.to, filters.favorites || undefined].filter(Boolean).length;

  return (
    <div className="page">
      <PageHeader title="Buscar" back="/" />
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Palabras en subrayados, fichas, notas y diario…" autoFocus />

      <div className="chips">
        {(Object.keys(TYPE_LABELS) as ResultType[]).map((t) => (
          <button
            key={t}
            className={`chip${filters.types.includes(t) ? ' on' : ''}`}
            onClick={() => set({ types: filters.types.includes(t) ? filters.types.filter((x) => x !== t) : [...filters.types, t] })}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
        <button className={`chip${filters.favorites ? ' on' : ''}`} onClick={() => set({ favorites: !filters.favorites })}>
          ★ Favoritos
        </button>
        <button className="chip" onClick={() => setShowFilters((v) => !v)}>
          Filtros{filterCount ? ` (${filterCount})` : ''} {showFilters ? '▴' : '▾'}
        </button>
      </div>

      {showFilters && (
        <div className="panel stack">
          <select value={filters.bookId ?? ''} onChange={(e) => set({ bookId: e.target.value || undefined })} aria-label="Libro">
            <option value="">Todos los libros</option>
            {[...books.values()].map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
          <select value={filters.topicId ?? ''} onChange={(e) => set({ topicId: e.target.value || undefined })} aria-label="Tema">
            <option value="">Todos los temas</option>
            {topicList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select value={filters.tag ?? ''} onChange={(e) => set({ tag: e.target.value || undefined })} aria-label="Etiqueta">
            <option value="">Todas las etiquetas</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
          <div className="row nowrap">
            <label className="field" style={{ flex: 1 }}>
              <span>Desde</span>
              <input type="date" value={filters.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Hasta</span>
              <input type="date" value={filters.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
            </label>
          </div>
          {filterCount > 0 && (
            <button className="btn small ghost" onClick={() => setFilters({ types: filters.types, favorites: false })}>
              Quitar filtros
            </button>
          )}
          <p className="tiny muted">El tema solo aplica a fichas. El diario no tiene libro, tema ni etiquetas.</p>
        </div>
      )}

      {active && <div className="small muted">{results.length === 1 ? '1 resultado' : `${results.length} resultados`}</div>}

      {active && results.length === 0 && <Empty>No encontré nada con esas palabras.</Empty>}

      {results.length > 0 && (
        <div className="list">
          {results.slice(0, 200).map((r) => (
            <Link key={r.type + r.id} to={r.to} className="highlight-item">
              <div className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {r.type === 'highlight' ? 'Subrayado' : r.type === 'card' ? 'Ficha' : 'Diario'} ·{' '}
                {r.type === 'journal' ? formatDay(r.title) : formatDate(r.date)}
              </div>
              {r.type !== 'journal' && (
                <div className="reading-text clamp-3" style={{ fontSize: '1rem' }}>
                  <Highlighted text={r.title} terms={terms} />
                </div>
              )}
              {r.snippet && (
                <div className="small muted clamp-3">
                  <Highlighted text={r.snippet} terms={terms} />
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {!active && (
        <Empty>
          <Icon name="search" size={32} />
          <p>Busca por palabras. Se ignoran mayúsculas y acentos.</p>
        </Empty>
      )}
    </div>
  );
}

/** Resalta las palabras buscadas (comparando sin acentos). */
function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const n = normalize(text);
  // normalize() no cambia la longitud en textos con letras precompuestas (NFC), así que los índices coinciden.
  if (n.length !== text.length) return <>{text}</>;
  const marks: [number, number][] = [];
  for (const t of terms) {
    let i = n.indexOf(t);
    while (i >= 0) {
      marks.push([i, i + t.length]);
      i = n.indexOf(t, i + t.length);
    }
  }
  if (!marks.length) return <>{text}</>;
  marks.sort((a, b) => a[0] - b[0]);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const [s, e] of marks) {
    if (s < pos) continue;
    parts.push(text.slice(pos, s), <mark key={s}>{text.slice(s, e)}</mark>);
    pos = e;
  }
  parts.push(text.slice(pos));
  return <>{parts}</>;
}
