import type { Request } from 'express';

export type AuthenticatedRequest = Request & { user?: { id?: string } };

export function requestUserId(request: Request): string | undefined {
  const user = (request as AuthenticatedRequest).user;
  return typeof user?.id === 'string' && user.id.length > 0 ? user.id : undefined;
}
