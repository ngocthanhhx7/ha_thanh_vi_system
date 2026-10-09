import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { sessionToken } from '../middlewares/customerAuth.js';
import type { CustomerRepository } from './customerRepository.js';

export const chatChanges = new EventEmitter();
chatChanges.setMaxListeners(0);
export function publishChatChange(id: string) {
  chatChanges.emit('changed', id);
}
type Access = { handoffId: string; valid: () => Promise<boolean> };
const tickets = new Map<string, Access & { expires: number }>();
export function issueChatTicket(access: Access) {
  for (const [key, value] of tickets) if (value.expires <= Date.now()) tickets.delete(key);
  if (tickets.size >= 2000) throw new Error('Kết nối đang bận. Vui lòng thử lại.');
  const ticket = randomBytes(32).toString('base64url');
  tickets.set(ticket, { ...access, expires: Date.now() + 30000 });
  return ticket;
}

export function attachChatRealtime(
  server: HttpServer,
  options: {
    allowedOrigins: Set<string>;
    customers: Pick<CustomerRepository, 'sessionUser'>;
  },
) {
  const io = new Server(server, {
    path: '/api/realtime/socket.io',
    serveClient: false,
    maxHttpBufferSize: 2048,
    cors: { origin: [...options.allowedOrigins], credentials: true },
    allowRequest: (req, callback) =>
      callback(null, !!req.headers.origin && options.allowedOrigins.has(req.headers.origin)),
  });
  io.use(async (socket, next) => {
    try {
      if (socket.handshake.auth.mode === 'staff') {
        const token = sessionToken(socket.request.headers.cookie);
        const valid = async () => {
          const user = token ? await options.customers.sessionUser(token) : undefined;
          return !!user && (user.role === 'staff' || user.role === 'admin');
        };
        if (!(await valid())) throw new Error('unauthorized');
        socket.data.valid = valid;
        socket.data.staff = true;
      } else {
        const ticket = socket.handshake.auth.ticket;
        const access = typeof ticket === 'string' ? tickets.get(ticket) : undefined;
        if (typeof ticket === 'string') tickets.delete(ticket);
        if (!access || access.expires <= Date.now() || !(await access.valid()))
          throw new Error('unauthorized');
        socket.data.valid = access.valid;
        socket.data.handoffId = access.handoffId;
      }
      next();
    } catch {
      next(new Error('Phiên tư vấn không hợp lệ.'));
    }
  });
  io.on('connection', (socket) => {
    // No client-selected rooms or socket writes. REST remains authoritative.
    const validate = async () => {
      try {
        if (await socket.data.valid()) return true;
      } catch {
        /* fail closed */
      }
      socket.disconnect(true);
      return false;
    };
    let chain = Promise.resolve();
    const changed = (id: string) => {
      if (!socket.data.staff && socket.data.handoffId !== id) return;
      chain = chain
        .then(async () => {
          if (socket.connected && (await validate())) socket.emit('chat:changed', { id });
        })
        .catch(() => {
          socket.disconnect(true);
        });
    };
    chatChanges.on('changed', changed);
    const timer = setInterval(() => void validate(), 30000);
    timer.unref();
    socket.on('disconnect', () => {
      clearInterval(timer);
      chatChanges.off('changed', changed);
    });
  });
  return io;
}
