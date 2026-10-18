import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHeader, Sheet, useToast, useAskToSave } from '../components/ui';
import { db } from '../db/db';
import { updateSettings } from '../db/repo';
import { useSettings } from '../hooks';
import {
  BackupError,
  hasUserData,
  parseBackup,
  restoreBackup,
  summarizeBackup,
  type BackupFile,
  type BackupSummary,
} from '../lib/backup';
import { backupResultMessage, exportBackupNow } from '../lib/backupActions';
import { count, formatDate, relativeDays } from '../lib/dates';
import { formatBytes } from '../lib/storage';

export default function Backup() {
  const settings = useSettings();
  const toast = useToast();
  const askToSave = useAskToSave();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ backup: BackupFile; summary: BackupSummary; size: number } | null>(null);
  const [localHasData, setLocalHasData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageCount = useLiveQuery(() => db.images.count(), [], 0);

  const doExport = async () => {
    setBusy(true);
    try {
      toast(backupResultMessage(await exportBackupNow(askToSave)));
    } catch (e) {
      toast(`No se pudo crear el respaldo: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file?: File) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setError(null);
    try {
      const backup = parseBackup(await file.text());
      setLocalHasData(await hasUserData(db));
      setPending({ backup, summary: summarizeBackup(backup), size: file.size });
    } catch (e) {
      setError(e instanceof BackupError ? e.message : 'No se pudo leer el archivo.');
    }
  };

  const doImport = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await restoreBackup(db, pending.backup);
      // El dispositivo queda igual que el respaldo: lo contamos como respaldado.
      await updateSettings({ lastBackupAt: Date.now() });
      setPending(null);
      toast('Respaldo importado');
      navigate('/');
    } catch (e) {
      setError(`La importación falló y no se modificó nada: ${(e as Error).message}`);
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Respaldo" back />

      <section className="panel stack">
        <h2>Exportar</h2>
        <p className="muted small">
          {settings.lastBackupAt
            ? `Último respaldo: ${formatDate(settings.lastBackupAt)} (${relativeDays(settings.lastBackupAt)}).`
            : 'Aún no has hecho ningún respaldo.'}{' '}
          En iPhone y iPad se abre la hoja de compartir: elige <b>Guardar en Archivos</b> → <b>iCloud Drive</b>.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.includePhotosInBackup}
            onChange={(e) => updateSettings({ includePhotosInBackup: e.target.checked })}
          />
          <span>
            Incluir fotos ({imageCount}){' '}
            <span className="small muted">— el archivo pesa más</span>
          </span>
        </label>
        <button className="btn primary big block" onClick={doExport} disabled={busy}>
          <Icon name="download" /> Respaldar ahora
        </button>
      </section>

      <section className="panel stack">
        <h2>Importar</h2>
        <p className="muted small">
          Elige un archivo de respaldo (por ejemplo, desde iCloud Drive). Verás su contenido antes de confirmar.
        </p>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <button className="btn block" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Icon name="upload" /> Elegir archivo…
        </button>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      </section>

      <Sheet open={!!pending} onClose={() => !busy && setPending(null)}>
        {pending && (
          <>
            <h2>¿Importar este respaldo?</h2>
            <div className="panel stack-sm small">
              <div>
                Creado: <b>{pending.summary.exportedAt ? formatDate(pending.summary.exportedAt) : 'fecha desconocida'}</b> ·{' '}
                {formatBytes(pending.size)}
              </div>
              <div>
                {count(pending.summary.books, 'libro', 'libros')} · {count(pending.summary.highlights, 'subrayado', 'subrayados')} ·{' '}
                {count(pending.summary.cards, 'ficha', 'fichas')} · {count(pending.summary.topics, 'tema', 'temas')}
              </div>
              <div>
                {count(pending.summary.flashcards, 'flashcard', 'flashcards')} ·{' '}
                {count(pending.summary.journal, 'entrada de diario', 'entradas de diario')} ·{' '}
                {count(pending.summary.practices, 'idea practicada', 'ideas practicadas')}
              </div>
              <div>{pending.summary.includesImages ? `${pending.summary.images} fotos incluidas` : 'Sin fotos'}</div>
              {pending.summary.bookTitles.length > 0 && (
                <div className="muted">
                  {pending.summary.bookTitles.slice(0, 6).join(' · ')}
                  {pending.summary.bookTitles.length > 6 ? ' …' : ''}
                </div>
              )}
            </div>
            {localHasData ? (
              <div className="notice warn">
                <span className="dot" />
                <div>
                  <b>Este dispositivo ya tiene datos.</b> Importar <b>reemplazará todo</b> lo que hay aquí por el
                  contenido del respaldo. Lo que no esté en el archivo se perderá.
                </div>
              </div>
            ) : (
              <p className="small muted">Este dispositivo no tiene datos; se cargará el contenido del respaldo.</p>
            )}
            <div className="actions-2">
              <button className="btn" onClick={() => setPending(null)} disabled={busy}>
                Cancelar
              </button>
              <button className={`btn ${localHasData ? 'danger' : 'primary'}`} onClick={doImport} disabled={busy}>
                {localHasData ? 'Reemplazar todo' : 'Importar'}
              </button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}
