// Lectura en voz alta con las voces del sistema (Web Speech API). Funciona sin
// conexión en iOS y macOS; no es IA generativa, solo síntesis de voz local.
//
// iOS trae voces "compactas" (robóticas) y permite descargar gratis versiones
// "Mejorada" y "Premium" mucho más naturales. Elegimos la mejor disponible,
// salvo que el usuario haya escogido una en Ajustes.

export type SpeechLang = 'es' | 'en';

const EN_WORDS = /\b(the|and|is|of|to|that|you|what|in|it|your|are|for|with|not)\b/gi;
const ES_WORDS = /\b(el|la|que|de|y|los|las|en|es|un|una|por|con|no|lo|se|tu)\b/gi;

/** Heurística simple: ¿el texto está en inglés o en español? */
export function guessLang(text: string): SpeechLang {
  const en = text.match(EN_WORDS)?.length ?? 0;
  const es = text.match(ES_WORDS)?.length ?? 0;
  return en > es ? 'en' : 'es';
}

export interface VoiceLike {
  name: string;
  lang: string;
  voiceURI: string;
  localService?: boolean;
  default?: boolean;
}

/** Voces de baja calidad o de efectos que nunca conviene elegir solas. */
const NOVELTY =
  /(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|rocko|shelley|eddy|flo|reed|sandy)/i;

/** Puntaje de calidad: premium > mejorada > voz normal > compacta/efectos. */
export function voiceScore(v: VoiceLike): number {
  const n = v.name.toLowerCase();
  let s = 0;
  if (/premium/.test(n)) s += 100;
  if (/(enhanced|mejorada|améliorée|optimierte)/.test(n)) s += 60;
  if (/(siri|neural|natural)/.test(n)) s += 50;
  if (/compact/.test(n)) s -= 30;
  if (NOVELTY.test(n)) s -= 80;
  // Voces conocidas por sonar bien en iOS/macOS.
  if (/(mónica|monica|paulina|marisol|jorge|juan|diego|ava|zoe|samantha|evan|nathan|allison|susan|tom|karen|daniel|serena)/.test(n)) s += 10;
  if (v.localService) s += 2;
  return s;
}

export function voicesFor(lang: SpeechLang, voices: VoiceLike[]): VoiceLike[] {
  return voices
    .filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(lang))
    .sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name));
}

/** La voz elegida por el usuario si sigue instalada; si no, la de mejor calidad. */
export function pickVoice(lang: SpeechLang, voices: VoiceLike[], preferredURI?: string): VoiceLike | undefined {
  const list = voicesFor(lang, voices);
  return list.find((v) => v.voiceURI === preferredURI) ?? list[0];
}

export function qualityLabel(v: VoiceLike): string {
  const s = voiceScore(v);
  if (s >= 100) return 'Premium';
  if (s >= 50) return 'Mejorada';
  if (s < 0) return 'Básica';
  return 'Estándar';
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Lista de voces; en Safari llega con retraso (evento voiceschanged). */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!canSpeak()) return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

export interface SpeakOptions {
  voiceEs?: string;
  voiceEn?: string;
  rate?: number;
  lang?: SpeechLang;
}

export async function speak(text: string, opts: SpeakOptions = {}, onEnd?: () => void): Promise<void> {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const lang = opts.lang ?? guessLang(text);
  const voices = await loadVoices();
  const chosen = pickVoice(lang, voices, lang === 'en' ? opts.voiceEn : opts.voiceEs);
  const u = new SpeechSynthesisUtterance(text);
  u.lang = chosen?.lang ?? (lang === 'en' ? 'en-US' : 'es-ES');
  const voice = voices.find((v) => v.voiceURI === chosen?.voiceURI);
  if (voice) u.voice = voice;
  u.rate = opts.rate ?? 1;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}
