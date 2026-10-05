export type ChatHistory = { role: 'user' | 'assistant'; content: string };
export type ChatReply = {
  reply: string;
  available?: boolean;
  limit?: number;
  remaining?: number;
  products: { id: string; name: string; slug: string; price: number | null }[];
  handoff: boolean;
  sources: { label: string; url: string }[];
};
export type ChatHandoff = {
  id: string;
  status: 'waiting' | 'assigned' | 'resolved';
  customerType: 'guest' | 'account';
  assignedStaffName: string | null;
  assignedStaffId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  staffUnreadCount: number;
  customerUnreadCount: number;
  auditTrail: {
    action: 'created' | 'customer_message' | 'claimed' | 'staff_message' | 'resolved';
    actorName: string | null;
    actorRole: 'guest' | 'customer' | 'staff' | 'admin' | 'system';
    occurredAt: string;
  }[];
  messages: {
    id: string;
    sender: 'customer' | 'assistant' | 'staff' | 'system';
    content: string;
    authorName: string | null;
    createdAt: string;
  }[];
};
export class ChatApiError extends Error {
  constructor(
    message: string,
    public response?: ChatReply,
  ) {
    super(message);
  }
}
async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    base?: string;
    signal?: AbortSignal;
    includeRateLimit?: boolean;
  } = {},
): Promise<T> {
  const response = await fetch((options.base ?? '/api/chat') + path, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(options.token ? { 'X-Chat-Token': options.token } : {}),
    },
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const data = await response.json().catch(() => null);
  if (options.includeRateLimit && data && typeof data === 'object') {
    const remaining = Number(response.headers.get('RateLimit-Remaining'));
    const limit = Number(response.headers.get('RateLimit-Limit'));
    if (Number.isFinite(remaining)) Object.assign(data, { remaining });
    if (Number.isFinite(limit)) Object.assign(data, { limit });
  }
  if (!response.ok)
    throw new ChatApiError(
      data?.message ||
        data?.reply ||
        'Vị Ơi chưa thể trả lời lúc này. Bạn thử lại hoặc liên hệ cửa hàng nhé.',
      data,
    );
  if (!data) throw new ChatApiError('Chưa nhận được phản hồi. Bạn thử lại nhé.');
  return data;
}
export const chatApi = {
  config: () => request<{ enabled: boolean; name: string; suggestions: string[] }>('/config'),
  send: (message: string, history: ChatHistory[], signal?: AbortSignal, visitorToken?: string) =>
    request<ChatReply>('', {
      body: { message, history: history.slice(-8) },
      signal,
      token: visitorToken,
      includeRateLimit: true,
    }),
  createHandoff: (transcript: ChatHistory[], token: string) =>
    request<{ handoff: ChatHandoff }>('/handoffs', {
      token,
      body: { transcript: transcript.slice(-12) },
    }),
  getHandoff: (id: string) =>
    request<{ handoff: ChatHandoff }>('/handoffs/' + encodeURIComponent(id)),
  sendHandoffMessage: (id: string, message: string) =>
    request<{ handoff: ChatHandoff }>('/handoffs/' + encodeURIComponent(id) + '/messages', {
      body: { message },
    }),
  staffHandoffs: () =>
    request<{ handoffs: ChatHandoff[]; summary: { waiting: number; unread: number } }>(
      '/chat-handoffs',
      { base: '/api/staff' },
    ),
  staffSummary: () =>
    request<{ waiting: number; unread: number }>('/chat-handoffs/summary', {
      base: '/api/staff',
    }),
  staffHandoff: (id: string) =>
    request<{ handoff: ChatHandoff }>('/chat-handoffs/' + encodeURIComponent(id), {
      base: '/api/staff',
    }),
  claimHandoff: (id: string) =>
    request<{ handoff: ChatHandoff }>('/chat-handoffs/' + encodeURIComponent(id) + '/claim', {
      base: '/api/staff',
      method: 'PATCH',
    }),
  replyHandoff: (id: string, message: string) =>
    request<{ handoff: ChatHandoff }>('/chat-handoffs/' + encodeURIComponent(id) + '/messages', {
      base: '/api/staff',
      body: { message },
    }),
  resolveHandoff: (id: string) =>
    request<{ handoff: ChatHandoff }>('/chat-handoffs/' + encodeURIComponent(id) + '/resolve', {
      base: '/api/staff',
      method: 'PATCH',
    }),
};
