export const APP_HTTP_ERROR_EVENT = 'htv:http-error';

export type AppHttpErrorDetail = {
  status: number;
  message?: string;
};

export function reportAppHttpError(status: number, message?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<AppHttpErrorDetail>(APP_HTTP_ERROR_EVENT, { detail: { status, message } }),
  );
}

export async function fetchWithErrorRouting(
  input: RequestInfo | URL,
  init: RequestInit,
  path = '',
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError')
      routeApiError(path, error.name === 'TimeoutError' ? 504 : 503, undefined, init.method);
    throw error;
  }
}

export function routeApiError(path: string, status: number, payload?: unknown, method = 'GET') {
  if (typeof payload === 'object' && payload !== null && 'verificationRequired' in payload) return;
  const authPath = path.startsWith('/auth/');
  const readRequest = method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD';
  const routeStatus =
    !authPath &&
    (status === 401 ||
      status === 403 ||
      status === 404 ||
      status === 505 ||
      (readRequest && (status === 413 || status === 429 || status >= 500)));
  if (!routeStatus) return;
  const message =
    typeof payload === 'object' &&
    payload !== null &&
    'message' in payload &&
    typeof payload.message === 'string'
      ? payload.message
      : undefined;
  reportAppHttpError(status, message);
}
