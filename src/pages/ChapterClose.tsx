import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { HighlightView } from '../components/items';
import { Segmented, useConfirm } from '../components/ui';
import { db } from '../db/db';
import { chaptersOf, createCard, createTopic, ensureDefaultTopics } from '../db/repo';
import { useTopics } from '../hooks';
import { AddChapterSheet } from './BookDetail';

type Step = 'setup' | 'recall' | 'apply' | 'compare' | 'save';
const STEPS: Step[] = ['setup', 'recall', 'apply', 'compare', 'save'];
const NEW_TOPIC = '__new__';

/**
 * Cierre de capítulo (práctica de recuperación):
 * escribir de memoria → dónde aplicarlo → comparar con lo subrayado → guardar como ficha.
 */
export default function ChapterClose() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const topics = useTopics();
  const books = useLiveQuery(() => db.books.orderBy('updatedAt').reverse().toArray(), []);

  const [step, setStep] = useState<Step>('setup');
  const [bookId, setBookId] = useState(params.get('libro') ?? '');
  const [chapterId, setChapterId] = useState(params.get('cap') ?? '');
  const [minutes, setMinutes] = useState<'0' | '5' | '10'>('0');
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [recall, setRecall] = useState('');
  const [application, setApplication] = useState('');
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [topicId, setTopicId] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [chapterSheet, setChapterSheet] = useState(false);

  const chapters = useLiveQuery(() => (bookId ? chaptersOf(bookId) : []), [bookId], []);
  const highlights = useLiveQuery(
    async () =>
      chapterId
        ? (await db.highlights.where('chapterId').equals(chapterId).toArray()).filter((h) => !h.discarded)
        : [],
    [chapterId],
    [],
  );

  useEffect(() => {
    ensureDefaultTopics();
  }, []);
  useEffect(() => {
    if (!bookId && books?.length) setBookId(books[0].id);
  }, [books, bookId]);
  useEffect(() => {
    if (!topicId && topics.length) setTopicId(topics[0].id);
  }, [topics, topicId]);

  const start = () => {
    setEndsAt(minutes === '0' ? null : Date.now() + Number(minutes) * 60_000);
    setStep('recall');
  };

  const save = async () => {
    let tid = topicId;
    if (tid === NEW_TOPIC) {
      if (!newTopic.trim()) return;
      tid = (await createTopic(newTopic)).id;
    }
    const quote = highlights.find((h) => h.id === quoteId);
    const card = await createCard({
      topicId: tid,
      idea: recall,
      application,
      quote: quote?.text,
      page: quote?.page,
      bookId,
      chapterId: chapterId || undefined,
      highlightIds: quote ? [quote.id] : [],
      source: 'chapter-close',
    });
    navigate(`/ficha/${card.id}`, { replace: true });
  };

  const leave = async () => {
    if (!recall && !application) return navigate(-1);
    if (await confirm({ title: '¿Salir sin guardar?', message: 'Perderás lo que escribiste.', confirm: 'Salir', danger: true }))
      navigate(-1);
  };

  const idx = STEPS.indexOf(step);
  const book = books?.find((b) => b.id === bookId);
  const chapter = chapters.find((c) => c.id === chapterId);

  if (!books) return null;

  return (
    <div className="page">
      <header className="page-header">
        <button className="icon-btn back" aria-label="Salir" onClick={leave}>
          <Icon name="x" />
        </button>
        <h1 style={{ fontSize: '1.3rem' }}>Cierre de capítulo</h1>
        {endsAt && step !== 'setup' && <Countdown endsAt={endsAt} />}
      </header>

      <div className="steps" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s} className={i <= idx ? 'on' : ''} />
        ))}
      </div>

      {step === 'setup' && (
        <div className="stack">
          {books.length === 0 ? (
            <p className="muted">Primero agrega un libro en la Biblioteca.</p>
          ) : (
            <>
              <label className="field">
                <span>Libro</span>
                <select
                  value={bookId}
                  onChange={(e) => {
                    setBookId(e.target.value);
                    setChapterId('');
                  }}
                >
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field">
                <span>Capítulo que terminaste</span>
                <div className="row nowrap">
                  <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} style={{ flex: 1 }}>
                    <option value="">Elige un capítulo…</option>
                    {chapters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  <button className="icon-btn" aria-label="Nuevo capítulo" onClick={() => setChapterSheet(true)}>
                    <Icon name="plus" />
                  </button>
                </div>
              </div>
              <div className="field">
                <span>Temporizador</span>
                <Segmented
                  value={minutes}
                  onChange={setMinutes}
                  options={[
                    { value: '0', label: 'Sin tiempo' },
                    { value: '5', label: '5 min' },
                    { value: '10', label: '10 min' },
                  ]}
                />
              </div>
              <button className="btn primary big block" onClick={start} disabled={!bookId || !chapterId}>
                Empezar
              </button>
            </>
          )}
        </div>
      )}

      {step === 'recall' && (
        <div className="stack">
          <p className="prompt">Cierra el libro y escribe de memoria la idea principal.</p>
          <p className="small muted">
            {book?.title} · {chapter?.title}. No mires tus subrayados: el esfuerzo de recordar es lo que fija la idea.
          </p>
          <textarea
            className="reading"
            value={recall}
            onChange={(e) => setRecall(e.target.value)}
            placeholder="Con tus palabras…"
            autoFocus
          />
          <button className="btn primary big block" onClick={() => setStep('apply')} disabled={!recall.trim()}>
            Siguiente
          </button>
        </div>
      )}

      {step === 'apply' && (
        <div className="stack">
          <p className="prompt">¿Dónde vas a aplicar esto esta semana?</p>
          <p className="small muted">Una situación concreta: una persona, un lugar, un momento.</p>
          <textarea value={application} onChange={(e) => setApplication(e.target.value)} autoFocus />
          <div className="actions-2">
            <button className="btn" onClick={() => setStep('recall')}>
              Atrás
            </button>
            <button className="btn primary" onClick={() => setStep('compare')}>
              Comparar
            </button>
          </div>
        </div>
      )}

      {step === 'compare' && (
        <div className="stack">
          <p className="prompt">Compara lo que recordaste con lo que marcaste.</p>
          <div className="field">
            <span>Lo que recordé (puedes ajustarlo)</span>
            <textarea className="reading" value={recall} onChange={(e) => setRecall(e.target.value)} />
          </div>
          <div className="section-title">Mis subrayados de este capítulo · {highlights.length}</div>
          {highlights.length === 0 ? (
            <p className="muted small">No hay subrayados en este capítulo.</p>
          ) : (
            <>
              <p className="small muted">Toca uno para usarlo como cita de la ficha.</p>
              <div className="list">
                {highlights.map((h) => (
                  <div
                    key={h.id}
                    role="button"
                    tabIndex={0}
                    className={`highlight-item pick${quoteId === h.id ? ' on' : ''}`}
                    onClick={() => setQuoteId(quoteId === h.id ? null : h.id)}
                  >
                    <HighlightView h={h} showSource={false} />
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="actions-2">
            <button className="btn" onClick={() => setStep('apply')}>
              Atrás
            </button>
            <button className="btn primary" onClick={() => setStep('save')}>
              Guardar como ficha
            </button>
          </div>
        </div>
      )}

      {step === 'save' && (
        <div className="stack">
          <div className="field">
            <span>Tema de la ficha</span>
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value={NEW_TOPIC}>+ Nuevo tema…</option>
            </select>
            {topicId === NEW_TOPIC && (
              <input type="text" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="Nombre del tema" autoFocus />
            )}
          </div>
          <div className="panel stack-sm small">
            <div>
              <b>Idea:</b> {recall}
            </div>
            {application && (
              <div>
                <b>Cómo lo aplico:</b> {application}
              </div>
            )}
            {quoteId && (
              <div className="quote-text">“{highlights.find((h) => h.id === quoteId)?.text}”</div>
            )}
          </div>
          <div className="actions-2">
            <button className="btn" onClick={() => setStep('compare')}>
              Atrás
            </button>
            <button className="btn primary" onClick={save} disabled={topicId === NEW_TOPIC && !newTopic.trim()}>
              Guardar ficha
            </button>
          </div>
        </div>
      )}

      {bookId && (
        <AddChapterSheet bookId={bookId} open={chapterSheet} onClose={() => setChapterSheet(false)} onAdded={(c) => setChapterId(c.id)} />
      )}
    </div>
  );
}

function Countdown({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const left = Math.max(0, Math.round((endsAt - now) / 1000));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <span className={`timer${left === 0 ? ' over' : ''}`} role="timer">
      {left === 0 ? 'Tiempo' : `${mm}:${ss}`}
    </span>
  );
}
