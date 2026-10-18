import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { BookCover } from '../components/items';
import { Empty, PageHeader } from '../components/ui';
import { db } from '../db/db';
import { STATUS_LABELS, type Book, type BookStatus } from '../db/types';

const ORDER: BookStatus[] = ['reading', 'resting', 'finished', 'processed'];

export default function Library() {
  const data = useLiveQuery(async () => {
    const [books, highlights, cards] = await Promise.all([db.books.toArray(), db.highlights.toArray(), db.cards.toArray()]);
    const counts = new Map<string, { h: number; c: number }>();
    for (const h of highlights) {
      const x = counts.get(h.bookId) ?? { h: 0, c: 0 };
      x.h++;
      counts.set(h.bookId, x);
    }
    for (const c of cards) {
      if (!c.bookId) continue;
      const x = counts.get(c.bookId) ?? { h: 0, c: 0 };
      x.c++;
      counts.set(c.bookId, x);
    }
    return { books: books.sort((a, b) => b.updatedAt - a.updatedAt), counts };
  });

  if (!data) return null;
  const groups = ORDER.map((s) => ({ status: s, books: data.books.filter((b) => b.status === s) })).filter(
    (g) => g.books.length,
  );

  return (
    <div className="page">
      <PageHeader title="Biblioteca">
        <Link to="/libro/nuevo" className="btn small primary">
          <Icon name="plus" size={16} /> Libro
        </Link>
      </PageHeader>

      {data.books.length === 0 && (
        <Empty>
          <Icon name="book" size={36} />
          <p>Agrega el libro que estás leyendo para empezar a capturar subrayados.</p>
          <Link to="/libro/nuevo" className="btn primary">
            Agregar libro
          </Link>
        </Empty>
      )}

      {groups.map((g) => (
        <section key={g.status} className="stack-sm">
          <div className="section-title">{STATUS_LABELS[g.status]}</div>
          <div className="list">
            {g.books.map((b) => (
              <BookRow key={b.id} book={b} counts={data.counts.get(b.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function BookRow({ book, counts }: { book: Book; counts?: { h: number; c: number } }) {
  return (
    <Link to={`/libro/${book.id}`} className="list-item">
      <BookCover book={book} />
      <div className="grow">
        <div className="ellipsis" style={{ fontWeight: 600 }}>
          {book.title}
        </div>
        <div className="small muted ellipsis">{book.author}</div>
        <div className="tiny muted">
          {counts?.h ?? 0} subrayados · {counts?.c ?? 0} fichas
        </div>
      </div>
      <span className="chev">
        <Icon name="chevron" size={18} />
      </span>
    </Link>
  );
}
