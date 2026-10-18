import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CardPicker } from '../components/CardPicker';
import { Icon } from '../components/Icon';
import { CardView } from '../components/items';
import { Empty, PageHeader, Segmented, useConfirm, useToast } from '../components/ui';
import { db } from '../db/db';
import { activePractice, closeExpiredPractices, finishPractice, saveCheckin, startPractice } from '../db/repo';
import type { Practice as PracticeT } from '../db/types';
import { useTopicsMap } from '../hooks';
import { PRACTICE_DAYS, appliedCount, practiceDayNumber, practiceDays } from '../lib/apply';
import { count, dayKey, formatDay } from '../lib/dates';

/** Idea de la semana: práctica activa, check-in de hoy e historial. */
export default function Practice() {
  const today = dayKey();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    closeExpiredPractices();
  }, []);

  const active = useLiveQuery(() => activePractice().then((p) => p ?? null), []);
  const history = useLiveQuery(
    async () => (await db.practices.toArray()).filter((p) => p.status !== 'active').sort((a, b) => b.createdAt - a.createdAt),
    [],
    [],
  );
  const cards = useLiveQuery(async () => new Map((await db.cards.toArray()).map((c) => [c.id, c])), [], new Map());

  if (active === undefined) return null;

  const stop = async () => {
    if (!active) return;
    if (await confirm({ title: '¿Terminar esta práctica?', message: 'Quedará en tu historial.', confirm: 'Terminar' }))
      await finishPractice(active.id, 'stopped');
  };

  return (
    <div className="page">
      <PageHeader title="Idea de la semana" back="/" />

      {active ? (
        <ActivePractice practice={active} today={today} onStop={stop} />
      ) : (
        <Empty>
          <p>Elige una ficha y practícala durante 7 días. Cada día te preguntaré si la aplicaste y cómo.</p>
          <button className="btn primary" onClick={() => setPicker(true)}>
            Elegir ficha
          </button>
        </Empty>
      )}

      {history.length > 0 && (
        <section className="stack-sm">
          <div className="section-title">Ideas practicadas · {history.length}</div>
          <div className="list">
            {history.map((p) => (
              <Link key={p.id} to={`/practica/${p.id}`} className="list-item">
                <div className="grow">
                  <div className="clamp-3">{cards.get(p.cardId)?.idea ?? 'Ficha eliminada'}</div>
                  <div className="tiny muted">
                    {formatDay(p.startDate)} · aplicada {appliedCount(p)} de {PRACTICE_DAYS} días
                    {p.status === 'stopped' ? ' · terminada antes' : ''}
                  </div>
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
        title="¿Qué idea vas a practicar?"
        onPick={async (c) => {
          await startPractice(c.id);
          navigate('/practica', { replace: true });
        }}
      />
    </div>
  );
}

function ActivePractice({ practice, today, onStop }: { practice: PracticeT; today: string; onStop: () => void }) {
  const toast = useToast();
  const topics = useTopicsMap();
  const card = useLiveQuery(() => db.cards.get(practice.cardId), [practice.cardId]);
  const todayCheckin = practice.checkins.find((c) => c.date === today);
  const [applied, setApplied] = useState<'yes' | 'no'>(todayCheckin?.applied === false ? 'no' : 'yes');
  const [note, setNote] = useState(todayCheckin?.note ?? '');
  const [reflection, setReflection] = useState(practice.reflection);
  const day = practiceDayNumber(practice, today);

  const save = async () => {
    await saveCheckin(practice.id, { date: today, applied: applied === 'yes', note });
    toast('Check-in guardado');
  };

  const complete = async () => {
    await finishPractice(practice.id, 'completed', reflection);
    toast('¡Semana completada!');
  };

  return (
    <div className="stack">
      {card && <CardView card={card} topic={topics.get(card.topicId)} />}

      <div className="panel stack-sm">
        <div className="row">
          <b className="spacer">Día {day ?? PRACTICE_DAYS} de {PRACTICE_DAYS}</b>
          <span className="small muted">Aplicada {count(appliedCount(practice), 'vez', 'veces')}</span>
        </div>
        <DayStrip practice={practice} today={today} />
      </div>

      {day !== null && (
        <div className="panel stack">
          <h2>¿La aplicaste hoy?</h2>
          <Segmented
            value={applied}
            onChange={setApplied}
            options={[
              { value: 'yes', label: 'Sí' },
              { value: 'no', label: 'Todavía no' },
            ]}
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={applied === 'yes' ? '¿Cómo? ¿Qué pasó?' : '¿Qué lo impidió? ¿Cuándo podrías hacerlo?'}
          />
          <button className="btn primary block" onClick={save}>
            {todayCheckin ? 'Actualizar check-in' : 'Guardar check-in'}
          </button>
        </div>
      )}

      {practice.checkins.some((c) => c.note) && (
        <section className="stack-sm">
          <div className="section-title">Notas de la semana</div>
          <div className="list">
            {practice.checkins
              .filter((c) => c.note)
              .map((c) => (
                <div key={c.date} className="list-item">
                  <span>{c.applied ? '✓' : '·'}</span>
                  <div className="grow">
                    <div className="tiny muted">{formatDay(c.date)}</div>
                    <div>{c.note}</div>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {(day === PRACTICE_DAYS || day === null) && (
        <div className="panel stack">
          <h2>Cierre de la semana</h2>
          <textarea value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="¿Qué aprendiste practicando esta idea?" />
          <button className="btn primary block" onClick={complete}>
            Completar semana
          </button>
        </div>
      )}

      <button className="btn ghost small" style={{ alignSelf: 'center' }} onClick={onStop}>
        Terminar antes
      </button>
    </div>
  );
}

function DayStrip({ practice, today }: { practice: PracticeT; today: string }) {
  const byDate = new Map(practice.checkins.map((c) => [c.date, c]));
  return (
    <div className="day-strip">
      {practiceDays(practice).map((d, i) => {
        const c = byDate.get(d);
        const cls = c ? (c.applied ? 'yes' : 'no') : d < today ? 'missed' : '';
        return (
          <div key={d} className={`day ${cls}${d === today ? ' today' : ''}`} title={formatDay(d)}>
            <span>{i + 1}</span>
            {c?.applied ? '✓' : c ? '–' : ''}
          </div>
        );
      })}
    </div>
  );
}

/** /practica/nueva?ficha=… : empieza una práctica (avisando si ya hay otra). */
export function PracticeStart() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const cardId = params.get('ficha');
    (async () => {
      if (!cardId) return navigate('/practica', { replace: true });
      const current = await activePractice();
      if (current?.cardId === cardId) return navigate('/practica', { replace: true });
      if (current) {
        const ok = await confirm({
          title: 'Ya estás practicando otra idea',
          message: 'Si empiezas esta, la anterior quedará terminada en tu historial.',
          confirm: 'Empezar esta',
        });
        if (!ok) return navigate(-1);
      }
      await startPractice(cardId);
      navigate('/practica', { replace: true });
    })();
  }, [params, navigate, confirm]);
  return null;
}

/** /practica/:id : una práctica pasada. */
export function PracticeDetail() {
  const { id = '' } = useParams();
  const topics = useTopicsMap();
  const data = useLiveQuery(async () => {
    const p = await db.practices.get(id);
    return { p, card: p ? await db.cards.get(p.cardId) : undefined };
  }, [id]);
  if (!data) return null;
  const { p, card } = data;
  if (!p) return <PageHeader title="No encontrada" back="/practica" />;
  return (
    <div className="page">
      <PageHeader title="Idea practicada" back="/practica" />
      {card && (
        <Link to={`/ficha/${card.id}`}>
          <CardView card={card} topic={topics.get(card.topicId)} compact />
        </Link>
      )}
      <div className="panel stack-sm">
        <div className="small muted">
          {formatDay(p.startDate)} → {formatDay(p.endDate)} · aplicada {appliedCount(p)} de {PRACTICE_DAYS} días
        </div>
        <DayStrip practice={p} today="9999-12-31" />
      </div>
      {p.checkins.filter((c) => c.note).map((c) => (
        <div key={c.date} className="panel stack-sm">
          <div className="tiny muted">
            {formatDay(c.date)} · {c.applied ? 'aplicada' : 'no aplicada'}
          </div>
          <div>{c.note}</div>
        </div>
      ))}
      {p.reflection && (
        <div className="panel stack-sm">
          <span className="section-title" style={{ margin: 0 }}>
            Reflexión
          </span>
          <div style={{ whiteSpace: 'pre-wrap' }}>{p.reflection}</div>
        </div>
      )}
    </div>
  );
}
