import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { SiteContent } from './validators/content.js';
import type { AppConfig } from './config/env.js';
import type { ContentRepository } from './services/contentRepository.js';
import type { OrderRepository } from './services/orderRepository.js';
import { UnavailableOrderRepository } from './services/unavailableOrderRepository.js';
import { createAdminAuth } from './middlewares/adminAuth.js';
import { createCommerceRouter } from './routes/commerceRoutes.js';
import { createContentRouter } from './routes/contentRoutes.js';
import { contentControllers } from './controllers/contentController.js';
import { CommerceService } from './services/commerceService.js';
import { PayOsHttpClient } from './services/payOsService.js';
import { createErrorHandler } from './middlewares/errorHandler.js';
import { ContentService } from './services/contentService.js';
import { ContactService } from './services/contactService.js';
import { createCustomerModule } from './routes/customerRoutes.js';
import { createCommerceCustomerOrderGateway } from './services/customerOrderGateway.js';
import { CustomerError } from './utils/customerSecurity.js';

export type AppDependencies = {
  repository: ContentRepository & { orderRepository?: OrderRepository };
  config: Pick<AppConfig, 'frontendOrigin' | 'isDevelopment'> & Partial<AppConfig>;
  seedContent: SiteContent;
  commerce?: CommerceService;
  paymentFetcher?: typeof fetch;
};

export function createApp({
  repository,
  config,
  seedContent,
  commerce,
  paymentFetcher,
}: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  const allowedOrigins = new Set([config.frontendOrigin]);
  if (config.isDevelopment) {
    allowedOrigins.add('http://127.0.0.1:5173');
    allowedOrigins.add('http://localhost:5173');
  }
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) callback(null, true);
        else callback(new CustomerError(403, 'Nguồn yêu cầu không được phép.'));
      },
      credentials: true,
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Idempotency-Key',
        'X-Order-Token',
        'X-Requested-With',
      ],
    }),
  );
  app.use(express.json({ limit: '64kb', strict: true }));

  const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.' },
  });
  const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Quá nhiều yêu cầu CMS. Vui lòng thử lại sau.' },
  });
  const adminAuth = createAdminAuth();
  const payOsSettings = {
    enabled: config.paymentsEnabled ?? false,
    clientId: config.payOsClientId,
    apiKey: config.payOsApiKey,
    checksumKey: config.payOsChecksumKey,
    publicWebUrl: config.publicWebUrl ?? config.frontendOrigin,
  };
  const commerceService =
    commerce ??
    new CommerceService(
      repository.orderRepository ?? new UnavailableOrderRepository(),
      repository,
      {
        paymentsEnabled: payOsSettings.enabled,
        payOsClientId: payOsSettings.clientId,
        payOsApiKey: payOsSettings.apiKey,
        payOsChecksumKey: payOsSettings.checksumKey,
        publicWebUrl: payOsSettings.publicWebUrl,
        shippingFee: config.shippingFee ?? 30_000,
        freeShippingThreshold: config.freeShippingThreshold ?? 499_000,
        orderTokenSecret: config.orderTokenSecret ?? process.env.ORDER_TOKEN_SECRET,
      },
      new PayOsHttpClient(payOsSettings, paymentFetcher),
    );
  app.locals.commerce = commerceService;
  const customers = createCustomerModule({
    orders: createCommerceCustomerOrderGateway(commerceService),
    content: repository,
    allowedOrigins,
    isDevelopment: config.isDevelopment,
  });
  commerceService.setVoucherRepository(customers.repository);
  app.use('/api', customers.middleware, customers.csrf);
  app.use('/api', customers.router);

  const contentService = new ContentService(repository, seedContent);
  const contactService = new ContactService(repository);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', storage: repository.storage });
  });

  const contentHandlers = contentControllers(contentService, contactService);
  app.use(
    '/api',
    createContentRouter({
      ...contentHandlers,
      adminAuth,
      adminLimiter,
      publicLimiter,
    }),
  );

  app.use(
    '/api',
    createCommerceRouter({
      service: commerceService,
      checksumKey: config.payOsChecksumKey,
      publicLimiter,
      adminLimiter,
    }),
  );

  const errorHandler: ErrorRequestHandler = createErrorHandler(repository);
  app.use(errorHandler);
  return app;
}
