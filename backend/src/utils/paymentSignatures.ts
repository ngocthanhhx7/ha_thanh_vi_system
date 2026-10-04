import { createHmac, timingSafeEqual } from 'node:crypto';

export type PayOsData = Record<string, unknown>;

function canonicalValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function canonicalPayOsData(data: PayOsData): string {
  return Object.keys(data)
    .filter((key) => key !== 'signature')
    .sort()
    .map((key) => `${key}=${canonicalValue(data[key])}`)
    .join('&');
}

export function createPayOsSignature(data: PayOsData, checksumKey: string): string {
  return createHmac('sha256', checksumKey).update(canonicalPayOsData(data)).digest('hex');
}

export function isValidPayOsWebhook(
  body: { data?: unknown; signature?: unknown },
  checksumKey: string,
): boolean {
  if (
    !body.data ||
    typeof body.data !== 'object' ||
    Array.isArray(body.data) ||
    typeof body.signature !== 'string' ||
    !/^[a-f\d]{64}$/i.test(body.signature)
  )
    return false;
  const expected = Buffer.from(createPayOsSignature(body.data as PayOsData, checksumKey), 'hex');
  const actual = Buffer.from(body.signature, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isAllowedPayOsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' && url.hostname === 'pay.payos.vn' && !url.username && !url.password
    );
  } catch {
    return false;
  }
}
