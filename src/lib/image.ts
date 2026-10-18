// Compresión de fotos en el dispositivo (canvas → JPEG).

export interface CompressOptions {
  maxSize: number;
  quality: number;
}

export const PAGE_PHOTO: CompressOptions = { maxSize: 1600, quality: 0.7 };
export const COVER_PHOTO: CompressOptions = { maxSize: 600, quality: 0.75 };

export async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap respeta la orientación EXIF en Safari moderno.
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* cae al método con <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Redimensiona (y opcionalmente recorta, en píxeles de la imagen original) a JPEG. */
export async function compressImage(file: Blob, opts: CompressOptions, crop?: Crop): Promise<Blob> {
  const source = await loadBitmap(file);
  const sw = crop?.width ?? source.width;
  const sh = crop?.height ?? source.height;
  const scale = Math.min(1, opts.maxSize / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, crop?.x ?? 0, crop?.y ?? 0, sw, sh, 0, 0, w, h);
  if ('close' in source) source.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo comprimir la imagen'))), 'image/jpeg', opts.quality),
  );
}

