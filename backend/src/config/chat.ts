export interface ChatOptions {
  apiKey: string;
  model: string;
  enabled: boolean;
  timeoutMs?: number;
}

export const DEFAULT_CHAT_MODEL = 'gemini-3.1-flash-lite';
export const DEFAULT_CHAT_TIMEOUT_MS = 15000;
