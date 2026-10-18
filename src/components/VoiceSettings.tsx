import { useEffect, useState } from 'react';
import { updateSettings } from '../db/repo';
import type { Settings } from '../db/types';
import { canSpeak, loadVoices, pickVoice, qualityLabel, speak, stopSpeaking, voicesFor, type SpeechLang, type VoiceLike } from '../lib/speech';
import { Segmented } from './ui';

const SAMPLE: Record<SpeechLang, string> = {
  es: 'Lo que impide la acción hace avanzar la acción. Lo que se interpone en el camino se convierte en el camino.',
  en: 'The impediment to action advances action. What stands in the way becomes the way.',
};

const RATES = [
  { value: '0.85', label: 'Lenta' },
  { value: '1', label: 'Normal' },
  { value: '1.15', label: 'Rápida' },
];

/** Elegir voz (español e inglés) y velocidad de la lectura en voz alta. */
export function VoiceSettings({ settings }: { settings: Settings }) {
  const [voices, setVoices] = useState<VoiceLike[]>([]);

  useEffect(() => {
    loadVoices().then(setVoices);
    // iOS agrega las voces recién descargadas sin recargar.
    const refresh = () => setVoices(window.speechSynthesis.getVoices());
    if (canSpeak()) window.speechSynthesis.addEventListener('voiceschanged', refresh);
    return () => {
      if (canSpeak()) window.speechSynthesis.removeEventListener('voiceschanged', refresh);
      stopSpeaking();
    };
  }, []);

  if (!canSpeak()) return <p className="small muted">Este navegador no puede leer en voz alta.</p>;

  const rate = String(settings.speechRate ?? 1);
  const row = (lang: SpeechLang, label: string, key: 'voiceEs' | 'voiceEn') => {
    const list = voicesFor(lang, voices);
    const current = pickVoice(lang, voices, settings[key]);
    return (
      <div className="field">
        <span>{label}</span>
        <div className="row nowrap">
          <select
            value={current?.voiceURI ?? ''}
            onChange={(e) => updateSettings({ [key]: e.target.value })}
            aria-label={label}
            style={{ flex: 1 }}
          >
            {list.length === 0 && <option value="">Sin voces instaladas</option>}
            {list.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name.replace(/\s*\((premium|enhanced|mejorada|compact)\)/i, '')} · {qualityLabel(v)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn small"
            disabled={!list.length}
            onClick={() => speak(SAMPLE[lang], { lang, voiceEs: settings.voiceEs, voiceEn: settings.voiceEn, rate: Number(rate) })}
          >
            Probar
          </button>
        </div>
      </div>
    );
  };

  const hasGood = (lang: SpeechLang) => voicesFor(lang, voices).some((v) => qualityLabel(v) === 'Premium' || qualityLabel(v) === 'Mejorada');

  return (
    <div className="stack">
      {row('es', 'Voz en español', 'voiceEs')}
      {row('en', 'Voz en inglés', 'voiceEn')}
      <div className="field">
        <span>Velocidad</span>
        <Segmented value={rate} onChange={(v) => updateSettings({ speechRate: Number(v) })} options={RATES} />
      </div>
      {(!hasGood('es') || !hasGood('en')) && (
        <div className="notice small" style={{ alignItems: 'flex-start' }}>
          <div className="stack-sm">
            <b>Consigue voces mucho más naturales (gratis)</b>
            <span>
              En el iPhone: <b>Ajustes → Accesibilidad → Contenido leído → Voces</b>. Elige <b>Español</b> (y luego{' '}
              <b>Inglés</b>), toca una voz y descarga la versión <b>Premium</b> o <b>Mejorada</b> (por ejemplo, Mónica o
              Paulina; Ava o Zoe en inglés). Después vuelve aquí y elígela.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
