import type { CommerceService } from '../services/commerceService.js';

export type ScheduledJob = { stop(): void };

export function startPaymentReconciliationJob(
  commerce: CommerceService,
  options: { intervalMs?: number; olderThanMs?: number; onError?: (error: unknown) => void } = {},
): ScheduledJob {
  const intervalMs = options.intervalMs ?? 60 * 60 * 1000;
  const olderThanMs = options.olderThanMs ?? 24 * 60 * 60 * 1000;
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void commerce
      .markExpiredPayOsForReview(olderThanMs)
      .catch((error: unknown) => options.onError?.(error))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
