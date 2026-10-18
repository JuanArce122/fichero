import { describe, expect, it } from 'vitest';
import { cleanText } from './text';

describe('cleanText', () => {
  it('une líneas cortadas y guiones de fin de línea', () => {
    expect(cleanText('La percepci-\nón del ca-\nmino se convierte\nen el camino.')).toBe(
      'La percepción del camino se convierte en el camino.',
    );
  });

  it('conserva los párrafos', () => {
    expect(cleanText('Uno\ndos.\n\nTres.')).toBe('Uno dos.\n\nTres.');
  });

  it('normaliza espacios', () => {
    expect(cleanText('  a   b \r\n')).toBe('a b');
  });
});

describe('normalize', () => {
  it('ignora mayúsculas y acentos', async () => {
    const { normalize } = await import('./text');
    expect(normalize('Percepción ÁRBOL')).toBe('percepcion arbol');
  });
});

describe('guessLang (speech)', () => {
  it('distingue español e inglés', async () => {
    const { guessLang } = await import('./speech');
    expect(guessLang('The obstacle is the way and what stands in the way becomes the way')).toBe('en');
    expect(guessLang('Lo que se interpone en el camino se convierte en el camino')).toBe('es');
  });
});

describe('selección de tramo', () => {
  it('toma el texto entre dos palabras en cualquier orden', async () => {
    const { words, sliceTokens } = await import('./text');
    const t = words('Capítulo 1 Lo que impide la acción hace avanzar la acción. Fin');
    const i = t.indexOf('Lo');
    const j = t.indexOf('acción.');
    expect(sliceTokens(t, i, j)).toBe('Lo que impide la acción hace avanzar la acción.');
    expect(sliceTokens(t, j, i)).toBe('Lo que impide la acción hace avanzar la acción.');
  });
});

