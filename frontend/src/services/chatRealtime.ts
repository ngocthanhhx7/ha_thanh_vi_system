import { io } from 'socket.io-client';

type Change = (id?: string) => void;
const connections = new Map<
  string,
  {
    listeners: Set<Change>;
    connected: () => boolean;
    close: () => void;
  }
>();

/** Notifications only: callers always fetch current, authorized state through REST. */
export function subscribeChat(scope: 'staff' | string, onChange: Change) {
  let connection = connections.get(scope);
  if (!connection) {
    const listeners = new Set<Change>();
    let closed = false;
    const socket = io({
      path: '/api/realtime/socket.io',
      autoConnect: false,
      withCredentials: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
      auth: async (done) => {
        if (scope === 'staff') {
          done({ mode: 'staff' });
          return;
        }
        try {
          const response = await fetch(
            `/api/chat/handoffs/${encodeURIComponent(scope)}/realtime-ticket`,
            {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'X-Requested-With': 'XMLHttpRequest' },
              signal: AbortSignal.timeout(10000),
            },
          );
          if (!response.ok) throw new Error('Unauthorized');
          const { ticket } = await response.json();
          if (!closed) done({ ticket });
        } catch {
          if (!closed) done({ ticket: '' });
        }
      },
    });
    const notify = (id?: string) => {
      for (const listener of listeners) listener(id);
    };
    socket.on('connect', () => notify());
    socket.on('chat:changed', (event: { id?: unknown }) => {
      if (typeof event?.id === 'string') notify(event.id);
    });
    const reset = () => {
      socket.disconnect();
      socket.connect();
      notify();
    };
    window.addEventListener('customer-session-changed', reset);
    const retry = window.setInterval(() => {
      if (!socket.connected && !socket.active && document.visibilityState === 'visible')
        socket.connect();
    }, 15000);
    socket.connect();
    connection = {
      listeners,
      connected: () => socket.connected,
      close: () => {
        closed = true;
        clearInterval(retry);
        window.removeEventListener('customer-session-changed', reset);
        socket.disconnect();
      },
    };
    connections.set(scope, connection);
  }
  connection.listeners.add(onChange);
  const current = connection;
  return {
    connected: current.connected,
    close: () => {
      current.listeners.delete(onChange);
      if (!current.listeners.size) {
        current.close();
        connections.delete(scope);
      }
    },
  };
}
