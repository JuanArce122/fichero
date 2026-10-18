import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Cropper, FULL_CROP, toPixels, type CropFrac } from '../components/Cropper';
import { Icon } from '../components/Icon';
import { PageHeader, useToast } from '../components/ui';
import { saveImage } from '../db/repo';
import { PAGE_PHOTO, compressImage, loadBitmap } from '../lib/image';
import { recognize } from '../lib/ocr';
import { cleanText } from '../lib/text';

/** Estado que se pasa a /capturar con el texto reconocido. */
export interface CaptureState {
  text: string;
  photoId?: string;
}

/** Foto de la página → recorte → OCR local → texto editable. */
export default function PhotoCapture() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string>();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [crop, setCrop] = useState<CropFrac>(FULL_CROP);
  const [progress, setProgress] = useState<{ p: number; status: string } | null>(null);
  const [keepPhoto, setKeepPhoto] = useState(false);

  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    setCrop({ x: 0.05, y: 0.15, w: 0.9, h: 0.4 });
    loadBitmap(file).then((b) => setSize({ width: b.width, height: b.height }));
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const run = async () => {
    if (!file) return;
    setProgress({ p: 0, status: 'Preparando…' });
    try {
      // Resolución alta para el OCR; la foto que se guarda va más comprimida.
      const cropped = await compressImage(file, { maxSize: 2400, quality: 0.9 }, toPixels(crop, size.width, size.height));
      const text = await recognize(cropped, (p, status) => setProgress({ p, status }));
      let photoId: string | undefined;
      if (keepPhoto) photoId = await saveImage('page', await compressImage(file, PAGE_PHOTO));
      const state: CaptureState = { text: cleanText(text), photoId };
      if (!state.text) toast('No se reconoció texto. Prueba a recortar mejor o con más luz.');
      navigate(`/capturar?${params.toString()}`, { state, replace: true });
    } catch (e) {
      toast(`No se pudo reconocer el texto: ${(e as Error).message}`);
      setProgress(null);
    }
  };

  const pick = (f?: File | null) => f && setFile(f);

  return (
    <div className="page">
      <PageHeader title="Foto + OCR" back />

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={libraryRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />

      {!url ? (
        <div className="stack">
          <p className="muted">
            Toma una foto de la página. Luego ajusta el recuadro sobre lo que subrayaste. El reconocimiento corre en tu
            dispositivo, en español e inglés.
          </p>
          <button className="btn primary big block" onClick={() => cameraRef.current?.click()}>
            <Icon name="camera" /> Tomar foto
          </button>
          <button className="btn block" onClick={() => libraryRef.current?.click()}>
            Elegir de Fotos
          </button>
          <p className="small muted">
            Consejo: la cámara del iPhone también reconoce texto (Texto en Vivo). Puedes seleccionarlo, copiarlo y usar
            “Pegar” en la captura.
          </p>
        </div>
      ) : (
        <div className="stack">
          <Cropper src={url} crop={crop} onChange={setCrop} />
          <p className="small muted center">Arrastra las esquinas para encuadrar solo el pasaje.</p>
          <label className="check">
            <input type="checkbox" checked={keepPhoto} onChange={(e) => setKeepPhoto(e.target.checked)} />
            <span>Guardar la foto de la página (comprimida)</span>
          </label>
          {progress ? (
            <div className="stack-sm">
              <div className="small muted">{progress.status}</div>
              <div className="progress">
                <div style={{ width: `${Math.round(progress.p * 100)}%` }} />
              </div>
            </div>
          ) : (
            <div className="stack-sm">
              <button className="btn primary big block" onClick={run} disabled={!size.width}>
                Reconocer texto
              </button>
              <div className="actions-2">
                <button className="btn" onClick={() => setCrop(FULL_CROP)}>
                  Página completa
                </button>
                <button className="btn" onClick={() => cameraRef.current?.click()}>
                  Otra foto
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
