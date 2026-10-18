import { useEffect, useState } from 'react';
import { coverUrl, searchBooks, type BookCandidate } from '../lib/bookLookup';
import { Icon } from './Icon';

/** Buscador opcional en Open Library para autocompletar título, autor y portada. */
export function BookSearch({ onPick }: { onPick: (b: BookCandidate) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<BookCandidate[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'offline'>('idle');

  // Busca al dejar de escribir (400 ms) y cancela la búsqueda anterior.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 3) {
      setResults([]);
      setState('idle');
      return;
    }
    if (!navigator.onLine) {
      setState('offline');
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setState('loading');
      try {
        setResults(await searchBooks(query, ctrl.signal));
        setState('idle');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setState('error');
      }
    }, 400);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="stack-sm">
      <div className="search-field">
        <Icon name="search" size={18} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          // Está dentro del formulario del libro: Enter no debe guardarlo.
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          placeholder="Buscar por título, autor o ISBN"
          aria-label="Buscar libro"
          enterKeyHint="search"
        />
      </div>
      {state === 'loading' && <p className="tiny muted">Buscando…</p>}
      {state === 'offline' && <p className="tiny muted">Sin conexión: escribe los datos a mano.</p>}
      {state === 'error' && <p className="tiny muted">No se pudo buscar. Escribe los datos a mano.</p>}
      {results.length > 0 && (
        <div className="list">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              className="list-item"
              onClick={() => {
                onPick(r);
                setQ('');
                setResults([]);
              }}
            >
              <div className="cover">
                {r.coverId ? <img src={coverUrl(r.coverId, 'S')} alt="" loading="lazy" /> : <span>{r.title.charAt(0)}</span>}
              </div>
              <div className="grow">
                <div className="ellipsis" style={{ fontWeight: 600 }}>
                  {r.title}
                </div>
                <div className="small muted ellipsis">
                  {r.author}
                  {r.year ? ` · ${r.year}` : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <p className="tiny muted">Datos de Open Library. Solo se envía lo que escribes aquí; nada de tu fichero.</p>
    </div>
  );
}
