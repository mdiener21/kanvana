import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const svg = await readFile(new URL('../src/images/kanvana-logo-color-32x23.svg', import.meta.url));
const outputDir = new URL('../src/public/icons/', import.meta.url);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const [name, size, scale] of [
    ['icon-192.png', 192, 0.8],
    ['icon-512.png', 512, 0.8],
    ['icon-maskable-512.png', 512, 0.64],
    ['apple-touch-icon.png', 180, 0.8]
  ]) {
    const png = await page.evaluate(async ({ source, size, scale }) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      const width = size * scale;
      const height = width * image.naturalHeight / image.naturalWidth;
      ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      return canvas.toDataURL('image/png').split(',')[1];
    }, { source: `data:image/svg+xml;base64,${svg.toString('base64')}`, size, scale });
    await writeFile(new URL(name, outputDir), Buffer.from(png, 'base64'));
  }
} finally {
  await browser.close();
}
