import { useRef, useState, type PointerEvent, type ReactNode } from 'react';

const THRESHOLD = 90;

/**
 * Tarjeta deslizable: → derecha y ← izquierda disparan una acción (como Tinder
 * o Readwise). Muestra una etiqueta que aparece al arrastrar para que el
 * resultado sea predecible antes de soltar.
 */
export function SwipeCard({
  enabled,
  onSwipe,
  leftLabel,
  rightLabel,
  children,
}: {
  enabled: boolean;
  onSwipe: (dir: 'left' | 'right') => void;
  leftLabel: string;
  rightLabel: string;
  children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<'left' | 'right' | null>(null);
  const start = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null);

  const down = (e: PointerEvent) => {
    if (!enabled || leaving) return;
    // No secuestramos toques sobre controles.
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null };
  };

  const move = (e: PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    // Decidimos la dirección al primer movimiento claro, para no bloquear el scroll vertical.
    if (s.horizontal === null && Math.hypot(mx, my) > 8) {
      s.horizontal = Math.abs(mx) > Math.abs(my);
      if (s.horizontal) (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }
    if (s.horizontal) setDx(mx);
  };

  const up = () => {
    const s = start.current;
    start.current = null;
    if (!s?.horizontal) return;
    if (Math.abs(dx) >= THRESHOLD) {
      const dir = dx > 0 ? 'right' : 'left';
      setLeaving(dir);
      window.setTimeout(() => {
        onSwipe(dir);
        setLeaving(null);
        setDx(0);
      }, 160);
    } else {
      setDx(0);
    }
  };

  const offset = leaving ? (leaving === 'right' ? 1 : -1) * window.innerWidth : dx;
  const progress = Math.min(1, Math.abs(dx) / THRESHOLD);
  const dragging = start.current?.horizontal && !leaving;

  return (
    <div
      className="swipe"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      style={{ touchAction: enabled ? 'pan-y' : 'auto' }}
    >
      <div
        className="swipe-inner"
        style={{
          transform: `translateX(${offset}px) rotate(${offset / 40}deg)`,
          transition: dragging ? 'none' : 'transform 0.18s ease',
        }}
      >
        {enabled && dx !== 0 && (
          <span className={`swipe-label ${dx > 0 ? 'right' : 'left'}`} style={{ opacity: progress }}>
            {dx > 0 ? rightLabel : leftLabel}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}
