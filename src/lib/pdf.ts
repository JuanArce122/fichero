// PDF imprimible de fichas en tamaño 4x6 pulgadas (horizontal, como una tarjeta
// de índice). Se genera en el dispositivo con jsPDF, una ficha por página; si
// una ficha no cabe ni reduciendo la letra, continúa en otra tarjeta.

import { jsPDF } from 'jspdf';
import type { Card } from '../db/types';
import type { ExportData } from './exporters';

const W = 432; // 6 in en puntos
const H = 288; // 4 in
const M = 24; // margen
const ACCENT: [number, number, number] = [155, 58, 36];
const MUTED: [number, number, number] = [110, 101, 90];

type Font = 'times' | 'helvetica';
type Style = 'normal' | 'bold' | 'italic';

interface Block {
  text: string;
  font: Font;
  style: Style;
  size: number;
  color?: [number, number, number];
  gapBefore: number;
}

/** jsPDF con fuentes estándar usa WinAnsi: quitamos lo que no puede dibujar (p. ej. emojis). */
export function toWinAnsi(text: string): string {
  const extras = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  return [...text.normalize('NFC')]
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (ch === '\n' || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || extras.includes(ch)) return ch;
      return '';
    })
    .join('');
}

function cardBlocks(c: Card, d: ExportData): { blocks: Block[]; topic: string; footer: string } {
  const blocks: Block[] = [{ text: c.idea, font: 'times', style: 'normal', size: 14, gapBefore: 0 }];
  if (c.quote) blocks.push({ text: `“${c.quote}”`, font: 'times', style: 'italic', size: 11, color: MUTED, gapBefore: 9 });
  if (c.application) {
    blocks.push({ text: 'CÓMO LO APLICO', font: 'helvetica', style: 'bold', size: 7, color: MUTED, gapBefore: 10 });
    blocks.push({ text: c.application, font: 'helvetica', style: 'normal', size: 10, gapBefore: 3 });
  }
  if (c.note) {
    blocks.push({ text: 'MI NOTA', font: 'helvetica', style: 'bold', size: 7, color: MUTED, gapBefore: 10 });
    blocks.push({ text: c.note, font: 'helvetica', style: 'normal', size: 10, gapBefore: 3 });
  }
  const footer = [
    c.bookId ? d.books.get(c.bookId)?.title : undefined,
    c.bookId ? d.books.get(c.bookId)?.author : undefined,
    c.chapterId ? d.chapters.get(c.chapterId)?.title : undefined,
    c.page ? `p. ${c.page}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  return { blocks, topic: d.topics.get(c.topicId)?.name ?? 'Sin tema', footer };
}

interface Line {
  text: string;
  font: Font;
  style: Style;
  size: number;
  color?: [number, number, number];
  y: number; // relativo al inicio del cuerpo
  height: number;
}

function layout(doc: jsPDF, blocks: Block[], scale: number, width: number): Line[] {
  const lines: Line[] = [];
  let y = 0;
  for (const b of blocks) {
    const size = b.size * scale;
    doc.setFont(b.font, b.style);
    doc.setFontSize(size);
    y += b.gapBefore * scale;
    const wrapped: string[] = doc.splitTextToSize(toWinAnsi(b.text), width);
    for (const t of wrapped) {
      const height = size * 1.3;
      lines.push({ text: t, font: b.font, style: b.style, size, color: b.color, y, height });
      y += height;
    }
  }
  return lines;
}

function drawFrame(doc: jsPDF, topic: string, footer: string, cont: boolean) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...ACCENT);
  doc.text(toWinAnsi(topic.toUpperCase() + (cont ? '  (cont.)' : '')), M, M + 8, { charSpace: 1 });
  doc.setDrawColor(201, 134, 122);
  doc.setLineWidth(0.8);
  doc.line(M, M + 15, W - M, M + 15);
  if (footer) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    const f = doc.splitTextToSize(toWinAnsi(footer), W - 2 * M)[0];
    doc.text(f, M, H - M + 6);
  }
}

/** Genera el PDF; devuelve el documento (para obtener Blob o ArrayBuffer). */
export function cardsPdf(cards: Card[], d: ExportData): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [H, W] });
  doc.setProperties({ title: 'Fichas', creator: 'Fichero' });
  const bodyTop = M + 30;
  const bodyHeight = H - M - 14 - bodyTop;
  const width = W - 2 * M;
  let first = true;

  for (const c of cards) {
    const { blocks, topic, footer } = cardBlocks(c, d);
    // Reducimos la letra hasta que quepa (mín. 72 %).
    let scale = 1;
    let lines = layout(doc, blocks, scale, width);
    while (scale > 0.72 && lines.length && lines[lines.length - 1].y + lines[lines.length - 1].height > bodyHeight) {
      scale -= 0.04;
      lines = layout(doc, blocks, scale, width);
    }
    // Si aún no cabe, se reparte en varias tarjetas.
    let offset = 0;
    let cont = false;
    let i = 0;
    while (i < lines.length || (i === 0 && !lines.length)) {
      if (!first) doc.addPage([H, W], 'landscape');
      first = false;
      drawFrame(doc, topic, footer, cont);
      while (i < lines.length && lines[i].y - offset + lines[i].height <= bodyHeight + 0.5) {
        const l = lines[i];
        doc.setFont(l.font, l.style);
        doc.setFontSize(l.size);
        doc.setTextColor(...(l.color ?? ([31, 27, 22] as [number, number, number])));
        doc.text(l.text, M, bodyTop + l.y - offset + l.size);
        i++;
      }
      if (i < lines.length) {
        offset = lines[i].y;
        cont = true;
      } else break;
    }
  }
  if (first) {
    // Sin fichas: una página en blanco con aviso.
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Sin fichas', M, M + 20);
  }
  return doc;
}
