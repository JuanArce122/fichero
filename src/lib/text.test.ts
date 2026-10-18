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
