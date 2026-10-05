# Vị Ơi — backend chatbot

## Integration

```ts
import { ChatService } from './services/chatService.js';
import { createChatRouter } from './routes/chatRoutes.js';
const chat = new ChatService(contentService, {
  apiKey: config.geminiApiKey ?? '',
  model: config.geminiModel ?? 'gemini-3.8-flash',
  enabled: Boolean(config.geminiApiKey),
  timeoutMs: 15000,
});
app.use('/api', createChatRouter(chat));
```

The key is injected by the server configuration. These modules do not read environment files. Never expose the key to the browser. For tests, inject a `ChatProvider` or a local `fetcher`; never use production credentials.

Set a non-empty `GEMINI_API_KEY` in the backend environment and restart the backend after changing it. `GET /api/chat/config` reports whether the running process loaded the key; it never returns the key itself. No separate chat-enabled flag is required.

## API

- `GET /api/chat/config`: `{ enabled, name: 'Vị Ơi', suggestions: string[] }`. `enabled` requires both configuration and a key.
- `POST /api/chat`: `{ message: string, history?: [{ role: 'user' | 'assistant', content: string }] }`. Message/history items: 1–1500 trimmed characters; history: at most 8 entries; combined: 8000 characters. Unknown fields and forged roles rejected.
- Success: `{ reply, products: [{ id, name, slug, price }], handoff, sources: [{ label, url }], available }`. Prices may be null when the public catalog has no published price.
- Validation: 400 `{ message }`. Unconfigured/provider failure: 503 same response shape with an honest support handoff and `available: false`. Provider/local quota: 429 same handoff shape. Local limit: 20 requests per IP per 10 minutes; configure Express proxy trust correctly at deployment.

## Behavior and data

Vị Ơi speaks short, warm Vietnamese with refined Hanoi GenZ personality, light wit, emoji and simple Markdown. Topics cover Hà Thành Vị, public products, gift selection, Hanoi food culture and customer support. Obvious code/homework/politics/prompt-exfiltration requests in the current message or conversation history are rejected before the model. The model also classifies scope; out-of-scope answers are replaced by the server redirect.

Every eligible request reads `ContentService.getPublicContent()` and sends only public catalog/site fields. At most 40 products are selected by overlap with the current question, with descriptions capped at 300 characters and public story at 1000; requests for a broader catalog can use the product page. That service uses the current repository content, falling back to the configured seed when no content exists. Product IDs and returned prices are resolved by the server from this request's catalog. Model text containing numeric currency claims is replaced with a prompt to use the authoritative product cards. HTML, model links and bare URLs are removed; server links only point to `/san-pham`, `/san-pham/:slug`, `/lien-he`.

`content/chat-knowledge.json` contains owner-confirmed facts dated 2026-10-04: 350g zip bags (traditional lime leaf lightly sweet/rich; chocolate salted egg sweet/salty rich; matcha salted egg light/rich), gifts Nhã Sắc Hà Thành and Nhã Vị Kinh Kỳ with their supplied taglines. It contains no prices, nutrition, allergy guarantees, shelf life or unconfirmed gift contents. Public contact/story comes from the current public site content. Unknown policy and personal order questions are handed to the team; the model cannot purchase, change orders or issue refunds.

User/history/catalog/knowledge are JSON data inside marked blocks. Trusted system instructions tell the model not to treat any of them as instructions. No tools, arbitrary URL fetches, file access or private customer/order access are provided. This reduces injection risk; it is not a proof of semantic model correctness.

Emails, recognizable phone numbers, order references, password/OTP references, and payment-card or bank-account details in current/history messages cause early support handoff without a model call. Detection uses patterns and cannot identify every form of personal information; the UI should ask users to avoid sending personal data. Conversations are not persisted or logged by these modules; UI history should remain in session memory.

## Provider

The adapter uses Gemini REST Interactions, default `gemini-3.8-flash`, `x-goog-api-key`, `store: false`, and no tools. It requests top-level `response_format: { type: 'text', mime_type: 'application/json', schema }` with `generation_config.max_output_tokens: 1200`. It reads completed `steps[].content[]` for `model_output` text. JSON is strictly validated as `{ inScope: boolean, reply: string, productIds: string[<=4], handoff: boolean }`. Malformed/non-JSON/incomplete responses fail closed. Total request/body deadline is at most 15 seconds; provider response body is limited to 100KB. Raw provider errors/keys are never returned or logged.

`store: false` disables interaction storage for conversation state; it does not override Google's general abuse-monitoring/data-retention policies.

Official references verified 2026-10-04: [Interactions overview](https://ai.google.dev/gemini-api/docs/interactions-overview), [REST API schema](https://ai.google.dev/api/interactions-api), [structured output](https://ai.google.dev/gemini-api/docs/structured-output).

## Verification

Run chat tests with `DOTENV_CONFIG_PATH` pointing to a controlled blank test file. Tests inject provider/fetch stubs only and cover live catalog changes, schema/size limits, PII, pre-model refusals, injection boundaries, malformed provider output, unknown IDs, current prices, bounded links, unconfigured/failure states, quotas and the documented REST envelope. No live Gemini request is required or was made during implementation.
