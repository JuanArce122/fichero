// Lectura en voz alta con las voces del sistema (Web Speech API). Funciona sin
// conexión en iOS y macOS; no es IA generativa, solo síntesis de voz local.

const EN_WORDS = /\b(the|and|is|of|to|that|you|what|in|it|your|are|for|with|not)\b/gi;
const ES_WORDS = /\b(el|la|que|de|y|los|las|en|es|un|una|por|con|no|lo|se|tu)\b/gi;

/** Heurística simple: ¿el texto está en inglés o en español? */
export function guessLang(text: string): 'es' | 'en' {
  const en = text.match(EN_WORDS)?.length ?? 0;
  const es = text.match(ES_WORDS)?.length ?? 0;
  return en > es ? 'en' : 'es';
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text: string, onEnd?: () => void): void {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const lang = guessLang(text);
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'en' ? 'en-US' : 'es-ES';
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
  if (voice) u.voice = voice;
  u.rate = 0.95;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}
