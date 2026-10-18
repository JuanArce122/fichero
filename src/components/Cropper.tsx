import { useRef, type PointerEvent } from 'react';
import type { Crop } from '../lib/image';

/** Recorte en fracciones (0..1) de la imagen. */
export interface CropFrac {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_CROP: CropFrac = { x: 0, y: 0, w: 1, h: 1 };
const MIN = 0.05;

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

export function toPixels(c: CropFrac, width: number, height: number): Crop {
  return {
    x: Math.round(c.x * width),
    y: Math.round(c.y * height),
    width: Math.max(1, Math.round(c.w * width)),
    height: Math.max(1, Math.round(c.h * height)),
  };
}

/** Selector de zona: arrastra las esquinas o mueve el recuadro. */
export function Cropper({ src, crop, onChange }: { src: string; crop: CropFrac; onChange: (c: CropFrac) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: Handle; startX: number; startY: number; start: CropFrac } | null>(null);

  const begin = (handle: Handle) => (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { handle, startX: e.clientX, startY: e.clientY, start: crop };
  };

  const move = (e: PointerEvent) => {
    const d = drag.current;
    const rect = box.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const dx = (e.clientX - d.startX) / rect.width;
    const dy = (e.clientY - d.startY) / rect.height;
    let { x, y, w, h } = d.start;
    const right = x + w;
    const bottom = y + h;
    if (d.handle === 'move') {
      x = clamp(x + dx, 0, 1 - w);
      y = clamp(y + dy, 0, 1 - h);
    } else {
      if (d.handle.includes('w')) x = clamp(x + dx, 0, right - MIN);
      if (d.handle.includes('n')) y = clamp(y + dy, 0, bottom - MIN);
      const r = d.handle.includes('e') ? clamp(right + dx, x + MIN, 1) : right;
      const b = d.handle.includes('s') ? clamp(bottom + dy, y + MIN, 1) : bottom;
      w = r - x;
      h = b - y;
    }
    onChange({ x, y, w, h });
  };

  const end = () => {
    drag.current = null;
  };

  const pct = (n: number) => `${n * 100}%`;
  return (
    <div ref={box} className="cropper" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <img src={src} alt="Página" draggable={false} />
      <div
        className="crop-box"
        style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }}
        onPointerDown={begin('move')}
      >
        {(['nw', 'ne', 'sw', 'se'] as const).map((h) => (
          <span key={h} className={`crop-handle ${h}`} onPointerDown={begin(h)} />
        ))}
      </div>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
