import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { CustomerVoucher } from './models/customer.js';
import { bootstrapAdmin, initializeCustomerIndexes } from './services/customerRepository.js';

export async function seedCustomerDemo() {
  const now = new Date();
  const common = {
    minOrder: 149000,
    maxDiscount: 30000,
    startsAt: now,
    expiresAt: new Date(now.getTime() + 90 * 86400000),
    totalLimit: 1000,
    perUserLimit: 1,
    active: true,
  };
  for (const voucher of [
    {
      ...common,
      code: 'HATHANHVI10',
      name: 'Chào Hà Thành Vị — giảm 10%',
      type: 'percent',
      value: 10,
      distribution: 'code',
    },
    {
      ...common,
      code: 'QUAHANOI20',
      name: 'Quà Hà Nội — giảm 20.000đ',
      type: 'fixed',
      value: 20000,
      distribution: 'automatic',
    },
  ])
    await CustomerVoucher.updateOne(
      { code: voucher.code },
      { $setOnInsert: voucher },
      { upsert: true },
    );
}

async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('seed:demo chỉ dành cho môi trường phát triển; production dùng init:admin.');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI cần được cấu hình để seed voucher.');
  await connectDatabase(process.env.MONGODB_URI);
  try {
    await initializeCustomerIndexes();
    await bootstrapAdmin();
    await seedCustomerDemo();
    console.log('Đã khởi tạo voucher demo và tài khoản admin nếu có cấu hình.');
  } finally {
    await disconnectDatabase();
  }
}
if (/\/seedCustomerDemo\.(ts|js)$/.test(process.argv[1]?.replace(/\\/g, '/') ?? ''))
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Không thể seed demo.');
    process.exitCode = 1;
  });
