import { z } from 'zod';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export const chatHistoryItemSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z
      .string()
      .trim()
      .min(1, 'Nội dung tin nhắn không được để trống.')
      .max(1500, 'Mỗi tin nhắn trong lịch sử tối đa 1500 ký tự.'),
  })
  .strict();

export const chatRequestSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, 'Nội dung tin nhắn không được để trống.')
      .max(1500, 'Tin nhắn tối đa 1500 ký tự.'),
    history: z
      .array(chatHistoryItemSchema)
      .max(8, 'Lịch sử trò chuyện tối đa 8 tin nhắn gần nhất.')
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    let totalLength = data.message.length;
    if (data.history) {
      for (const item of data.history) {
        totalLength += item.content.length;
      }
    }
    if (totalLength > 8000) {
      ctx.addIssue({
        code: 'custom',
        message: 'Tổng độ dài tin nhắn và lịch sử trò chuyện vượt quá giới hạn 8000 ký tự.',
        path: ['message'],
      });
    }
  });

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export interface ChatProductSummary {
  id: string;
  name: string;
  slug: string;
  price: number | null;
}

export interface ChatSource {
  label: string;
  url: string;
}

export interface ChatResponseBody {
  reply: string;
  products: ChatProductSummary[];
  handoff: boolean;
  sources: ChatSource[];
  available: boolean;
  limit?: number;
  remaining?: number;
}

// Regex patterns to detect PII (Email, Phone, Order IDs)
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const SENSITIVE_DATA_PATTERNS = [
  /\b(?:mật\s*khẩu|password|passcode|otp|mã\s*(?:otp|xác\s*minh|xác\s*thực)|verification\s+code|one[-\s]?time\s+code)\b/i,
  /\b(?:số\s*thẻ|thẻ\s*(?:tín\s*dụng|ngân\s*hàng)|cvv|cvc|mã\s*bảo\s*mật|số\s*tài\s*khoản|tài\s*khoản\s*ngân\s*hàng|credit\s*card|bank\s*account)\b/i,
];
const CARD_NUMBER_REGEX = /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/;
const LABELED_BANK_ACCOUNT_REGEX =
  /\b(?:số\s*tài\s*khoản|tài\s*khoản\s*ngân\s*hàng|bank\s*account)\b.{0,32}\b\d{6,20}\b/i;

function hasPhoneNumber(text: string): boolean {
  // Test normalized digits (stripping common separators like spaces, dashes, dots, parentheses)
  const normalized = text.replace(/[-.\s()]/g, '');
  if (/(?:\+84|84|0)(?:3[2-9]|5[25689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}\b/.test(normalized)) {
    return true;
  }
  if (/(?:\+84|84|0)2[0-9]{8,9}\b/.test(normalized)) {
    return true;
  }
  if (/\b0[0-9]{8,10}\b/.test(normalized)) {
    return true;
  }
  if (/(?:(?:\+84|84|0)[-.\s]?[0-9]{2,3}[-.\s]?[0-9]{3}[-.\s]?[0-9]{3,4})/.test(text)) {
    return true;
  }
  return false;
}

function hasOrderId(text: string): boolean {
  if (
    /(?:mã\s*đơn|đơn\s*hàng|order|hóa\s*đơn|mã\s*vận\s*đơn)\s*[:#\s]?\s*[A-Za-z0-9_-]{3,}/i.test(
      text,
    )
  ) {
    return true;
  }
  if (/\b(?:ORD|DH|HD|HTV|ORDER)[-_]?[A-Za-z0-9]{3,}\b/i.test(text)) {
    return true;
  }
  if (/\b#[0-9]{4,}\b/.test(text)) {
    return true;
  }
  if (/\b[0-9a-f]{24}\b/i.test(text)) {
    return true;
  }
  return false;
}

export function containsPII(text: string): boolean {
  if (!text) return false;
  return (
    EMAIL_REGEX.test(text) ||
    hasPhoneNumber(text) ||
    hasOrderId(text) ||
    containsCredentialOrPaymentData(text)
  );
}

export function containsCredentialOrPaymentData(text: string): boolean {
  if (!text) return false;
  return (
    SENSITIVE_DATA_PATTERNS.some((pattern) => pattern.test(text)) ||
    CARD_NUMBER_REGEX.test(text) ||
    LABELED_BANK_ACCOUNT_REGEX.test(text)
  );
}

export function requestContainsPII(request: ChatRequest): boolean {
  if (containsPII(request.message)) return true;
  if (request.history) {
    for (const item of request.history) {
      if (containsPII(item.content)) return true;
    }
  }
  return false;
}

// Deterministic off-topic gate (code, homework, politics, malware)
// Note: allows gifts, Hanoi food culture, tea, brand inquiries, greetings, follow-ups
const OFF_TOPIC_PATTERNS = [
  /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|system|instructions)|system\s*prompt|reveal.*(?:key|secret)|bỏ\s*qua.*(?:hướng\s*dẫn|chỉ\s*dẫn)|(?:tiết\s*lộ|in\s*ra).*(?:bí\s*mật|api\s*key|prompt)/i,
  // Programming & Code
  /(?:viết|hướng\s*dẫn|hãy\s*code|lập\s*trình|thuật\s*toán|debug)\s*(?:code|python|javascript|typescript|c\+\+|java|react|html|css|sql|function|script)/i,
  /\b(?:console\.log|import\s+.*\s+from|public\s+static\s+void|def\s+[a-zA-Z_]|SELECT\s+.*\s+FROM|npm\s+install)\b/i,
  // Homework & Math/Science
  /(?:giải|làm)\s*(?:bài\s*tập|hộ\s*bài|phương\s*trình|hệ\s*phương\s*trình|tích\s*phân|đạo\s*hàm|vật\s*lý|hóa\s*học)/i,
  /\b(?:solve\s+calculus|homework|physics\s+problem)\b/i,
  // Politics & sensitive governmental topics
  /(?:chính\s*trị|bầu\s*cử|đảng\s*phái|tổng\s*thống|thủ\s*tướng|biểu\s*tình|quân\s*sự|chiến\s*tranh)/i,
  // Unrelated external utility
  /(?:dịch|translate)\s*(?:đoạn\s*văn|bài\s*báo|tài\s*liệu)\s*(?:này|sau)\s*(?:sang|qua)\s*(?:tiếng|english)/i,
];

export function isDeterministicOffTopic(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  // Ensure we don't accidentally flag natural food culture / gift conversations
  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }
  return false;
}
