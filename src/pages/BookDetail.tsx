import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { BookCover, CardView, HighlightLink } from '../components/items';
import { Empty, PageHeader, Segmented, Sheet, useConfirm } from '../components/ui';
import { db } from '../db/db';
import { addChapter, chaptersOf, deleteChapter } from '../db/repo';
import { STATUS_LABELS, type Chapter } from '../db/types';
import { useTopicsMap } from '../hooks';

type Tab = 'highlights' | 'cards' | 'chapters';

export default function BookDetail() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<Tab>('highlights');
  const [addingChapter, setAddingChapter] = useState(false);
  const topics = useTopicsMap();
  const data = useLiveQuery(async () => {
    const book = await db.books.get(id);
    if (!book) return { book: null };
    const [chapters, highlights, cards] = await Promise.all([
      chaptersOf(id),
      db.highlights.where('bookId').equals(id).toArray(),
      db.cards.where('bookId').equals(id).toArray(),
    ]);
    return { book, chapters, highlights, cards };
  }, [id]);

  if (!data) return null;
  if (!data.book) {
    return (
      <div className="page">
        <PageHeader title="Libro no encontrado" back="/biblioteca" />
      </div>
    );
  }
  const { book, chapters = [], highlights = [], cards = [] } = data;
  const chapterMap = new Map(chapters.map((c) => [c.id, c]));

  // Subrayados agrupados por capítulo, en el orden del libro.
  const groups: { chapter?: Chapter; items: typeof highlights }[] = [
    ...chapters.map((c) => ({ chapter: c, items: highlights.filter((h) => h.chapterId === c.id) })),
    { chapter: undefined, items: highlights.filter((h) => !h.chapterId || !chapterMap.has(h.chapterId)) },
  ]
    .filter((g) => g.items.length)
    .map((g) => ({ ...g, items: g.items.sort(byPageThenDate) }));

  const pending = highlights.filter((h) => !h.processed && !h.discarded).length;

  return (
    <div className="page">
      <PageHeader title="" back="/biblioteca">
        <Link to={`/libro/${id}/editar`} className="btn small">
          Editar
        </Link>
      </PageHeader>

      <div className="row nowrap" style={{ gap: 16, alignItems: 'flex-start' }}>
        <BookCover book={book} large />
        <div className="stack-sm" style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: '1.4rem' }}>{book.title}</h1>
          <div className="muted">{book.author}</div>
          <div className="row">
            <span className={`badge ${book.status}`}>{STATUS_LABELS[book.status]}</span>
            {book.frequency !== 'normal' && <span className="badge">Repaso: {book.frequency === 'never' ? 'nunca' : book.frequency === 'more' ? 'más' : 'menos'}</span>}
          </div>
          <div className="small muted">
            {highlights.length} subrayados · {cards.length} fichas · {pending} sin procesar
          </div>
        </div>
      </div>

      <div className="row">
        <Link to={`/capturar?libro=${id}`} className="btn primary">
          <Icon name="pen" size={18} /> Subrayado
        </Link>
        <Link to={`/ficha/nueva?libro=${id}`} className="btn">
          <Icon name="cards" size={18} /> Ficha
        </Link>
        <Link to={`/cierre?libro=${id}`} className="btn">
          <Icon name="timer" size={18} /> Cierre
        </Link>
      </div>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'highlights', label: `Subrayados (${highlights.length})` },
          { value: 'cards', label: `Fichas (${cards.length})` },
          { value: 'chapters', label: `Capítulos (${chapters.length})` },
        ]}
      />

      {tab === 'highlights' &&
        (groups.length === 0 ? (
          <Empty>Aún no hay subrayados en este libro.</Empty>
        ) : (
          groups.map((g) => (
            <section key={g.chapter?.id ?? 'none'} className="stack-sm">
              <div className="section-title">{g.chapter?.title ?? 'Sin capítulo'}</div>
              <div className="list">
                {g.items.map((h) => (
                  <HighlightLink key={h.id} h={h} chapter={undefined} showSource={false} />
                ))}
              </div>
            </section>
          ))
        ))}

      {tab === 'cards' &&
        (cards.length === 0 ? (
          <Empty>Aún no hay fichas de este libro.</Empty>
        ) : (
          <div className="grid">
            {cards.map((c) => (
              <Link key={c.id} to={`/ficha/${c.id}`}>
                <CardView card={c} topic={topics.get(c.topicId)} chapter={c.chapterId ? chapterMap.get(c.chapterId) : undefined} compact />
              </Link>
            ))}
          </div>
        ))}

      {tab === 'chapters' && (
        <ChaptersTab
          bookId={id}
          chapters={chapters}
          counts={(cid) => highlights.filter((h) => h.chapterId === cid).length}
          onAdd={() => setAddingChapter(true)}
        />
      )}

      <AddChapterSheet bookId={id} open={addingChapter} onClose={() => setAddingChapter(false)} />
    </div>
  );
}

function byPageThenDate(a: { page?: string; createdAt: number }, b: { page?: string; createdAt: number }) {
  const pa = parseInt(a.page ?? '', 10);
  const pb = parseInt(b.page ?? '', 10);
  if (!isNaN(pa) && !isNaN(pb) && pa !== pb) return pa - pb;
  return a.createdAt - b.createdAt;
}

function ChaptersTab({
  bookId,
  chapters,
  counts,
  onAdd,
}: {
  bookId: string;
  chapters: Chapter[];
  counts: (id: string) => number;
  onAdd: () => void;
}) {
  const confirm = useConfirm();
  const remove = async (c: Chapter) => {
    if (
      await confirm({
        title: `¿Eliminar “${c.title}”?`,
        message: 'Los subrayados y fichas del capítulo se conservan, sin capítulo asignado.',
        confirm: 'Eliminar',
        danger: true,
      })
    )
      await deleteChapter(c.id);
  };
  return (
    <div className="stack">
      {chapters.length > 0 && (
        <div className="list">
          {chapters.map((c) => (
            <div key={c.id} className="list-item">
              <div className="grow">
                <div>{c.title}</div>
                <div className="tiny muted">{counts(c.id)} subrayados</div>
              </div>
              <Link to={`/cierre?libro=${bookId}&cap=${c.id}`} className="btn small">
                Cierre
              </Link>
              <button className="icon-btn" aria-label="Eliminar capítulo" onClick={() => remove(c)}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button className="btn block" onClick={onAdd}>
        <Icon name="plus" size={18} /> Agregar capítulo
      </button>
    </div>
  );
}

export function AddChapterSheet({
  bookId,
  open,
  onClose,
  onAdded,
}: {
  bookId: string;
  open: boolean;
  onClose: () => void;
  onAdded?: (c: Chapter) => void;
}) {
  const [title, setTitle] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const c = await addChapter(bookId, title);
    setTitle('');
    onAdded?.(c);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <h2>Nuevo capítulo</h2>
        <input
          type="text"
          value={title}
          placeholder="Ej. 3. El arte de la aquiescencia"
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
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
