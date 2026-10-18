import { parseCloze } from '../lib/mastery';

/** Texto cloze: los huecos se muestran como […] o resaltados al revelar. */
export function ClozeText({ text, revealed }: { text: string; revealed: boolean }) {
  return (
    <span>
      {parseCloze(text).map((p, i) =>
        p.hidden ? (
          <span key={i} className={`cloze${revealed ? ' shown' : ''}`}>
            {revealed ? p.text : '[…]'}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}
