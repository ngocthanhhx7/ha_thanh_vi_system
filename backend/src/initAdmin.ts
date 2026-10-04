import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { bootstrapAdmin, initializeCustomerIndexes } from './services/customerRepository.js';

async function main() {
  if (!process.env.MONGODB_URI || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)
    throw new Error('Lệnh khởi tạo cần MONGODB_URI, ADMIN_EMAIL và ADMIN_PASSWORD (10–128 ký tự).');
  await connectDatabase(process.env.MONGODB_URI);
  try {
    await initializeCustomerIndexes();
    await bootstrapAdmin();
    console.log(
      'Đã đảm bảo tài khoản users.role=admin tồn tại. Lệnh không thay đổi mật khẩu hoặc nâng quyền tài khoản cũ.',
    );
  } finally {
    await disconnectDatabase();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Không thể khởi tạo admin.');
  process.exitCode = 1;
});
