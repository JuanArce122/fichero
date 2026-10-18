// OCR local con Tesseract.js. El motor y los idiomas se sirven desde el propio
// sitio (public/ocr, copiados por scripts/copy-ocr.mjs) y el service worker los
// guarda en caché: funciona sin conexión y nada sale del dispositivo.

import type { Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;
let progressListener: ((p: number, status: string) => void) | null = null;

function assetUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}ocr/${path}`, window.location.href).href;
}

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import('tesseract.js');
      return createWorker(['spa', 'eng'], OEM.LSTM_ONLY, {
        workerPath: assetUrl('worker.min.js'),
        corePath: assetUrl(''),
        langPath: assetUrl('lang'),
        gzip: true,
        workerBlobURL: false,
        // El service worker ya guarda los idiomas; evitamos duplicarlos en IndexedDB.
        cacheMethod: 'none',
        logger: (m: { status: string; progress: number }) => progressListener?.(m.progress, m.status),
      });
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

const STATUS_ES: Record<string, string> = {
  'loading tesseract core': 'Cargando motor…',
  'initializing tesseract': 'Iniciando…',
  'loading language traineddata': 'Cargando idiomas…',
  'initializing api': 'Preparando…',
  'recognizing text': 'Reconociendo texto…',
};

export async function recognize(
  image: Blob,
  onProgress?: (progress: number, status: string) => void,
): Promise<string> {
  progressListener = (p, s) => onProgress?.(p, STATUS_ES[s] ?? s);
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    progressListener = null;
  }
}
