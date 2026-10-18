import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CardPicker } from '../components/CardPicker';
import { Icon } from '../components/Icon';
import { PageHeader, useConfirm, useToast } from '../components/ui';
import { db } from '../db/db';
import { deleteJournal, journalFor, saveJournal } from '../db/repo';
import { useLoadedSettings, useTopicsMap } from '../hooks';
import { dayKey, formatDay } from '../lib/dates';

/** Diario nocturno: la entrada de hoy (o de /diario/:date) y el historial. */
export default function Journal() {
  const { date: dateParam } = useParams();
  const date = dateParam ?? dayKey();
  const isToday = date === dayKey();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const settings = useLoadedSettings();
  const topics = useTopicsMap();

  const entry = useLiveQuery(() => journalFor(date).then((e) => e ?? null), [date]);
  const history = useLiveQuery(
    async () => (await db.journal.orderBy('date').reverse().toArray()).filter((e) => e.date !== date).slice(0, 60),
    [date],
    [],
  );

  const [answers, setAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [cardIds, setCardIds] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const loadedFor = useRef<string | null>(null);

  const linked = useLiveQuery(async () => (await db.cards.bulkGet(cardIds)).filter((c) => !!c), [cardIds], []);
  // Si hay una idea de la semana activa, la ofrecemos para vincular con un toque.
  const practiceCard = useLiveQuery(async () => {
    const p = await db.practices.where('status').equals('active').first();
    return p ? db.cards.get(p.cardId) : undefined;
  }, []);

  useEffect(() => {
    if (entry === undefined || !settings || loadedFor.current === date) return;
    if (entry) {
      // Preguntas guardadas + las nuevas configuradas que falten.
      const extra = settings.journalQuestions.filter((q) => !entry.answers.some((a) => a.question === q));
      setAnswers([...entry.answers, ...extra.map((question) => ({ question, answer: '' }))]);
      setCardIds(entry.cardIds);
    } else {
      setAnswers(settings.journalQuestions.map((question) => ({ question, answer: '' })));
      setCardIds([]);
    }
    loadedFor.current = date;
  }, [entry, settings, date]);

  const setAnswer = (i: number, answer: string) => setAnswers((a) => a.map((x, j) => (j === i ? { ...x, answer } : x)));
  const hasContent = answers.some((a) => a.answer.trim());

  const save = async () => {
    await saveJournal(date, { answers: answers.filter((a) => a.answer.trim()), cardIds });
    toast('Entrada guardada');
  };

  const remove = async () => {
    if (!entry) return;
    if (await confirm({ title: '¿Eliminar esta entrada?', confirm: 'Eliminar', danger: true })) {
      await deleteJournal(entry.id);
      navigate('/diario', { replace: true });
    }
  };

  if (entry === undefined || !settings) return null;

  return (
    <div className="page">
      <PageHeader title="Diario" back={dateParam ? '/diario' : '/'} />
      <p className="muted">{isToday ? `Hoy, ${formatDay(date)}` : formatDay(date)}</p>

      {answers.map((a, i) => (
        <label key={a.question} className="field">
          <span className="prompt" style={{ fontSize: '1.1rem', color: 'var(--ink)' }}>
            {a.question}
          </span>
          <textarea value={a.answer} onChange={(e) => setAnswer(i, e.target.value)} />
        </label>
      ))}

      <section className="stack-sm">
        <div className="section-title">Fichas vinculadas</div>
        {linked.map((c) => (
          <div key={c.id} className="notice">
            <div className="spacer">
              <div className="tiny muted" style={{ textTransform: 'uppercase' }}>
                {topics.get(c.topicId)?.name}
              </div>
              <Link to={`/ficha/${c.id}`} style={{ color: 'inherit' }} className="clamp-3">
                {c.idea}
              </Link>
            </div>
            <button className="icon-btn" aria-label="Quitar" onClick={() => setCardIds((ids) => ids.filter((x) => x !== c.id))}>
              <Icon name="x" size={18} />
            </button>
          </div>
        ))}
        <div className="row">
          <button className="btn small" onClick={() => setPicker(true)}>
            <Icon name="plus" size={16} /> Vincular ficha
          </button>
          {practiceCard && !cardIds.includes(practiceCard.id) && (
            <button className="btn small" onClick={() => setCardIds((ids) => [...ids, practiceCard.id])}>
              + Idea de la semana
            </button>
          )}
        </div>
      </section>

      <button className="btn primary big block" onClick={save} disabled={!hasContent}>
        Guardar
      </button>
      {entry && (
        <button className="btn ghost small danger" style={{ alignSelf: 'center' }} onClick={remove}>
          Eliminar entrada
        </button>
      )}

      {history.length > 0 && (
        <section className="stack-sm">
          <div className="section-title">Entradas anteriores</div>
          <div className="list">
            {history.map((e) => (
              <Link key={e.id} to={`/diario/${e.date}`} className="list-item">
                <div className="grow">
                  <div className="small" style={{ fontWeight: 600 }}>
                    {formatDay(e.date)}
                  </div>
                  <div className="small muted ellipsis">{e.answers[0]?.answer}</div>
                </div>
                <Icon name="chevron" size={18} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <CardPicker
        open={picker}
        onClose={() => setPicker(false)}
        exclude={cardIds}
        title="Vincular una ficha"
        onPick={(c) => setCardIds((ids) => [...ids, c.id])}
      />
    </div>
  );
}
