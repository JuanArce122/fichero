import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { InstallBanner, Welcome } from '../components/Onboarding';
import { useToast, useAskToSave } from '../components/ui';
import { db } from '../db/db';
import { useBooksMap, useSettings, useTopicsMap } from '../hooks';
import { backupResultMessage, exportBackupNow } from '../lib/backupActions';
import { PRACTICE_DAYS, practiceDayNumber } from '../lib/apply';
import { dayKey } from '../lib/dates';
import { computeNotices } from '../lib/notices';
import { onThisDay } from '../lib/onThisDay';

interface Quote {
  text: string;
  bookId?: string;
  topicId?: string;
  to: string;
}

/** Una cita al azar cada vez que se abre la app. */
function useRandomQuote(): Quote | null | undefined {
  const [quote, setQuote] = useState<Quote | null>();
  useEffect(() => {
    let alive = true;
    (async () => {
      const cards = (await db.cards.toArray()).filter((c) => !c.discarded);
      let q: Quote | null = null;
      if (cards.length) {
        const c = cards[Math.floor(Math.random() * cards.length)];
        q = { text: c.quote || c.idea, bookId: c.bookId, topicId: c.topicId, to: `/ficha/${c.id}` };
      } else {
        // Sin fichas todavía: usamos un subrayado.
        const hs = (await db.highlights.toArray()).filter((h) => !h.discarded);
        const h = hs[Math.floor(Math.random() * hs.length)];
        if (h) q = { text: h.text, bookId: h.bookId, to: `/subrayado/${h.id}` };
      }
      if (alive) setQuote(q);
    })();
    return () => {
      alive = false;
    };
  }, []);
  return quote;
}

const QUICK: { to: string; icon: IconName; label: string }[] = [
  { to: '/capturar', icon: 'pen', label: 'Capturar subrayado' },
  { to: '/cierre', icon: 'timer', label: 'Cierre de capítulo' },
  { to: '/repaso', icon: 'review', label: 'Repaso' },
  { to: '/diario', icon: 'moon', label: 'Diario' },
];

export default function Home() {
  const settings = useSettings();
  const notices = useLiveQuery(() => computeNotices(settings), [settings], []);
  const quote = useRandomQuote();
  const books = useBooksMap();
  const topics = useTopicsMap();
  const quoteSource = quote
    ? [quote.topicId && topics.get(quote.topicId)?.name, quote.bookId && books.get(quote.bookId)?.title]
        .filter(Boolean)
        .join(' · ')
    : '';
  const practice = useLiveQuery(async () => {
    const p = await db.practices.where('status').equals('active').first();
    return p ? { p, card: await db.cards.get(p.cardId) } : null;
  }, []);
  const bookCount = useLiveQuery(() => db.books.count(), []);
  const memories = useLiveQuery(async () => {
    const [journal, cards, highlights] = await Promise.all([db.journal.toArray(), db.cards.toArray(), db.highlights.toArray()]);
    return onThisDay(dayKey(), { journal, cards, highlights });
  }, [], []);
  const toast = useToast();
  const askToSave = useAskToSave();
  const [backingUp, setBackingUp] = useState(false);

  const backup = async () => {
    setBackingUp(true);
    try {
      toast(backupResultMessage(await exportBackupNow(askToSave)));
    } catch (e) {
      toast(`No se pudo crear el respaldo: ${(e as Error).message}`);
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <div className="page">
      <div className="greeting">{greeting()}</div>
      <header className="page-header">
        <h1>Fichero</h1>
        <Link to="/buscar" className="icon-btn" aria-label="Buscar">
          <Icon name="search" />
        </Link>
        <Link to="/ajustes" className="icon-btn" aria-label="Ajustes">
          <Icon name="settings" />
        </Link>
      </header>

      <InstallBanner />

      {bookCount === 0 && <Welcome />}

      {quote === null && bookCount !== 0 && (
        <div className="quote-hero">
          <blockquote>“Lo que impide la acción hace avanzar la acción. Lo que se interpone en el camino se convierte en el camino.”</blockquote>
          <div className="small muted">Marco Aurelio · Agrega tu primer subrayado para ver aquí tus propias citas.</div>
        </div>
      )}
      {quote && (
        <Link to={quote.to} className="quote-hero" style={{ color: 'inherit' }}>
          <blockquote>“{quote.text}”</blockquote>
          {quoteSource && <div className="small muted">{quoteSource}</div>}
        </Link>
      )}

      {notices.length > 0 && (
        <section className="stack-sm">
          <div className="section-title">Pendiente</div>
          {notices.map((n) =>
            n.kind === 'backup' ? (
              <div key={n.kind} className="notice warn">
                <span className="dot" />
                <div className="spacer">
                  <div>{n.title}</div>
                  {n.detail && <div className="small muted">{n.detail}</div>}
                </div>
                <button className="btn small primary" onClick={backup} disabled={backingUp}>
                  <Icon name="shield" size={16} /> Respaldar
                </button>
              </div>
            ) : (
              <Link key={n.kind + n.title} to={n.to!} className={`notice${n.warn ? ' warn' : ''}`}>
                <span className="dot" />
                <div className="spacer">
                  <div>{n.title}</div>
                  {n.detail && <div className="small muted">{n.detail}</div>}
                </div>
                <Icon name="chevron" size={18} />
              </Link>
            ),
          )}
        </section>
      )}

      {memories.length > 0 && (
        <section className="stack-sm">
          <div className="section-title">En esta fecha</div>
          {memories.map((m) => (
            <Link key={m.kind + m.id} to={m.to} className="notice">
              <Icon name="calendar" size={20} />
              <div className="spacer">
                <div className="tiny muted">
                  {m.label} · {m.kind === 'journal' ? 'escribiste en tu diario' : m.kind === 'card' ? 'creaste esta ficha' : 'subrayaste'}
                </div>
                <div className="clamp-3" style={{ fontFamily: 'var(--font-read)' }}>
                  {m.text}
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}

      {bookCount !== 0 && (
      <section className="stack-sm">
        <div className="section-title">Idea de la semana</div>
        {practice?.card ? (
          <Link to="/practica" className="notice">
            <div className="spacer">
              <div className="tiny muted">
                Día {practiceDayNumber(practice.p, dayKey()) ?? PRACTICE_DAYS} de {PRACTICE_DAYS} ·{' '}
                {topics.get(practice.card.topicId)?.name}
              </div>
              <div className="clamp-3" style={{ fontFamily: 'var(--font-read)' }}>
                {practice.card.idea}
              </div>
            </div>
            <Icon name="chevron" size={18} />
          </Link>
        ) : (
          <Link to="/practica" className="notice">
            <span className="spacer muted">Elige una ficha para practicar esta semana</span>
            <Icon name="chevron" size={18} />
          </Link>
        )}
      </section>
      )}

      <section className="stack-sm">
        <div className="section-title">Accesos rápidos</div>
        <nav className="quick">
          {QUICK.map((q) => (
            <Link key={q.to} to={q.to}>
              <Icon name={q.icon} />
              {q.label}
            </Link>
          ))}
        </nav>
      </section>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 13) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}
