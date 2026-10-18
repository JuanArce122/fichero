// Genera los PNG de los íconos a partir de public/icons/icon.svg (requiere Playwright).
// Uso: node scripts/icons.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname;
const targets = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-512-maskable.png', 512, 0.1],
  ['apple-touch-icon.png', 180, 0],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of targets) {
  await page.setViewportSize({ width: size, height: size });
  const inner = size * (1 - pad * 2);
  await page.setContent(
    `<body style="margin:0;background:#9b3a24;display:grid;place-items:center;width:${size}px;height:${size}px">` +
      `<div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`,
  );
  await page.screenshot({ path: out(name), omitBackground: false });
}
await browser.close();
console.log('Íconos generados');
