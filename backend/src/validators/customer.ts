import { z } from 'zod';
const text = (max: number) => z.string().trim().min(1).max(max);
export const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 .()-]{9,20}$/);
export const registrationSchema = z
  .object({
    name: text(100),
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(10).max(128),
    confirmPassword: z.string().min(10).max(128),
    phone,
  })
  .strict()
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu xác nhận chưa khớp.',
  });
export const loginSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(128),
    rememberDevice: z.boolean().default(false),
  })
  .strict();
export const addressInputSchema = z
  .object({
    label: text(40),
    name: text(100),
    phone,
    address: text(500),
    isDefault: z.boolean().default(false),
  })
  .strict();
export const reviewInputSchema = z
  .object({
    orderId: text(100),
    productId: text(100),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(3).max(2000),
  })
  .strict();
export const ticketInputSchema = z
  .object({ orderId: text(100), kind: z.enum(['support', 'return']), message: text(3000) })
  .strict();
export const ticketUpdateSchema = z
  .object({ status: z.enum(['open', 'in_progress', 'resolved']), reply: text(3000) })
  .strict();
export const voucherInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,40}$/),
    name: text(150),
    type: z.enum(['fixed', 'percent']),
    value: z.number().int().positive().max(100000000),
    minOrder: z.number().int().min(0).default(0),
    maxDiscount: z.number().int().min(0).default(0),
    startsAt: z.coerce.date(),
    expiresAt: z.coerce.date(),
    distribution: z.enum(['automatic', 'code']),
    totalLimit: z.number().int().min(1).max(100000),
    perUserLimit: z.number().int().min(1).max(100),
    active: z.boolean(),
  })
  .strict()
  .refine(
    (v) => v.expiresAt > v.startsAt && !(v.type === 'percent' && v.value > 100),
    'Thời hạn hoặc mức giảm chưa hợp lệ.',
  );
export const claimSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,80}$/),
  })
  .strict();

const authEmail = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const verificationSchema = z
  .object({
    email: authEmail,
    code: z.string().regex(/^\d{6}$/),
    rememberDevice: z.boolean().default(false),
  })
  .strict();
export const authEmailSchema = z.object({ email: authEmail }).strict();
export const loginVerificationSchema = z
  .object({ challengeId: z.string().regex(/^[a-f0-9]{64}$/), code: z.string().regex(/^\d{6}$/) })
  .strict();
export const loginResendSchema = z
  .object({ challengeId: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export const resetPasswordSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    password: z.string().min(10).max(128),
    confirmPassword: z.string().min(10).max(128),
  })
  .strict()
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu xác nhận chưa khớp.',
  });
