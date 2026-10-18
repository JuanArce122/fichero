import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { HighlightView } from '../components/items';
import { Empty, PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import { createCard, createTopic, ensureDefaultTopics, markProcessed, setBookStatus, updateBook } from '../db/repo';
import { useChaptersMap, useTopics } from '../hooks';
import { pendingHighlights } from '../lib/apply';

const NEW_TOPIC = '__new__';

/**
 * Sesión de transferencia (método Holiday): después del reposo, revisa cada
 * subrayado pendiente del libro y pasa los mejores a fichas.
 */
export default function Transfer() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const topics = useTopics();
  const chapters = useChaptersMap();
  const data = useLiveQuery(async () => {
    const book = await db.books.get(id);
    const highlights = await db.highlights.where('bookId').equals(id).toArray();
    return { book, highlights };
  }, [id]);

  const [mode, setMode] = useState<'decide' | 'card'>('decide');
  const [idea, setIdea] = useState('');
  const [application, setApplication] = useState('');
  const [topicId, setTopicId] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [made, setMade] = useState(0);

  useEffect(() => {
    ensureDefaultTopics();
  }, []);
  useEffect(() => {
    if (!topicId && topics.length) setTopicId(topics[0].id);
  }, [topics, topicId]);

  if (!data) return null;
  const { book, highlights } = data;
  if (!book) return <PageHeader title="Libro no encontrado" back="/biblioteca" />;

  // En orden de capítulo y página.
  const pending = pendingHighlights(highlights).sort(
    (a, b) =>
      (chapters.get(a.chapterId ?? '')?.order ?? 999) - (chapters.get(b.chapterId ?? '')?.order ?? 999) ||
      (parseInt(a.page ?? '', 10) || 0) - (parseInt(b.page ?? '', 10) || 0) ||
      a.createdAt - b.createdAt,
  );
  const current = pending[0];
  const total = highlights.filter((h) => !h.discarded).length;

  const reset = () => {
    setMode('decide');
    setIdea('');
    setApplication('');
  };

  const makeCard = async () => {
    if (!current || !idea.trim()) return;
    let tid = topicId;
    if (tid === NEW_TOPIC) {
      if (!newTopic.trim()) return;
      tid = (await createTopic(newTopic)).id;
      setTopicId(tid);
      setNewTopic('');
    }
    await createCard({
      topicId: tid,
      idea,
      application,
      quote: current.text,
      note: current.note,
      tags: current.tags,
      page: current.page,
      bookId: book.id,
      chapterId: current.chapterId,
      highlightIds: [current.id],
      source: 'transfer',
    });
    setMade((n) => n + 1);
    reset();
  };

  const skip = async (discard: boolean) => {
    if (!current) return;
    await markProcessed(current.id, discard);
    reset();
  };

  const finish = async () => {
    await setBookStatus(book.id, 'processed');
    await updateBook(book.id, { restingSince: undefined });
    toast('Libro procesado');
    navigate(`/libro/${book.id}`, { replace: true });
  };

  return (
    <div className="page">
      <PageHeader title="Transferencia" back={`/libro/${book.id}`} />
      <p className="muted small">
        {book.title} · {pending.length} por revisar de {total}
        {made > 0 && ` · ${made} ${made === 1 ? 'ficha creada' : 'fichas creadas'}`}
      </p>
      {total > 0 && (
        <div className="progress">
          <div style={{ width: `${((total - pending.length) / total) * 100}%` }} />
        </div>
      )}

      {!current ? (
        <Empty>
          <Icon name="check" size={36} />
          <h2>Todo revisado</h2>
          <p>Ya pasaste por todos los subrayados de este libro.</p>
          {book.status !== 'processed' && (
            <button className="btn primary" onClick={finish}>
              Marcar libro como procesado
            </button>
          )}
          <Link to="/fichas" className="btn">
            Ver mis fichas
          </Link>
        </Empty>
      ) : (
        <div className="stack">
          <article className="fcard">
            <div className="topic">{chapters.get(current.chapterId ?? '')?.title ?? 'Subrayado'}</div>
            <HighlightView h={current} showSource={false} />
          </article>

          {mode === 'decide' ? (
            <>
              <p className="small muted center">¿Sigue valiendo la pena después del reposo?</p>
              <button className="btn primary big block" onClick={() => setMode('card')}>
                <Icon name="cards" /> Convertir en ficha
              </button>
              <div className="actions-2">
                <button className="btn" onClick={() => skip(false)}>
                  Mantener sin ficha
                </button>
                <button className="btn" onClick={() => skip(true)}>
                  Descartar
                </button>
              </div>
              <p className="tiny muted center">
                “Mantener” lo deja en tu repaso diario. “Descartar” lo saca del repaso sin borrarlo.
              </p>
            </>
          ) : (
            <div className="stack">
              <div className="field">
                <span>Tema</span>
                <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                  <option value={NEW_TOPIC}>+ Nuevo tema…</option>
                </select>
                {topicId === NEW_TOPIC && (
                  <input type="text" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="Nombre del tema" />
                )}
              </div>
              <label className="field">
                <span>La idea, en mis palabras</span>
                <textarea className="reading" value={idea} onChange={(e) => setIdea(e.target.value)} autoFocus />
              </label>
              <label className="field">
                <span>Cómo lo aplico</span>
                <textarea value={application} onChange={(e) => setApplication(e.target.value)} />
              </label>
              <div className="actions-2">
                <button className="btn" onClick={reset}>
                  Atrás
                </button>
                <button className="btn primary" onClick={makeCard} disabled={!idea.trim() || (topicId === NEW_TOPIC && !newTopic.trim())}>
                  Guardar ficha
                </button>
              </div>
              <p className="tiny muted">La cita, la nota y las etiquetas del subrayado se copian a la ficha.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
