import type { ChatHandoff } from './chatApi';

/** REST reads and writes may complete out of order after a socket invalidation. */
export function newerChatSnapshot(current: ChatHandoff | null, incoming: ChatHandoff) {
  if (!current || current.id !== incoming.id) return incoming;
  const oldTime = Date.parse(current.updatedAt);
  const newTime = Date.parse(incoming.updatedAt);
  if (newTime < oldTime) return current;
  const rank = { waiting: 0, assigned: 1, resolved: 2 };
  if (
    newTime === oldTime &&
    (incoming.messages.length < current.messages.length ||
      rank[incoming.status] < rank[current.status])
  )
    return current;
  return incoming;
}
