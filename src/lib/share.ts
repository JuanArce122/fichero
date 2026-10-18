// Guardar archivos: hoja de compartir en iPhone/iPad (para "Guardar en Archivos"
// → iCloud Drive) y descarga normal en Mac u otros navegadores.

export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

export function isAppleTouchDevice(): boolean {
  // iPadOS se presenta como Mac; lo distinguimos por la pantalla táctil.
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export async function saveFile(file: File): Promise<SaveResult> {
  if (isAppleTouchDevice() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // Si compartir falla por otro motivo, intentamos la descarga.
    }
  }
  download(file);
  return 'downloaded';
}

export function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
