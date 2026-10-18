import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isAppleTouchDevice } from '../lib/share';
import { isStandalone } from '../lib/storage';
import { Icon, type IconName } from './Icon';

const DISMISS_KEY = 'fichero:install-dismissed-until';

function readDismissed(): number {
  try {
    return Number(localStorage.getItem(DISMISS_KEY) ?? 0);
  } catch {
    return 0;
  }
}

/**
 * En Safari (sin instalar) los datos pueden borrarse a los 7 días sin uso.
 * iOS no permite un botón de instalar, así que mostramos los pasos.
 */
export function InstallBanner() {
  const [hidden, setHidden] = useState(() => isStandalone() || readDismissed() > Date.now());
  if (hidden || !isAppleTouchDevice()) return null;
  const later = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 3 * 24 * 3600 * 1000));
    } catch {
      /* sin almacenamiento: solo se oculta ahora */
    }
    setHidden(true);
  };
  return (
    <section className="install">
      <div className="row nowrap" style={{ alignItems: 'flex-start' }}>
        <Icon name="shield" />
        <div className="spacer stack-sm">
          <b>Instala Fichero para proteger tus datos</b>
          <span className="small">
            Abierto en Safari, iOS puede borrar lo que guardes si pasas unos días sin entrar. Instalado, no.
          </span>
        </div>
      </div>
      <ol className="install-steps small">
        <li>
          Toca <ShareGlyph /> <b>Compartir</b> en la barra de Safari.
        </li>
        <li>
          Elige <b>Agregar a pantalla de inicio</b> → <b>Agregar</b>.
        </li>
        <li>Abre Fichero desde el ícono, siempre.</li>
      </ol>
      <button className="btn small ghost" style={{ alignSelf: 'flex-end' }} onClick={later}>
        Ahora no
      </button>
    </section>
  );
}

function ShareGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ verticalAlign: '-2px' }}>
      <path d="M12 3v12M8 7l4-4 4 4M5 11v9h14v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'pen', title: 'Captura', text: 'Mientras lees, guarda lo que subrayas: foto, pegar o a mano.' },
  { icon: 'timer', title: 'Recuerda', text: 'Al terminar un capítulo, escribe de memoria la idea principal.' },
  { icon: 'cards', title: 'Destila', text: 'Pasa lo mejor a fichas por tema, en tus palabras.' },
  { icon: 'review', title: 'Repasa y aplica', text: '5 minutos al día de repaso, y una idea por semana para practicar.' },
];

/** Bienvenida del primer uso: explica el método y lleva a la primera acción. */
export function Welcome() {
  return (
    <section className="welcome stack">
      <div className="stack-sm">
        <h2 style={{ fontSize: '1.35rem' }}>Bienvenido a tu fichero</h2>
        <p className="muted">Un sistema de fichas para que lo que lees se quede contigo y lo uses en tu vida.</p>
      </div>
      <ol className="welcome-steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <span className="welcome-num">
              <Icon name={s.icon} size={18} />
            </span>
            <div>
              <b>
                {i + 1}. {s.title}
              </b>
              <div className="small muted">{s.text}</div>
            </div>
          </li>
        ))}
      </ol>
      <Link to="/libro/nuevo" className="btn primary big block">
        Agregar el libro que estoy leyendo
      </Link>
      <Link to="/respaldo" className="btn small ghost" style={{ alignSelf: 'center' }}>
        ¿Ya usas Fichero en otro dispositivo? Importar respaldo
      </Link>
    </section>
  );
}
