import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { ServiceError } from './errors.js';

export const uploadDirectory = fileURLToPath(new URL('../../uploads/', import.meta.url));
export async function saveProductImage(input: Buffer, directory = uploadDirectory) {
  if (!input.length || input.length > 5 * 1024 * 1024)
    throw new ServiceError(413, 'Ảnh phải nhỏ hơn 5 MB.');
  let output: Buffer;
  try {
    const image = sharp(input, {
      limitInputPixels: 20_000_000,
      animated: false,
      failOn: 'warning',
    });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages ?? 1) > 1)
      throw new Error('Unsupported image');
    output = await image
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new ServiceError(
      400,
      'Chỉ nhận ảnh JPEG, PNG hoặc WebP hợp lệ, tối đa 20 triệu điểm ảnh.',
    );
  }
  const metadata = await sharp(output).metadata();
  await mkdir(directory, { recursive: true });
  const filename = randomUUID() + '.webp';
  await writeFile(resolve(directory, filename), output, { flag: 'wx' });
  return { url: '/uploads/' + filename, width: metadata.width, height: metadata.height };
}
