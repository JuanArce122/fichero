import { describe, expect, it } from 'vitest';
import { pickVoice, qualityLabel, voicesFor, type VoiceLike } from './speech';

const v = (name: string, lang: string): VoiceLike => ({ name, lang, voiceURI: `uri:${name}`, localService: true });
const voices = [
  v('Mónica', 'es-ES'),
  v('Mónica (Mejorada)', 'es-ES'),
  v('Paulina (Premium)', 'es-MX'),
  v('Jorge (Compact)', 'es-ES'),
  v('Albert', 'en-US'),
  v('Samantha', 'en-US'),
  v('Ava (Enhanced)', 'en-US'),
  v('Thomas', 'fr-FR'),
];

describe('voces', () => {
  it('ordena por calidad y filtra por idioma', () => {
    expect(voicesFor('es', voices).map((x) => x.name)).toEqual([
      'Paulina (Premium)',
      'Mónica (Mejorada)',
      'Mónica',
      'Jorge (Compact)',
    ]);
    expect(voicesFor('en', voices)[0].name).toBe('Ava (Enhanced)');
    expect(voicesFor('en', voices).at(-1)!.name).toBe('Albert');
  });

  it('respeta la voz elegida si sigue instalada', () => {
    expect(pickVoice('es', voices, 'uri:Mónica')!.name).toBe('Mónica');
    expect(pickVoice('es', voices, 'uri:borrada')!.name).toBe('Paulina (Premium)');
    expect(pickVoice('es', [])).toBeUndefined();
  });

  it('etiqueta la calidad', () => {
    expect(qualityLabel(v('Paulina (Premium)', 'es-MX'))).toBe('Premium');
    expect(qualityLabel(v('Ava (Enhanced)', 'en-US'))).toBe('Mejorada');
    expect(qualityLabel(v('Samantha', 'en-US'))).toBe('Estándar');
    expect(qualityLabel(v('Albert', 'en-US'))).toBe('Básica');
  });
});
