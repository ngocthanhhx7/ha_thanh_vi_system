import sharp from 'sharp';
import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const brand = fileURLToPath(new URL('../frontend/public/brand/', import.meta.url));
const jobs = [
  // Keep the full brand originals; these derivatives are sized for public UI surfaces.
  { source: 'pattern.webp', target: 'pattern-optimized.webp', width: 360, alphaQuality: 70 },
  ...[640, 960, 1280].map((width) => ({
    source: 'pastry.webp',
    target: `pastry-${width}.webp`,
    width,
  })),
  {
    source: 'game/cards/card-back.webp',
    target: 'game/cards/card-back-launcher.webp',
    width: 96,
  },
];

for (const { source, target, width, alphaQuality = 100 } of jobs) {
  const destination = join(brand, target);
  await mkdir(dirname(destination), { recursive: true });
  await sharp(join(brand, source))
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality, effort: 6 })
    .toFile(destination);
  const before = (await stat(join(brand, source))).size;
  const after = (await stat(destination)).size;
  console.log(`${target}: ${before} -> ${after} bytes`);
}
