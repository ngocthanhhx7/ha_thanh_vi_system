import { createGameRouter } from './routes/gameRoutes.js';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createHmac } from 'node:crypto';
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
import { createSmtpAuthMailer } from './services/authMail.js';
import type { AuthMailer } from './services/authMail.js';
import type { AuthOptions } from './services/customerAuthService.js';
import { ChatService } from './services/chatService.js';
import type { ChatProvider } from './services/geminiClient.js';
import { createChatRouter } from './routes/chatRoutes.js';
import { createChatHandoffRouter } from './routes/chatHandoffRoutes.js';
import { ChatHandoffService } from './services/chatHandoffService.js';
import { createAdminProductRouter } from './routes/adminProductRoutes.js';
import { createAdminIngredientRouter } from './routes/adminIngredientRoutes.js';
import { uploadDirectory } from './services/productImageService.js';
import { systemAuditMiddleware } from './middlewares/systemAudit.js';

export type AppDependencies = {
  repository: ContentRepository & { orderRepository?: OrderRepository };
  config: Pick<AppConfig, 'frontendOrigin' | 'isDevelopment'> & Partial<AppConfig>;
  seedContent: SiteContent;
  commerce?: CommerceService;
  paymentFetcher?: typeof fetch;
  auth?: AuthOptions;
  orderMailer?: AuthMailer;
  chatProvider?: ChatProvider;
};

export function createApp({
  repository,
  config,
  seedContent,
  commerce,
  paymentFetcher,
  auth,
  orderMailer,
  chatProvider,
}: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxyHops) app.set('trust proxy', config.trustProxyHops);
  app.use(helmet());
  app.use(
    '/uploads',
    (req, res, next) => {
      if (
        !/^\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/.test(
          req.path,
        )
      ) {
        res.sendStatus(404);
        return;
      }
      next();
    },
    express.static(uploadDirectory, {
      dotfiles: 'deny',
      index: false,
      immutable: true,
      maxAge: '1y',
      setHeaders(res) {
        res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
        res.setHeader('Content-Type', 'image/webp');
      },
    }),
  );
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
        'X-Chat-Token',
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
  const authSecret = config.authTokenSecret ?? config.orderTokenSecret;
  const smtpMailer = createSmtpAuthMailer({
    host: config.smtpHost,
    port: config.smtpPort,
    user: config.smtpUser,
    password: config.smtpPassword,
    from: config.mailFrom,
  });
  const authOptions =
    auth ??
    (authSecret
      ? {
          mailer: smtpMailer,
          publicWebUrl: config.publicWebUrl ?? config.frontendOrigin,
          challengeSecret: createHmac('sha256', authSecret)
            .update('htv:auth:challenge:v1')
            .digest('hex'),
          resetSecret: createHmac('sha256', authSecret).update('htv:auth:reset:v1').digest('hex'),
        }
      : undefined);
  const customers = createCustomerModule({
    orders: createCommerceCustomerOrderGateway(commerceService),
    content: repository,
    allowedOrigins,
    isDevelopment: config.isDevelopment,
    auth: authOptions,
  });
  commerceService.setVoucherRepository(customers.repository);
  app.locals.chatRealtime = { customers: customers.repository, allowedOrigins };
  app.use('/api', customers.middleware, systemAuditMiddleware, customers.csrf);
  app.use('/api', customers.router);
  app.use('/api', createGameRouter());

  const contentService = new ContentService(repository, seedContent);
  const contactService = new ContactService(repository);
  app.use('/api', createAdminProductRouter(contentService, adminAuth, adminLimiter));
  app.use('/api', createAdminIngredientRouter(contentService, adminAuth, adminLimiter));
  const chatService = new ChatService(
    contentService,
    {
      apiKey: config.geminiApiKey ?? '',
      model: config.geminiModel ?? 'gemini-3.1-flash-lite',
      enabled: Boolean(config.geminiApiKey),
      timeoutMs: 15_000,
    },
    chatProvider,
  );
  app.use('/api', createChatRouter(chatService));
  app.use(
    '/api',
    createChatHandoffRouter(new ChatHandoffService(), {
      isDevelopment: config.isDevelopment,
      allowedOrigins,
    }),
  );

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
      orderMailer: orderMailer ?? (config.smtpHost && config.mailFrom ? smtpMailer : undefined),
      publicWebUrl: config.publicWebUrl ?? config.frontendOrigin,
      publicLimiter,
      adminLimiter,
    }),
  );

  const errorHandler: ErrorRequestHandler = createErrorHandler(repository);
  app.use(errorHandler);
  return app;
}
