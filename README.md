# Fichero

App web personal para no perder lo que lees: subrayados, fichas por tema al estilo
del *commonplace book* de Ryan Holiday y Robert Greene, repaso diario ponderado y
práctica de las ideas en la vida real.

- **Sin IA generativa**: no hay modelos de lenguaje, APIs de IA, resúmenes,
  chat ni búsqueda semántica. Solo el OCR (Tesseract.js) corre en tu dispositivo.
- **Sin cuentas, sin servidor**: todo vive en IndexedDB en tu dispositivo.
- **PWA instalable y offline**, pensada para Safari en iPhone.

## Desarrollo

```bash
npm install
npm run dev        # servidor local (también accesible en tu red local)
npm test           # tests (lógica de repaso y respaldo/importación)
npm run build      # compilación de producción en dist/
npm run preview    # sirve dist/ localmente
```

Stack: React + TypeScript + Vite, Dexie (IndexedDB), vite-plugin-pwa (service
worker con Workbox), Vitest + fake-indexeddb.

### Estructura

```
src/
  db/          modelo de datos (types.ts), esquema Dexie (db.ts) y operaciones (repo.ts)
  lib/         lógica sin UI: repaso ponderado, respaldo, fechas, imágenes, compartir
  components/  piezas de UI reutilizables
  pages/       pantallas
```

## Cómo funciona el repaso diario

Cada subrayado y cada ficha tienen un **peso**:

```
peso = frecuencia del libro × frecuencia del tema × (1,5 si es favorito) × frescura
```

- Frecuencias: más = 2 · normal = 1 · menos = 0,35 · nunca = 0.
- **Frescura**: al mostrarse, cae casi a cero y se recupera linealmente durante
  el *período de recuperación* (14 días al inicio). "Lo recordaba" lo alarga
  ×1,5 (máx. 180 días) y "No lo recordaba" lo acorta a la mitad (mín. 3 días).
- Cada día se sortean N elementos con un muestreo ponderado sin reemplazo, así
  nada se repite seguido y con el tiempo todo va saliendo. La sesión del día
  queda guardada: si cierras la app, continúas donde ibas.

La lógica está en `src/lib/review.ts` y sus tests en `src/lib/review.test.ts`.

## Respaldo

El respaldo es un JSON versionado:

```json
{
  "format": "fichero-backup",
  "schemaVersion": 1,
  "exportedAt": "2026-10-18T12:00:00.000Z",
  "includesImages": false,
  "tables": { "books": [], "chapters": [], "highlights": [], "cards": [], "...": [] }
}
```

- **Exportar**: en iPhone/iPad se abre la hoja de compartir → *Guardar en
  Archivos* → *iCloud Drive*. En Mac se descarga.
- **Importar**: en *Ajustes → Respaldo e importación*. Muestra una vista previa
  y, si el dispositivo ya tiene datos, avisa que se **reemplazará todo**. La
  importación es atómica: si falla, no se toca nada.
- Las fotos pueden excluirse para que el archivo pese poco. Si importas un
  respaldo sin fotos, se conservan las fotos locales que el respaldo siga
  usando.
- Si el esquema cambia, se sube `SCHEMA_VERSION` y se agrega una migración en
  `MIGRATIONS` (`src/lib/backup.ts`) para que los respaldos antiguos se sigan
  pudiendo importar.

## Safari en iOS y el riesgo de perder datos

Safari puede borrar los datos de un sitio web (IndexedDB incluido) en estos casos:

1. **Política de 7 días**: si usas un sitio *en la pestaña de Safari* y no lo
   abres en 7 días de uso del navegador, Safari puede borrar sus datos.
   **Las apps agregadas a la pantalla de inicio están exentas**: tienen su
   propio almacenamiento y su propio contador de uso.
2. **Falta de espacio** en el dispositivo: el sistema puede liberar
   almacenamiento de sitios web. La app pide `navigator.storage.persist()`, lo
   que reduce este riesgo (en *Ajustes* ves si se concedió).
3. **Acciones tuyas**: borrar la app de la pantalla de inicio, o *Ajustes →
   Safari → Borrar historial y datos de sitios web*, elimina los datos.

Cómo minimizar el riesgo:

- **Usa siempre la app desde la pantalla de inicio**, nunca desde la pestaña
  de Safari. Ojo: los datos de la app instalada y los de la pestaña de Safari
  son **independientes**.
- **Respalda con frecuencia** en iCloud Drive. La app te avisa cuando pasan
  más de N días (7 por defecto) sin respaldo, con un botón para hacerlo en un
  toque.
- Antes de borrar el ícono de la pantalla de inicio o cambiar de iPhone, haz
  un respaldo.
- Mantén espacio libre en el iPhone.

## Publicación

Se publica en GitHub Pages con el workflow `.github/workflows/deploy.yml` (tests,
compilación y despliegue en cada push a `main`). La guía paso a paso estará al
final del proyecto.
