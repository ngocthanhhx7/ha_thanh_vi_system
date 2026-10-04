import mongoose from 'mongoose';
import { loadSeedContent } from './utils/contentSeed.js';
import { readConfig } from './config/env.js';
import { MongoRepository } from './services/contentRepository.js';

async function seed() {
  const config = readConfig();
  if (!config.mongoUri) throw new Error('Cần cấu hình MONGODB_URI để seed nội dung.');
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10_000 });
  try {
    await new MongoRepository().seedIfAbsent(loadSeedContent());
    console.log('Đã đảm bảo nội dung seed tồn tại; dữ liệu hiện có không bị ghi đè.');
  } finally {
    await mongoose.disconnect();
  }
}

seed().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Lỗi seed không xác định.';
  console.error(`Không thể seed nội dung: ${message}`);
  process.exitCode = 1;
});
