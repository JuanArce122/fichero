import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ClozeText } from '../components/ClozeText';
import { PageHeader, Segmented, useConfirm, useToast } from '../components/ui';
import { db } from '../db/db';
import { createFlashcard, deleteFlashcard, updateFlashcard } from '../db/repo';
import type { FlashcardKind } from '../db/types';
import { formatDate } from '../lib/dates';
import { buildCloze, clozeCount, stripCloze, tokenize } from '../lib/mastery';

/** Crear (/maestria/nueva?subrayado=… | ?ficha=…) o editar (/maestria/:id) una flashcard. */
export default function FlashcardForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const highlightId = params.get('subrayado');
  const cardId = params.get('ficha');

  const existing = useLiveQuery(() => (id ? db.flashcards.get(id) : undefined), [id]);
  const source = useLiveQuery(async () => {
    const sType = existing?.sourceType ?? (highlightId ? 'highlight' : cardId ? 'card' : undefined);
    const sId = existing?.sourceId ?? highlightId ?? cardId ?? undefined;
    if (!sType || !sId) return null;
    if (sType === 'highlight') {
      const h = await db.highlights.get(sId);
      return h ? { type: 'highlight' as const, id: h.id, texts: { Subrayado: h.text } } : null;
    }
    const c = await db.cards.get(sId);
    if (!c) return null;
    const texts: Record<string, string> = { Idea: c.idea };
    if (c.quote) texts.Cita = c.quote;
    if (c.application) texts['Cómo lo aplico'] = c.application;
    return { type: 'card' as const, id: c.id, texts };
  }, [existing, highlightId, cardId]);

  const [kind, setKind] = useState<FlashcardKind>('cloze');
  const [baseText, setBaseText] = useState('');
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [rawCloze, setRawCloze] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || source === undefined) return;
    if (id) {
      if (!existing) return;
      setKind(existing.kind);
      setRawCloze(existing.text);
      setBaseText(stripCloze(existing.text));
      setQuestion(existing.question);
      setAnswer(existing.answer);
    } else if (source) {
      const first = Object.values(source.texts)[0];
      setBaseText(first);
      setAnswer(first);
    }
    initialized.current = true;
  }, [id, existing, source]);

  const tokens = useMemo(() => tokenize(baseText), [baseText]);
  const clozeText = rawCloze ?? buildCloze(tokens, hidden);

  const toggle = (i: number) => {
    setRawCloze(null);
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const valid = kind === 'cloze' ? clozeCount(clozeText) > 0 : question.trim() && answer.trim();

  const save = async () => {
    if (!valid) return;
    const data = { kind, text: kind === 'cloze' ? clozeText : '', question, answer };
    if (id) {
      await updateFlashcard(id, data);
      toast('Flashcard guardada');
      navigate(-1);
    } else {
      await createFlashcard({ ...data, sourceType: source?.type, sourceId: source?.id });
      toast('Flashcard creada');
      navigate(-1);
    }
  };

  const remove = async () => {
    if (!id) return;
    if (await confirm({ title: '¿Eliminar esta flashcard?', message: 'Se pierde su historial de repaso.', confirm: 'Eliminar', danger: true })) {
      await deleteFlashcard(id);
      navigate(-1);
    }
  };

  if (id && existing === undefined) return null;

  return (
    <div className="page">
      <PageHeader title={id ? 'Flashcard' : 'Nueva flashcard'} back />

      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'cloze', label: 'Ocultar palabras' },
          { value: 'qa', label: 'Pregunta / respuesta' },
        ]}
      />

      {source && Object.keys(source.texts).length > 1 && !id && (
        <div className="chips">
          {Object.entries(source.texts).map(([label, text]) => (
            <button
              key={label}
              className={`chip${baseText === text ? ' on' : ''}`}
              onClick={() => {
                setBaseText(text);
                setHidden(new Set());
                setRawCloze(null);
                if (!answer || Object.values(source.texts).includes(answer)) setAnswer(text);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {kind === 'cloze' ? (
        <div className="stack">
          {rawCloze === null ? (
            <>
              <p className="small muted">Toca las palabras clave que quieres ocultar.</p>
              <div className="panel tokens">
                {tokens.map((t, i) =>
                  /^\s+$/.test(t) ? (
                    <span key={i}>{t}</span>
                  ) : (
                    <button key={i} type="button" className={hidden.has(i) ? 'on' : ''} onClick={() => toggle(i)}>
                      {t}
                    </button>
                  ),
                )}
                {tokens.length === 0 && <span className="muted">Escribe el texto abajo.</span>}
              </div>
              <label className="field">
                <span>Texto</span>
                <textarea
                  value={baseText}
                  onChange={(e) => {
                    setBaseText(e.target.value);
                    setHidden(new Set());
                  }}
                />
              </label>
            </>
          ) : (
            <label className="field">
              <span>Texto (las palabras entre {'{{ }}'} se ocultan)</span>
              <textarea className="reading" value={rawCloze} onChange={(e) => setRawCloze(e.target.value)} />
            </label>
          )}
          <div className="field">
            <span>Vista previa</span>
            <div className="fcard">
              <div className="idea">
                <ClozeText text={clozeText} revealed={false} />
              </div>
            </div>
          </div>
          {rawCloze === null && clozeCount(clozeText) > 0 && (
            <button type="button" className="btn small ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setRawCloze(clozeText)}>
              Editar huecos a mano
            </button>
          )}
        </div>
      ) : (
        <div className="stack">
          <label className="field">
            <span>Pregunta</span>
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="¿Qué debo hacer cuando…?" autoFocus={!id} />
          </label>
          <label className="field">
            <span>Respuesta</span>
            <textarea className="reading" value={answer} onChange={(e) => setAnswer(e.target.value)} />
          </label>
        </div>
      )}

      <button className="btn primary big block" onClick={save} disabled={!valid}>
        Guardar
      </button>

      {existing && (
        <div className="stack-sm">
          <p className="small muted center">
            {existing.suspended
              ? 'Suspendida: no aparece en los repasos.'
              : `Próximo repaso: ${formatDate(existing.due)} · ${existing.fsrs.reps} repasos · ${existing.fsrs.lapses} olvidos`}
          </p>
          {existing.sourceId && (
            <Link to={existing.sourceType === 'card' ? `/ficha/${existing.sourceId}` : `/subrayado/${existing.sourceId}`} className="btn block">
              Ver origen
            </Link>
          )}
          <div className="actions-2">
            <button className="btn" onClick={() => updateFlashcard(existing.id, { suspended: !existing.suspended })}>
              {existing.suspended ? 'Reactivar' : 'Suspender'}
            </button>
            <button className="btn danger" onClick={remove}>
              Eliminar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
