import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { loadSeedContent } from './utils/contentSeed.js';
import { readConfig } from './config/env.js';
import { demoAuthOptions } from './config/demoAuth.js';
import { startPaymentReconciliationJob } from './jobs/paymentReconciliation.js';
import { MongoRepository, type ContentRepository } from './services/contentRepository.js';
import { initializeCustomerIndexes } from './services/customerRepository.js';
import type { OrderRepository } from './services/orderRepository.js';
import { UnavailableOrderRepository } from './services/unavailableOrderRepository.js';
import type { SiteContent } from './validators/content.js';
import { attachChatRealtime } from './services/chatRealtime.js';
import { migrateIngredientCatalog } from './services/ingredientMigration.js';

async function start() {
  const config = readConfig();
  const seedContent = loadSeedContent();
  const repository = new MongoRepository();
  if (config.mongoUri) {
    try {
      await connectDatabase(config.mongoUri);
      await repository.seedIfAbsent(seedContent);
      await migrateIngredientCatalog(repository, seedContent);
      await initializeCustomerIndexes();
    } catch {
      await disconnectDatabase().catch(() => undefined);
      throw new Error(
        'Không thể kết nối hoặc khởi tạo MongoDB. Kiểm tra MONGODB_URI và trạng thái cơ sở dữ liệu.',
      );
    }
  } else {
    console.warn(
      'MONGODB_URI chưa được cấu hình: đang chạy chế độ demo chỉ đọc; đơn hàng, liên hệ và CMS không ghi dữ liệu.',
    );
  }

  const activeRepository: ContentRepository & { orderRepository?: OrderRepository } =
    config.mongoUri ? repository : new ReadOnlyDemoRepository(seedContent);
  const app = createApp({
    repository: activeRepository,
    config,
    seedContent,
    auth: demoAuthOptions(config),
  });
  const reconciliation = config.mongoUri
    ? startPaymentReconciliationJob(app.locals.commerce, {
        onError: () => console.error('Payment reconciliation job failed.'),
      })
    : undefined;
  const server = app.listen(config.port, () => {
    console.log(`Ha Thanh Vi API listening on port ${config.port}`);
  });
  const realtime = attachChatRealtime(server, app.locals.chatRealtime);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    reconciliation?.stop();
    realtime.disconnectSockets(true);
    server.close(async () => {
      await disconnectDatabase().catch(() => undefined);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

class ReadOnlyDemoRepository implements ContentRepository {
  readonly storage = 'demo-read-only';
  readonly available = false;
  readonly orderRepository: OrderRepository = new UnavailableOrderRepository();

  constructor(private readonly seedContent: SiteContent) {}

  async getContent() {
    return this.seedContent;
  }
  async saveContent(): Promise<never> {
    throw new Error('Chế độ demo không hỗ trợ ghi nội dung.');
  }
  async createContact(): Promise<never> {
    throw new Error('Chế độ demo không lưu liên hệ.');
  }
}

start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Lỗi khởi động không xác định.';
  console.error(`Không thể khởi động API: ${message}`);
  process.exitCode = 1;
});
