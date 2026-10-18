import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/ui';
import { updateSettings } from '../db/repo';
import { DEFAULT_SETTINGS } from '../db/types';
import { useSettings } from '../hooks';
import { formatBytes, requestPersistence, storageStatus, type StorageStatus } from '../lib/storage';

export default function Settings() {
  const settings = useSettings();
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [questions, setQuestions] = useState('');

  useEffect(() => {
    storageStatus().then(setStorage);
  }, []);

  useEffect(() => {
    setQuestions(settings.journalQuestions.join('\n'));
  }, [settings.journalQuestions]);

  const askPersist = async () => {
    await requestPersistence();
    setStorage(await storageStatus());
  };

  const num = (key: 'dailyCount' | 'backupReminderDays' | 'restDays', min: number, max: number) => ({
    type: 'number' as const,
    inputMode: 'numeric' as const,
    min,
    max,
    value: settings[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Math.round(Number(e.target.value));
      if (Number.isFinite(v) && v >= min && v <= max) updateSettings({ [key]: v });
    },
    style: { width: 90 },
  });

  return (
    <div className="page">
      <PageHeader title="Ajustes" back />

      <div className="list">
        <Link to="/respaldo" className="list-item">
          <Icon name="shield" />
          <span className="grow">Respaldo e importación</span>
          <Icon name="chevron" size={18} />
        </Link>
        <Link to="/exportar" className="list-item">
          <Icon name="download" />
          <span className="grow">Exportar (PDF 4x6, Markdown, CSV)</span>
          <Icon name="chevron" size={18} />
        </Link>
        <Link to="/temas" className="list-item">
          <Icon name="cards" />
          <span className="grow">Temas de las fichas</span>
          <Icon name="chevron" size={18} />
        </Link>
      </div>

      <div className="section-title">Repaso diario</div>
      <div className="list">
        <label className="list-item">
          <span className="grow">Elementos por sesión</span>
          <input {...num('dailyCount', 1, 50)} />
        </label>
        <label className="list-item">
          <span className="grow">
            Intentar recordar primero
            <div className="tiny muted">Muestra solo el tema o el inicio de la idea antes de revelarla.</div>
          </span>
          <input
            type="checkbox"
            checked={settings.recallFirst}
            onChange={(e) => updateSettings({ recallFirst: e.target.checked })}
            style={{ width: 22, height: 22, accentColor: 'var(--accent)' }}
          />
        </label>
      </div>

      <div className="section-title">Recordatorios</div>
      <div className="list">
        <label className="list-item">
          <span className="grow">Avisar si no respaldo en (días)</span>
          <input {...num('backupReminderDays', 1, 90)} />
        </label>
        <label className="list-item">
          <span className="grow">Días de reposo antes de la transferencia</span>
          <input {...num('restDays', 1, 60)} />
        </label>
      </div>

      <div className="section-title">Diario nocturno</div>
      <div className="panel stack-sm">
        <label className="field">
          <span>Preguntas (una por línea)</span>
          <textarea
            value={questions}
            onChange={(e) => setQuestions(e.target.value)}
            onBlur={() => {
              const list = questions.split('\n').map((q) => q.trim()).filter(Boolean);
              updateSettings({ journalQuestions: list.length ? list : DEFAULT_SETTINGS.journalQuestions });
            }}
          />
        </label>
        <button
          className="btn small ghost"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => updateSettings({ journalQuestions: DEFAULT_SETTINGS.journalQuestions })}
        >
          Restaurar preguntas estoicas
        </button>
      </div>

      <div className="section-title">Almacenamiento</div>
      <div className="panel stack-sm small">
        <div>
          Almacenamiento persistente:{' '}
          <b>{storage?.persisted ? 'concedido' : storage?.persisted === false ? 'no concedido' : 'no disponible'}</b>
        </div>
        <div>
          Instalada en pantalla de inicio: <b>{storage?.standalone ? 'sí' : 'no'}</b>
        </div>
        <div>
          Espacio usado: {formatBytes(storage?.usage)}
          {storage?.quota ? ` de ${formatBytes(storage.quota)}` : ''}
        </div>
        {!storage?.standalone && (
          <p className="muted">
            En iPhone, abre esta página en Safari, toca Compartir → <b>Agregar a pantalla de inicio</b>. Así Safari no
            borra tus datos por inactividad.
          </p>
        )}
        {storage?.persisted === false && (
          <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={askPersist}>
            Pedir almacenamiento persistente
          </button>
        )}
        <p className="muted">Aun así, el respaldo en iCloud Drive es tu única copia fuera del dispositivo.</p>
      </div>

      <p className="tiny muted center">Fichero · sin cuentas, sin servidor, sin IA. Tus datos viven en este dispositivo.</p>
    </div>
  );
}
