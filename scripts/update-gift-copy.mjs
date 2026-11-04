// Run from /app in the API container, after copying this script there.
// Dry run by default; --apply requires an exclusive backup file path.
import mongoose from 'mongoose';
import { writeFile } from 'node:fs/promises';
import { readConfig } from '../backend/dist/config/env.js';
import { MongoRepository } from '../backend/dist/services/contentRepository.js';
import { contentSchema } from '../backend/dist/validators/content.js';

const apply = process.argv[2] === '--apply';
const backup = process.argv[3];
if (apply && !backup) throw new Error('Supply an exclusive catalog backup path.');

try {
  await mongoose.connect(readConfig().mongoUri);
  const repository = new MongoRepository();
  const current = await repository.getContent();
  if (!current) throw new Error('Expected an existing catalog.');
  const weights = {
    'set-qua-thuong': 'Hộp mix vị 300g, 01 hộp trà sen',
    'set-qua-cao-cap': 'Hộp mix vị 300g, 01 hộp trà sen (02 búp trà), đĩa sứ cao cấp',
  };
  for (const [id, weight] of Object.entries(weights)) {
    const product = current.products.find((item) => item.id === id);
    if (!product) throw new Error(`Missing product: ${id}`);
    if (!['Đang xác nhận khối lượng set', weight].includes(product.weight))
      throw new Error(`Weight changed since review: ${id}`);
  }
  const updated = contentSchema.parse({
    ...current,
    products: current.products.map((product) => ({
      ...product,
      ...(weights[product.id] ? { weight: weights[product.id] } : {}),
      description: product.description.replace(/set quà thường/gi, 'Set quà tiêu chuẩn'),
      ...(product.packaging
        ? { packaging: product.packaging.replace(/set quà thường/gi, 'Set quà tiêu chuẩn') }
        : {}),
    })),
  });
  if (apply) {
    await writeFile(backup, JSON.stringify(current), { mode: 0o600, flag: 'wx' });
    if (!(await repository.saveContentIfCurrent(updated, current)))
      throw new Error('Concurrent catalog update; nothing written. Review again.');
  }
  console.log(JSON.stringify({ applied: apply, products: Object.keys(weights) }));
} finally {
  await mongoose.disconnect();
}
