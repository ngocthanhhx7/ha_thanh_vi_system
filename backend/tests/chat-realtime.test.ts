import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once as onceEvent } from 'node:events';
import { test } from 'node:test';
import { io as connect, type Socket } from 'socket.io-client';
import {
  attachChatRealtime,
  issueChatTicket,
  publishChatChange,
} from '../src/services/chatRealtime.js';

function once(socket: Socket, name: string): Promise<unknown[]> {
  return new Promise((resolve) => socket.once(name, (...args: unknown[]) => resolve(args)));
}

test(
  'real sockets isolate guest tickets, reject bad origin/staff, reauthorize events and reconnect',
  { timeout: 15000 },
  async () => {
    const server = createServer();
    let staffActive = true;
    const realtime = attachChatRealtime(server, {
      allowedOrigins: new Set(['http://localhost:5173']),
      customers: {
        sessionUser: async (token: string) =>
          token === 'staff-token' && staffActive
            ? {
                id: 'staff',
                name: 'Staff',
                email: 'staff@example.com',
                phone: '',
                role: 'staff' as const,
                accountStatus: 'active' as const,
                accountStatusReason: '',
                accountStatusChangedAt: null,
              }
            : undefined,
      },
    });
    server.listen(0, '127.0.0.1');
    await onceEvent(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const port = address.port;
    const sockets: Socket[] = [];
    function client(auth: object, origin = 'http://localhost:5173', cookie = '') {
      const socket = connect(`http://127.0.0.1:${port}`, {
        path: '/api/realtime/socket.io',
        auth,
        reconnection: false,
        transports: ['websocket'],
        extraHeaders: { Origin: origin, Cookie: cookie },
        timeout: 2000,
      });
      sockets.push(socket);
      return socket;
    }
    try {
      await once(client({ mode: 'staff' }), 'connect_error');
      await once(
        client({ mode: 'staff' }, 'https://evil.example', 'htv_session=staff-token'),
        'connect_error',
      );
      const staff = client({ mode: 'staff' }, undefined, 'htv_session=staff-token');
      await once(staff, 'connect');
      let guestActive = true;
      const ticket = issueChatTicket({ handoffId: 'one', valid: async () => guestActive });
      const guest = client({ ticket });
      await once(guest, 'connect');
      await once(client({ ticket }), 'connect_error');
      const other = client({
        ticket: issueChatTicket({ handoffId: 'two', valid: async () => true }),
      });
      await once(other, 'connect');
      const unrelated: unknown[] = [];
      other.on('chat:changed', (event) => unrelated.push(event));
      const guestEvent = once(guest, 'chat:changed');
      const staffEvent = once(staff, 'chat:changed');
      publishChatChange('one');
      assert.deepEqual(await guestEvent, [{ id: 'one' }]);
      assert.deepEqual(await staffEvent, [{ id: 'one' }]);
      assert.deepEqual(unrelated, []);
      guest.disconnect();
      const reconnected = client({
        ticket: issueChatTicket({ handoffId: 'one', valid: async () => guestActive }),
      });
      await once(reconnected, 'connect');
      const afterReconnect = once(reconnected, 'chat:changed');
      publishChatChange('one');
      assert.deepEqual(await afterReconnect, [{ id: 'one' }]);
      guestActive = false;
      staffActive = false;
      const guestClosed = once(reconnected, 'disconnect');
      const staffClosed = once(staff, 'disconnect');
      publishChatChange('one');
      await Promise.all([guestClosed, staffClosed]);
      assert.equal(reconnected.connected, false);
      assert.equal(staff.connected, false);
    } finally {
      sockets.forEach((socket) => socket.disconnect());
      await new Promise<void>((resolve) => realtime.close(() => resolve()));
    }
  },
);
