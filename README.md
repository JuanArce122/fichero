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

## Decisiones de UX (inspiradas en otras apps)

| Idea | Inspiración | En Fichero |
| --- | --- | --- |
| Deslizar tarjetas, atajos de teclado, Deshacer | Readwise, Anki | → recordaba · ← no · Espacio revela · F/D/N/E/L |
| Lo nuevo primero | Readwise (primera mitad del Daily Review) | peso ×1,6 para lo nunca repasado |
| Ajustar frecuencia sin salir del repaso | Readwise | menú "···" en cada tarjeta |
| Maestría al terminar el repaso | Readwise | "Continuar con Maestría" |
| Escuchar en voz alta | Readwise | voces del sistema, sin conexión |
| Buscar el libro y su portada | Bookly, Basmo | Open Library (opcional, con conexión) |
| Elegir el pasaje tras escanear | Basmo | toca la primera y la última palabra |
| En esta fecha | Day One | Inicio: hace 1 mes, 6 meses, 1 año… |
| Bienvenida y guía de instalación | buenas prácticas de PWA en iOS | aviso en Safari con los 3 pasos |

Se descartaron, por las reglas del proyecto: rachas y estadísticas, compartir en
redes, chat o resúmenes con IA.

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

## Modo Maestría (FSRS)

Las flashcards (huecos o pregunta/respuesta) se programan con
[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), con pasos cortos
de 1 y 10 minutos: lo que olvidas vuelve dentro de la misma sesión. El estado
FSRS se guarda con fechas en milisegundos para que viaje intacto en el
respaldo. Lógica y tests en `src/lib/mastery.ts`.

## OCR local

La captura con foto usa [Tesseract.js](https://github.com/naptha/tesseract.js) en
el dispositivo, con los modelos `best_int` de español e inglés. El motor (WASM)
y los idiomas se copian a `public/ocr/` con `scripts/copy-ocr.mjs` (se ejecuta
solo antes de `dev` y `build`) y se sirven desde el propio sitio; el service
worker los guarda en caché, así que el OCR funciona sin conexión y ninguna
imagen sale del dispositivo. Pesan ~13 MB y se descargan una sola vez al
instalar la app.

Alternativa sin OCR: la cámara del iPhone reconoce texto (Texto en Vivo);
selecciónalo, cópialo y usa **Pegar** en la captura.

El OCR usa el umbral adaptativo de Tesseract (Sauvola) porque tolera sombras y
luz desigual. Se probó también un preprocesado de contraste propio y empeoraba
el resultado, así que se descartó.

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

## Búsqueda y exportaciones

- **Búsqueda** (`src/lib/search.ts`): por palabras, en subrayados, notas,
  fichas y diario. Un resultado debe contener todas las palabras; se ignoran
  mayúsculas y acentos. Filtros: tipo, libro, tema, etiqueta, fechas y
  favoritos.
- **Exportar** (*Fichas → Exportar* o *Ajustes → Exportar*):
  - **PDF 4x6** (`src/lib/pdf.ts`, jsPDF): una ficha por tarjeta de 6 × 4
    pulgadas, por tema, por libro o selección. Si una ficha no cabe, se reduce
    la letra y, si aún no cabe, continúa en otra tarjeta.
  - **Markdown** por libro o por tema, y **CSV** de subrayados o fichas
    (UTF-8 con BOM para Numbers/Excel).

Para imprimir el PDF: en el iPhone, ábrelo desde la hoja de compartir →
*Imprimir*; elige el tamaño de papel 4 × 6 in (10 × 15 cm) si tu impresora lo
admite, o imprímelo en tamaño carta con "ajustar" y recorta.

## Publicación (GitHub Pages)

La app se publica sola en cada push a `main` con
`.github/workflows/deploy.yml` (instala, corre los tests, compila con
`BASE_PATH=/<repo>/` y despliega). Configuración inicial, una sola vez:

1. Repo **público** (GitHub Pages gratis lo requiere; tus datos nunca están
   en GitHub, solo el código).
2. *Settings → Pages → Build and deployment → Source: GitHub Actions*.

URL: `https://<usuario>.github.io/<repo>/`.

Para publicar cambios propios: `git push` a `main` y espera ~1 minuto. La app
instalada muestra "Hay una versión nueva → Actualizar".

## Instalar

**iPhone / iPad** (Safari):

1. Abre la URL en **Safari** (no en Chrome ni otro navegador).
2. Toca **Compartir** (cuadrado con flecha) → **Agregar a pantalla de inicio**
   → **Agregar**. En iPad, el botón Compartir está arriba a la derecha.
3. Abre la app **siempre desde el ícono**. Ve a *Ajustes* y comprueba que
   diga "Instalada en pantalla de inicio: sí".
4. Ábrela una vez con internet para que descargue todo (incluido el OCR);
   luego funciona sin conexión.

**Mac** (Safari 17 o posterior, macOS Sonoma+): abre la URL y elige
*Archivo → Agregar al Dock*. Queda como app independiente. (En Chrome: menú
⋮ → *Transmitir, guardar y compartir → Instalar página como app*.)

**Llevar tus datos al iPad o al Mac**: en el iPhone, *Ajustes → Respaldo →
Respaldar ahora* → *Guardar en Archivos* → iCloud Drive. En el otro
dispositivo: *Ajustes → Respaldo → Elegir archivo…* → elige el respaldo →
*Importar*. Recuerda que no hay sincronización: los cambios hechos en el iPad
o el Mac no vuelven solos al iPhone.
