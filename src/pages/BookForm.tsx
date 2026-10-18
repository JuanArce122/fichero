import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BookCover } from '../components/items';
import { PageHeader, Segmented, useConfirm, useToast } from '../components/ui';
import { db } from '../db/db';
import { createBook, deleteBook, saveImage, setBookStatus, updateBook } from '../db/repo';
import { FREQUENCY_LABELS, STATUS_LABELS, type BookStatus, type Frequency } from '../db/types';
import { COVER_PHOTO, compressImage } from '../lib/image';

export default function BookForm() {
  const { id } = useParams();
  const isNew = !id;
  const book = useLiveQuery(() => (id ? db.books.get(id) : undefined), [id]);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [status, setStatus] = useState<BookStatus>('reading');
  const [frequency, setFrequency] = useState<Frequency>('normal');
  const [coverId, setCoverId] = useState<string>();

  useEffect(() => {
    if (!book) return;
    setTitle(book.title);
    setAuthor(book.author);
    setStatus(book.status === 'finished' ? 'resting' : book.status);
    setFrequency(book.frequency);
    setCoverId(book.coverId);
  }, [book]);

  const onCover = async (file?: File) => {
    if (!file) return;
    try {
      const blob = await compressImage(file, COVER_PHOTO);
      setCoverId(await saveImage('cover', blob));
    } catch {
      toast('No se pudo leer la imagen');
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (isNew) {
      const b = await createBook({ title, author, coverId });
      if (status !== 'reading') await setBookStatus(b.id, status);
      navigate(`/libro/${b.id}`, { replace: true });
    } else {
      if (book?.coverId && book.coverId !== coverId) await db.images.delete(book.coverId);
      await updateBook(id, { title: title.trim(), author: author.trim(), frequency, coverId });
      if (status !== book?.status) await setBookStatus(id, status);
      navigate(-1);
    }
  };

  const remove = async () => {
    if (!id) return;
    const ok = await confirm({
      title: '¿Eliminar este libro?',
      message: 'Se borrarán sus capítulos y subrayados. Las fichas se conservan, sin vínculo al libro.',
      confirm: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    await deleteBook(id);
    navigate('/biblioteca', { replace: true });
  };

  if (!isNew && book === undefined) return null;

  return (
    <form className="page" onSubmit={submit}>
      <PageHeader title={isNew ? 'Nuevo libro' : 'Editar libro'} back />

      <div className="row nowrap" style={{ alignItems: 'flex-start', gap: 16 }}>
        <button type="button" className="btn ghost" style={{ padding: 0, height: 'auto' }} onClick={() => fileRef.current?.click()}>
          <BookCover book={{ title: title || '+', coverId }} large />
        </button>
        <div className="stack" style={{ flex: 1 }}>
          <label className="field">
            <span>Título</span>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus={isNew} />
          </label>
          <label className="field">
            <span>Autor</span>
            <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </label>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onCover(e.target.files?.[0])} />
      <div className="row">
        <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>
          {coverId ? 'Cambiar portada' : 'Agregar portada (opcional)'}
        </button>
        {coverId && (
          <button type="button" className="btn small ghost" onClick={() => setCoverId(undefined)}>
            Quitar
          </button>
        )}
      </div>

      <div className="field">
        <span>Estado</span>
        <Segmented
          value={status}
          onChange={setStatus}
          options={(['reading', 'resting', 'processed'] as const).map((s) => ({
            value: s,
            label: s === 'resting' ? 'Terminado' : STATUS_LABELS[s],
          }))}
        />
        <span className="hint">Al marcarlo como terminado queda “en reposo”; pasados unos días te propondré la sesión de transferencia. “Procesado” es cuando ya pasaste lo mejor a fichas.</span>
      </div>

      {!isNew && (
        <div className="field">
          <span>Frecuencia en el repaso</span>
          <Segmented
            value={frequency}
            onChange={setFrequency}
            options={(['more', 'normal', 'less', 'never'] as const).map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }))}
          />
        </div>
      )}

      <button className="btn primary big block" type="submit" disabled={!title.trim()}>
        Guardar
      </button>
      {!isNew && (
        <button type="button" className="btn danger block" onClick={remove}>
          Eliminar libro
        </button>
      )}
    </form>
  );
}
