import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHeader, Segmented, useAskToSave, useToast } from '../components/ui';
import { db } from '../db/db';
import { useTopicsMap } from '../hooks';
import { dayKey } from '../lib/dates';
import { bookMarkdown, cardsCsv, highlightsCsv, slug, topicMarkdown, type ExportData } from '../lib/exporters';
import { saveFile } from '../lib/share';

async function loadExportData(): Promise<ExportData> {
  const [books, chapters, topics, highlights, cards] = await Promise.all([
    db.books.toArray(),
    db.chapters.toArray(),
    db.topics.toArray(),
    db.highlights.toArray(),
    db.cards.toArray(),
  ]);
  return {
    books: new Map(books.map((b) => [b.id, b])),
    chapters: new Map(chapters.map((c) => [c.id, c])),
    topics: new Map(topics.map((t) => [t.id, t])),
    highlights,
    cards,
  };
}

type MdKind = 'book' | 'topic';
type PdfMode = 'topic' | 'book' | 'select';
const ALL = '__all__';

export default function Export() {
  const toast = useToast();
  const askToSave = useAskToSave();
  const topicsMap = useTopicsMap();
  const books = useLiveQuery(() => db.books.orderBy('updatedAt').reverse().toArray(), [], []);
  const topics = useLiveQuery(async () => (await db.topics.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'es')), [], []);
  const cards = useLiveQuery(async () => (await db.cards.orderBy('createdAt').reverse().toArray()).filter((c) => !c.discarded), [], []);

  const [mdKind, setMdKind] = useState<MdKind>('book');
  const [mdTarget, setMdTarget] = useState(ALL);
  const [pdfMode, setPdfMode] = useState<PdfMode>('topic');
  const [pdfTarget, setPdfTarget] = useState(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const deliver = async (content: BlobPart, name: string, type: string) => {
    const result = await saveFile(new File([content], name, { type }), askToSave);
    if (result !== 'cancelled') toast(result === 'shared' ? 'Archivo listo' : 'Archivo descargado');
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(`No se pudo exportar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const exportMarkdown = () =>
    run(async () => {
      const d = await loadExportData();
      const ids = mdTarget === ALL ? (mdKind === 'book' ? books.map((b) => b.id) : topics.map((t) => t.id)) : [mdTarget];
      const parts = ids.map((id) => (mdKind === 'book' ? bookMarkdown(id, d) : topicMarkdown(id, d))).filter(Boolean);
      const label =
        mdTarget === ALL
          ? mdKind === 'book'
            ? 'libros'
            : 'temas'
          : slug((mdKind === 'book' ? d.books.get(mdTarget)?.title : d.topics.get(mdTarget)?.name) ?? 'export');
      await deliver(parts.join('\n---\n\n'), `fichero-${label}-${dayKey()}.md`, 'text/markdown');
    });

  const exportCsv = (kind: 'highlights' | 'cards') =>
    run(async () => {
      const d = await loadExportData();
      const text = kind === 'highlights' ? highlightsCsv(d) : cardsCsv(d);
      await deliver(text, `fichero-${kind === 'highlights' ? 'subrayados' : 'fichas'}-${dayKey()}.csv`, 'text/csv');
    });

  const pdfCards =
    pdfMode === 'select'
      ? cards.filter((c) => selected.has(c.id))
      : pdfTarget === ALL
        ? cards
        : cards.filter((c) => (pdfMode === 'topic' ? c.topicId === pdfTarget : c.bookId === pdfTarget));

  const exportPdf = () =>
    run(async () => {
      const d = await loadExportData();
      // Agrupadas por tema, como en una caja de fichas.
      const sorted = [...pdfCards].sort(
        (a, b) => (d.topics.get(a.topicId)?.name ?? '').localeCompare(d.topics.get(b.topicId)?.name ?? '', 'es') || a.createdAt - b.createdAt,
      );
      const { cardsPdf } = await import('../lib/pdf');
      const doc = cardsPdf(sorted, d);
      const label =
        pdfMode === 'select' || pdfTarget === ALL
          ? pdfMode === 'select'
            ? 'seleccion'
            : 'todas'
          : slug((pdfMode === 'topic' ? d.topics.get(pdfTarget)?.name : d.books.get(pdfTarget)?.title) ?? 'fichas');
      await deliver(doc.output('arraybuffer'), `fichas-4x6-${label}-${dayKey()}.pdf`, 'application/pdf');
    });

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="page">
      <PageHeader title="Exportar" back />
      <p className="small muted">
        Para guardar todo y poder restaurarlo, usa el <Link to="/respaldo">respaldo</Link>. Estas exportaciones son para
        leer, imprimir o usar en otras apps.
      </p>

      <section className="panel stack">
        <h2>PDF de fichas 4x6</h2>
        <p className="small muted">Una ficha por tarjeta de 6 × 4 pulgadas, lista para imprimir en cartulina.</p>
        <Segmented
          value={pdfMode}
          onChange={(m) => {
            setPdfMode(m);
            setPdfTarget(ALL);
          }}
          options={[
            { value: 'topic', label: 'Por tema' },
            { value: 'book', label: 'Por libro' },
            { value: 'select', label: 'Selección' },
          ]}
        />
        {pdfMode !== 'select' ? (
          <select value={pdfTarget} onChange={(e) => setPdfTarget(e.target.value)}>
            <option value={ALL}>{pdfMode === 'topic' ? 'Todos los temas' : 'Todos los libros'}</option>
            {(pdfMode === 'topic' ? topics.map((t) => ({ id: t.id, name: t.name })) : books.map((b) => ({ id: b.id, name: b.title }))).map(
              (o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ),
            )}
          </select>
        ) : (
          <div className="stack-sm">
            <div className="row">
              <span className="small muted spacer">{selected.size} seleccionadas</span>
              <button className="btn small ghost" onClick={() => setSelected(new Set(cards.map((c) => c.id)))}>
                Todas
              </button>
              <button className="btn small ghost" onClick={() => setSelected(new Set())}>
                Ninguna
              </button>
            </div>
            <div className="list" style={{ maxHeight: 320, overflow: 'auto' }}>
              {cards.map((c) => (
                <label key={c.id} className="list-item">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    style={{ width: 22, height: 22, accentColor: 'var(--accent)', flex: 'none' }}
                  />
                  <span className="grow">
                    <span className="tiny muted" style={{ textTransform: 'uppercase' }}>
                      {topicsMap.get(c.topicId)?.name}
                    </span>
                    <span className="clamp-3" style={{ display: '-webkit-box' }}>
                      {c.idea}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        <button className="btn primary block" onClick={exportPdf} disabled={busy || pdfCards.length === 0}>
          <Icon name="download" /> Generar PDF ({pdfCards.length} {pdfCards.length === 1 ? 'ficha' : 'fichas'})
        </button>
      </section>

      <section className="panel stack">
        <h2>Markdown</h2>
        <Segmented
          value={mdKind}
          onChange={(k) => {
            setMdKind(k);
            setMdTarget(ALL);
          }}
          options={[
            { value: 'book', label: 'Por libro' },
            { value: 'topic', label: 'Por tema' },
          ]}
        />
        <select value={mdTarget} onChange={(e) => setMdTarget(e.target.value)}>
          <option value={ALL}>{mdKind === 'book' ? 'Todos los libros (un archivo)' : 'Todos los temas (un archivo)'}</option>
          {(mdKind === 'book' ? books.map((b) => ({ id: b.id, name: b.title })) : topics.map((t) => ({ id: t.id, name: t.name }))).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button className="btn block" onClick={exportMarkdown} disabled={busy}>
          <Icon name="download" /> Exportar Markdown
        </button>
      </section>

      <section className="panel stack">
        <h2>CSV</h2>
        <p className="small muted">Para abrir en Numbers o Excel.</p>
        <div className="actions-2">
          <button className="btn" onClick={() => exportCsv('highlights')} disabled={busy}>
            Subrayados
          </button>
          <button className="btn" onClick={() => exportCsv('cards')} disabled={busy}>
            Fichas
          </button>
        </div>
      </section>
    </div>
  );
}
