import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { TagInput } from '../components/items';
import { PageHeader, Sheet, useConfirm, useToast } from '../components/ui';
import { db } from '../db/db';
import {
  allTags,
  chaptersOf,
  createBook,
  createHighlight,
  deleteHighlight,
  updateHighlight,
  updateSettings,
} from '../db/repo';
import { useImageUrl, useLoadedSettings } from '../hooks';
import { AddChapterSheet } from './BookDetail';
import type { CaptureState } from './PhotoCapture';
import { cleanText } from '../lib/text';

/** Captura rápida de subrayados (nuevo) y edición (/subrayado/:id). */
export default function Capture() {
  const { id } = useParams();
  const editing = !!id;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const settings = useLoadedSettings();
  const location = useLocation();
  const textRef = useRef<HTMLTextAreaElement>(null);

  const existing = useLiveQuery(() => (id ? db.highlights.get(id) : undefined), [id]);
  const books = useLiveQuery(async () => (await db.books.toArray()).sort((a, b) => b.updatedAt - a.updatedAt), []);
  const tagSuggestions = useLiveQuery(() => allTags(), [], []);

  const [bookId, setBookId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [text, setText] = useState('');
  const [page, setPage] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [photoId, setPhotoId] = useState<string>();
  const [showMore, setShowMore] = useState(false);
  const [newBookOpen, setNewBookOpen] = useState(false);
  const [newChapterOpen, setNewChapterOpen] = useState(false);
  const initialized = useRef(false);

  const chapters = useLiveQuery(() => (bookId ? chaptersOf(bookId) : []), [bookId], []);
  const photoUrl = useImageUrl(existing?.photoId ?? photoId);

  // Valores iniciales: el subrayado a editar, el libro de la URL o el último usado.
  useEffect(() => {
    if (initialized.current || !books || !settings) return;
    if (editing) {
      if (!existing) return;
      setBookId(existing.bookId);
      setChapterId(existing.chapterId ?? '');
      setText(existing.text);
      setPage(existing.page ?? '');
      setNote(existing.note);
      setTags(existing.tags);
      setShowMore(true);
    } else {
      const fromUrl = params.get('libro');
      const last = settings.lastBookId;
      const pick = [fromUrl, last].find((b) => b && books.some((x) => x.id === b)) ?? books[0]?.id ?? '';
      setBookId(pick);
      setChapterId(params.get('cap') ?? (pick === last ? settings.lastChapterId ?? '' : ''));
      // Texto que llega desde Foto + OCR.
      const fromOcr = location.state as CaptureState | null;
      if (fromOcr?.text !== undefined) {
        setText(fromOcr.text);
        setPhotoId(fromOcr.photoId);
      }
    }
    initialized.current = true;
  }, [books, existing, editing, params, settings, location.state]);

  // Si el capítulo elegido no pertenece al libro, lo limpiamos.
  useEffect(() => {
    if (chapterId && chapters.length && !chapters.some((c) => c.id === chapterId)) setChapterId('');
  }, [chapters, chapterId]);

  const paste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      // Texto en Vivo corta las líneas: las unimos.
      if (clip) setText((t) => (t ? `${t} ${cleanText(clip)}` : cleanText(clip)).trim());
    } catch {
      toast('Mantén pulsado el campo de texto y elige “Pegar”.');
      textRef.current?.focus();
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!bookId || !text.trim()) return;
    const data = { bookId, chapterId: chapterId || undefined, text: text.trim(), page, note, tags };
    if (editing) {
      await updateHighlight(id, { ...data, page: page.trim() || undefined, note: note.trim() });
      navigate(-1);
      return;
    }
    await createHighlight({ ...data, photoId });
    await updateSettings({ lastBookId: bookId, lastChapterId: chapterId || undefined });
    await db.books.update(bookId, { updatedAt: Date.now() });
    toast('Subrayado guardado');
    // Listo para el siguiente: se mantienen libro, capítulo y etiquetas.
    setText('');
    setNote('');
    setPhotoId(undefined);
    textRef.current?.focus();
  };

  const toggle = async (field: 'favorite' | 'discarded') => {
    if (!existing) return;
    await updateHighlight(existing.id, { [field]: !existing[field] });
  };

  const remove = async () => {
    if (!existing) return;
    if (await confirm({ title: '¿Eliminar este subrayado?', confirm: 'Eliminar', danger: true })) {
      await deleteHighlight(existing.id);
      navigate(-1);
    }
  };

  if (!books || !settings) return null;
  if (editing && existing === undefined) return null;

  return (
    <>
    <form className="page" onSubmit={submit}>
      <PageHeader title={editing ? 'Subrayado' : 'Capturar'} back={editing}>
        {existing && (
          <>
            <button
              type="button"
              className={`icon-btn${existing.favorite ? ' on' : ''}`}
              aria-label="Favorito"
              onClick={() => toggle('favorite')}
            >
              <Icon name="star" filled={existing.favorite} />
            </button>
          </>
        )}
      </PageHeader>

      {books.length === 0 ? (
        <div className="panel stack">
          <p>Primero agrega el libro que estás leyendo.</p>
          <button type="button" className="btn primary" onClick={() => setNewBookOpen(true)}>
            Agregar libro
          </button>
        </div>
      ) : (
        <div className="stack">
          <div className="row nowrap">
            <select value={bookId} onChange={(e) => setBookId(e.target.value)} aria-label="Libro" style={{ flex: 2 }}>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
            <button type="button" className="icon-btn" aria-label="Nuevo libro" onClick={() => setNewBookOpen(true)}>
              <Icon name="plus" />
            </button>
          </div>
          <div className="row nowrap">
            <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} aria-label="Capítulo" style={{ flex: 2 }}>
              <option value="">Sin capítulo</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <button type="button" className="icon-btn" aria-label="Nuevo capítulo" onClick={() => setNewChapterOpen(true)}>
              <Icon name="plus" />
            </button>
          </div>

          {photoUrl && <img src={photoUrl} alt="Foto de la página" style={{ width: '100%', borderRadius: 10 }} />}

          <label className="field">
            <span>Texto subrayado</span>
            <textarea
              ref={textRef}
              className="reading"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escribe o pega el pasaje…"
              autoFocus={!editing}
              required
            />
          </label>
          <div className="row">
            <button type="button" className="btn small" onClick={paste}>
              <Icon name="paste" size={16} /> Pegar
            </button>
            {!editing && (
              <Link to={`/capturar/foto?libro=${bookId}${chapterId ? `&cap=${chapterId}` : ''}`} className="btn small">
                <Icon name="camera" size={16} /> Foto + OCR
              </Link>
            )}
            <span className="spacer" />
            <input
              type="text"
              inputMode="numeric"
              value={page}
              onChange={(e) => setPage(e.target.value)}
              placeholder="Pág."
              aria-label="Página"
              style={{ width: 84 }}
            />
          </div>

          {showMore ? (
            <>
              <label className="field">
                <span>Mi nota</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="¿Por qué lo marqué?" />
              </label>
              <div className="field">
                <span>Etiquetas</span>
                <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />
              </div>
            </>
          ) : (
            <button type="button" className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setShowMore(true)}>
              + Nota y etiquetas{tags.length ? ` (${tags.map((t) => '#' + t).join(' ')})` : ''}
            </button>
          )}

          <button type="submit" className="btn primary big block" disabled={!text.trim() || !bookId}>
            {editing ? 'Guardar cambios' : 'Guardar'}
          </button>

          {existing && (
            <div className="stack-sm">
              <Link to={`/ficha/nueva?desde=${existing.id}`} className="btn block">
                <Icon name="cards" size={18} /> Convertir en ficha
              </Link>
              <Link to={`/maestria/nueva?subrayado=${existing.id}`} className="btn block">
                Crear flashcard
              </Link>
              <div className="actions-2">
                <button type="button" className="btn" onClick={() => toggle('discarded')}>
                  {existing.discarded ? 'Recuperar' : 'Descartar'}
                </button>
                <button type="button" className="btn danger" onClick={remove}>
                  Eliminar
                </button>
              </div>
              <p className="tiny muted center">Descartar lo saca del repaso sin borrarlo.</p>
            </div>
          )}
        </div>
      )}
    </form>

      <NewBookSheet
        open={newBookOpen}
        onClose={() => setNewBookOpen(false)}
        onCreated={(bid) => {
          setBookId(bid);
          setChapterId('');
        }}
      />
      {bookId && (
        <AddChapterSheet
          bookId={bookId}
          open={newChapterOpen}
          onClose={() => setNewChapterOpen(false)}
          onAdded={(c) => setChapterId(c.id)}
        />
      )}
    </>
  );
}

function NewBookSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const b = await createBook({ title, author });
    setTitle('');
    setAuthor('');
    onCreated(b.id);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <h2>Nuevo libro</h2>
        <input type="text" value={title} placeholder="Título" onChange={(e) => setTitle(e.target.value)} autoFocus />
        <input type="text" value={author} placeholder="Autor" onChange={(e) => setAuthor(e.target.value)} />
        <div className="actions-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={!title.trim()}>
            Agregar
          </button>
        </div>
      </form>
    </Sheet>
  );
}
