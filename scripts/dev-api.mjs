import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const privateDir = resolve(root, '.local');
await mkdir(resolve(privateDir, 'mongodb'), { recursive: true });
const emptyConfigPath = resolve(privateDir, 'empty-config.env');
await writeFile(emptyConfigPath, '');
let secrets;
try {
  secrets = JSON.parse(await readFile(resolve(privateDir, 'preview-secrets.json'), 'utf8'));
} catch {
  secrets = {
    adminEmail: 'thanhnnhe186491@fpt.edu.vn',
    adminPassword: randomBytes(18).toString('base64url'),
    orderTokenSecret: randomBytes(32).toString('hex'),
  };
  await writeFile(resolve(privateDir, 'preview-secrets.json'), JSON.stringify(secrets, null, 2));
}
await writeFile(
  resolve(privateDir, 'preview-credentials.txt'),
  `Hà Thành Vị — tài khoản xem thử cục bộ\nTrang đăng nhập: http://127.0.0.1:5173/tai-khoan\nEmail admin: ${secrets.adminEmail}\nMật khẩu: ${secrets.adminPassword}\nChỉ dành cho môi trường phát triển. Không dùng để triển khai.\n`,
);
const mongo = await MongoMemoryServer.create({
  instance: {
    port: 27018,
    dbPath: resolve(privateDir, 'mongodb'),
    storageEngine: 'wiredTiger',
    dbName: 'ha_thanh_vi_demo',
    ip: '127.0.0.1',
  },
});
const runtimeEnv = {
  ...process.env,
  DOTENV_CONFIG_PATH: emptyConfigPath,
  HTV_DEMO_MAILBOX: '1',
  GEMINI_API_KEY: '',
  SMTP_HOST: '',
  SMTP_USER: '',
  SMTP_PASS: '',
  NODE_ENV: 'development',
  MONGODB_URI: mongo.getUri('ha_thanh_vi_demo'),
  FRONTEND_ORIGIN: 'http://127.0.0.1:5173',
  PUBLIC_WEB_URL: 'http://127.0.0.1:5173',
  ORDER_TOKEN_SECRET: secrets.orderTokenSecret,
  PAYMENTS_ENABLED: 'false',
};
delete runtimeEnv.ADMIN_EMAIL;
delete runtimeEnv.ADMIN_PASSWORD;
delete runtimeEnv.ADMIN_TOKEN;
delete runtimeEnv.ADMIN_NAME;
delete runtimeEnv.ADMIN_PHONE;
const seedCode = await new Promise((resolveExit, reject) => {
  const seed = spawn(
    process.execPath,
    [
      resolve(root, 'node_modules/tsx/dist/cli.mjs'),
      resolve(root, 'backend/src/seedCustomerDemo.ts'),
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...runtimeEnv,
        ADMIN_EMAIL: secrets.adminEmail,
        ADMIN_PASSWORD: secrets.adminPassword,
        ADMIN_NAME: 'Ngọc Thành',
        ADMIN_PHONE: '0900000000',
      },
    },
  );
  seed.once('error', reject);
  seed.once('exit', resolveExit);
});
if (seedCode !== 0) {
  await mongo.stop();
  throw new Error('Không thể khởi tạo dữ liệu xem thử.');
}
const api = spawn(
  process.execPath,
  [resolve(root, 'node_modules/tsx/dist/cli.mjs'), resolve(root, 'backend/src/server.ts')],
  {
    cwd: root,
    stdio: 'inherit',
    env: runtimeEnv,
  },
);
console.log(
  'MongoDB phát triển đã sẵn sàng. Tài khoản xem thử lưu tại .local/preview-credentials.txt.',
);
console.log(
  'Email xác thực xem thử được lưu riêng tại .local/preview-mailbox; không gửi email thật.',
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  api.kill('SIGTERM');
  await mongo.stop();
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
api.once('exit', async (code) => {
  await stop();
  process.exitCode = code || 0;
});
