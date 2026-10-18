import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { TagInput } from '../components/items';
import { NotFound, PageHeader } from '../components/ui';
import { db } from '../db/db';
import { allTags, chaptersOf, createCard, createTopic, ensureDefaultTopics, updateCard } from '../db/repo';
import type { Card } from '../db/types';
import { useTopics } from '../hooks';

const NEW_TOPIC = '__new__';

/** Crear (/ficha/nueva) o editar (/ficha/:id/editar) una ficha. */
export default function CardForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const topics = useTopics();
  const tagSuggestions = useLiveQuery(() => allTags(), [], []);
  const books = useLiveQuery(() => db.books.orderBy('updatedAt').reverse().toArray(), []);
  const fromHighlight = params.get('desde');

  const existing = useLiveQuery(async () => (id ? ((await db.cards.get(id)) ?? null) : undefined), [id]);
  const highlight = useLiveQuery(() => (fromHighlight ? db.highlights.get(fromHighlight) : undefined), [fromHighlight]);

  const [form, setForm] = useState<Partial<Card>>({ idea: '', quote: '', note: '', application: '', tags: [] });
  const [newTopic, setNewTopic] = useState('');
  const initialized = useRef(false);
  const chapters = useLiveQuery(() => (form.bookId ? chaptersOf(form.bookId) : []), [form.bookId], []);

  useEffect(() => {
    ensureDefaultTopics();
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    if (id) {
      if (!existing) return;
      setForm(existing);
    } else if (fromHighlight) {
      if (!highlight) return;
      setForm((f) => ({
        ...f,
        quote: highlight.text,
        note: highlight.note,
        bookId: highlight.bookId,
        chapterId: highlight.chapterId,
        page: highlight.page,
        tags: highlight.tags,
        highlightIds: [highlight.id],
        source: 'highlight',
      }));
    } else {
      setForm((f) => ({ ...f, bookId: params.get('libro') ?? undefined }));
    }
    initialized.current = true;
  }, [id, existing, fromHighlight, highlight, params]);

  // Tema por defecto: el primero disponible.
  useEffect(() => {
    if (!form.topicId && topics.length) setForm((f) => ({ ...f, topicId: f.topicId ?? topics[0].id }));
  }, [topics, form.topicId]);

  const set = <K extends keyof Card>(key: K, value: Card[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.idea?.trim()) return;
    let topicId = form.topicId;
    if (topicId === NEW_TOPIC) {
      if (!newTopic.trim()) return;
      topicId = (await createTopic(newTopic)).id;
    }
    if (!topicId) return;
    const data = {
      topicId,
      idea: form.idea.trim(),
      quote: form.quote?.trim() ?? '',
      note: form.note?.trim() ?? '',
      application: form.application?.trim() ?? '',
      bookId: form.bookId || undefined,
      chapterId: form.chapterId || undefined,
      page: form.page?.trim() || undefined,
      tags: form.tags ?? [],
    };
    if (id) {
      await updateCard(id, data);
      navigate(-1);
    } else {
      const card = await createCard({ ...data, highlightIds: form.highlightIds, source: form.source });
      navigate(`/ficha/${card.id}`, { replace: true });
    }
  };

  if (id && existing === undefined) return null;
  if (id && existing === null) return <NotFound what="La ficha" />;

  return (
    <form className="page" onSubmit={submit}>
      <PageHeader title={id ? 'Editar ficha' : 'Nueva ficha'} back />

      <div className="field">
        <span>Tema</span>
        <select value={form.topicId ?? ''} onChange={(e) => set('topicId', e.target.value)}>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value={NEW_TOPIC}>+ Nuevo tema…</option>
        </select>
        {form.topicId === NEW_TOPIC && (
          <input type="text" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="Nombre del tema" autoFocus />
        )}
      </div>

      <label className="field">
        <span>La idea, en mis palabras</span>
        <textarea
          className="reading"
          value={form.idea ?? ''}
          onChange={(e) => set('idea', e.target.value)}
          placeholder="¿Qué aprendí? Escríbelo como se lo explicarías a un amigo."
          required
          autoFocus={!id}
        />
      </label>

      <label className="field">
        <span>Cita (opcional)</span>
        <textarea value={form.quote ?? ''} onChange={(e) => set('quote', e.target.value)} />
      </label>

      <label className="field">
        <span>Cómo lo aplico</span>
        <textarea
          value={form.application ?? ''}
          onChange={(e) => set('application', e.target.value)}
          placeholder="Una situación concreta de mi vida donde usarlo."
        />
      </label>

      <label className="field">
        <span>Mi nota</span>
        <textarea value={form.note ?? ''} onChange={(e) => set('note', e.target.value)} />
      </label>

      <div className="field">
        <span>Fuente</span>
        <select value={form.bookId ?? ''} onChange={(e) => setForm((f) => ({ ...f, bookId: e.target.value || undefined, chapterId: undefined }))}>
          <option value="">Sin libro</option>
          {books?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
        {form.bookId && (
          <div className="row nowrap">
            <select value={form.chapterId ?? ''} onChange={(e) => set('chapterId', e.target.value || undefined)} style={{ flex: 1 }}>
              <option value="">Sin capítulo</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <input
              type="text"
              inputMode="numeric"
              value={form.page ?? ''}
              onChange={(e) => set('page', e.target.value)}
              placeholder="Pág."
              style={{ width: 84 }}
            />
          </div>
        )}
      </div>

      <div className="field">
        <span>Etiquetas</span>
        <TagInput value={form.tags ?? []} onChange={(t) => set('tags', t)} suggestions={tagSuggestions} />
      </div>

      <button className="btn primary big block" type="submit" disabled={!form.idea?.trim()}>
        Guardar ficha
      </button>
    </form>
  );
}
