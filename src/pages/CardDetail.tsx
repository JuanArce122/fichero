import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { CardView, HighlightLink } from '../components/items';
import { PageHeader, useConfirm } from '../components/ui';
import { db } from '../db/db';
import { deleteCard, updateCard } from '../db/repo';
import { useTopicsMap } from '../hooks';

export default function CardDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const topics = useTopicsMap();
  const data = useLiveQuery(async () => {
    const card = await db.cards.get(id);
    if (!card) return { card: null };
    const [book, chapter, highlights] = await Promise.all([
      card.bookId ? db.books.get(card.bookId) : undefined,
      card.chapterId ? db.chapters.get(card.chapterId) : undefined,
      db.highlights.bulkGet(card.highlightIds),
    ]);
    return { card, book, chapter, highlights: highlights.filter((h) => !!h) };
  }, [id]);

  if (!data) return null;
  if (!data.card) {
    return (
      <div className="page">
        <PageHeader title="Ficha no encontrada" back="/fichas" />
      </div>
    );
  }
  const { card, book, chapter, highlights = [] } = data;

  const remove = async () => {
    if (await confirm({ title: '¿Eliminar esta ficha?', confirm: 'Eliminar', danger: true })) {
      await deleteCard(card.id);
      navigate(-1);
    }
  };

  return (
    <div className="page">
      <PageHeader title="" back>
        <button
          className={`icon-btn${card.favorite ? ' on' : ''}`}
          aria-label="Favorito"
          onClick={() => updateCard(card.id, { favorite: !card.favorite })}
        >
          <Icon name="star" filled={card.favorite} />
        </button>
        <Link to={`/ficha/${card.id}/editar`} className="btn small">
          Editar
        </Link>
      </PageHeader>

      <CardView card={card} topic={topics.get(card.topicId)} book={book} chapter={chapter} />

      <div className="stack-sm">
        <Link to={`/practica/nueva?ficha=${card.id}`} className="btn block">
          Practicar esta semana
        </Link>
        <Link to={`/maestria/nueva?ficha=${card.id}`} className="btn block">
          Crear flashcard
        </Link>
        <div className="actions-2">
          <button className="btn" onClick={() => updateCard(card.id, { discarded: !card.discarded })}>
            {card.discarded ? 'Recuperar' : 'Descartar'}
          </button>
          <button className="btn danger" onClick={remove}>
            Eliminar
          </button>
        </div>
      </div>

      {highlights.length > 0 && (
        <section className="stack-sm">
          <div className="section-title">Subrayados de origen</div>
          <div className="list">
            {highlights.map((h) => (
              <HighlightLink key={h.id} h={h} book={book} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
