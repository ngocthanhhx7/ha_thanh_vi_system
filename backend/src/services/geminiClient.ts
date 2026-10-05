import { z } from 'zod';
import { DEFAULT_CHAT_MODEL, DEFAULT_CHAT_TIMEOUT_MS } from '../config/chat.js';
import { ServiceError } from './errors.js';

export const providerOutputSchema = z
  .object({
    inScope: z.boolean(),
    reply: z.string().trim().min(1).max(4000),
    productIds: z.array(z.string().max(100)).max(4),
    handoff: z.boolean(),
  })
  .strict();
export type ProviderInteractionOutput = z.infer<typeof providerOutputSchema>;
export interface ProviderInteractionInput {
  model?: string;
  systemInstruction: string;
  input: string;
}
export interface ChatProvider {
  generate(interaction: ProviderInteractionInput): Promise<ProviderInteractionOutput>;
}
export interface GeminiProviderOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

export class GeminiInteractionsProvider implements ChatProvider {
  private readonly fetcher: typeof fetch;
  constructor(private readonly options: GeminiProviderOptions) {
    this.fetcher = options.fetcher ?? globalThis.fetch;
  }
  async generate(interaction: ProviderInteractionInput): Promise<ProviderInteractionOutput> {
    if (!this.options.apiKey) throw new ServiceError(503, 'Kênh AI chưa được cấu hình.');
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.max(1, Math.min(this.options.timeoutMs ?? DEFAULT_CHAT_TIMEOUT_MS, 15000)),
    );
    try {
      const response = await this.fetcher(
        'https://generativelanguage.googleapis.com/v1beta/interactions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.options.apiKey },
          signal: controller.signal,
          body: JSON.stringify({
            model: interaction.model || this.options.model || DEFAULT_CHAT_MODEL,
            input: interaction.input,
            system_instruction: interaction.systemInstruction,
            generation_config: { max_output_tokens: 1200, thinking_level: 'low' },
            response_format: {
              type: 'text',
              mime_type: 'application/json',
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  inScope: { type: 'boolean' },
                  reply: { type: 'string' },
                  productIds: { type: 'array', items: { type: 'string' }, maxItems: 4 },
                  handoff: { type: 'boolean' },
                },
                required: ['inScope', 'reply', 'productIds', 'handoff'],
              },
            },
            store: false,
          }),
        },
      );
      if (response.status === 429) throw new ServiceError(429, 'Kênh AI đang bận.');
      if (!response.ok || !response.body) {
        let apiStatus: string | undefined;
        let apiCode: number | undefined;
        try {
          const errorBody = (await response.clone().json()) as {
            error?: { status?: unknown; code?: unknown };
          };
          apiStatus =
            typeof errorBody.error?.status === 'string' ? errorBody.error.status : undefined;
          apiCode = typeof errorBody.error?.code === 'number' ? errorBody.error.code : undefined;
        } catch {
          apiStatus = 'unparseable-error-body';
        }
        console.error('Gemini API rejected a chat request.', {
          httpStatus: response.status,
          apiStatus,
          apiCode,
        });
        throw new Error('Unavailable');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let body = '',
        size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 100000) {
          await reader.cancel();
          throw new Error('Oversized');
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
      const envelope = JSON.parse(body) as Record<string, unknown>;
      if (envelope.status !== 'completed' || !Array.isArray(envelope.steps))
        throw new Error('Incomplete');
      const texts = envelope.steps.flatMap((step: unknown) => {
        if (!step || typeof step !== 'object') return [];
        const record = step as Record<string, unknown>;
        if (record.type !== 'model_output' || !Array.isArray(record.content)) return [];
        return record.content.flatMap((part: unknown) => {
          if (!part || typeof part !== 'object') return [];
          const item = part as Record<string, unknown>;
          return item.type === 'text' && typeof item.text === 'string' ? [item.text] : [];
        });
      });
      return providerOutputSchema.parse(JSON.parse(texts.join('')));
    } catch (error) {
      if (error instanceof ServiceError && error.status === 429) throw error;
      console.error('Gemini chat request failed.', {
        error: error instanceof Error ? error.name : 'UnknownError',
      });
      throw new ServiceError(503, 'Kênh AI đang gián đoạn. Vui lòng thử lại sau.');
    } finally {
      clearTimeout(timeout);
    }
  }
}
