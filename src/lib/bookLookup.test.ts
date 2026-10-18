import { describe, expect, it } from 'vitest';
import { isIsbn, parseSearch } from './bookLookup';

describe('Open Library', () => {
  it('normaliza y deduplica resultados', () => {
    const r = parseSearch({
      docs: [
        { title: 'The Obstacle Is the Way', author_name: ['Ryan Holiday'], first_publish_year: 2014, cover_i: 1 },
        { title: 'The obstacle is the way', author_name: ['Ryan Holiday'] },
        { title: 'Ego Is the Enemy', author_name: ['Ryan Holiday', 'Otro', 'Tercero'] },
        { author_name: ['Sin título'] },
      ],
    });
    expect(r).toEqual([
      { title: 'The Obstacle Is the Way', author: 'Ryan Holiday', year: 2014, coverId: 1 },
      { title: 'Ego Is the Enemy', author: 'Ryan Holiday, Otro', year: undefined, coverId: undefined },
    ]);
  });

  it('reconoce ISBN-10 e ISBN-13', () => {
    expect(isIsbn('978-1-59184-635-2')).toBe(true);
    expect(isIsbn('159184635X')).toBe(true);
    expect(isIsbn('el obstáculo')).toBe(false);
  });
});
