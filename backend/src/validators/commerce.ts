import { z } from 'zod';
import { PAYMENT_METHODS, ORDER_STATUSES, PAYMENT_STATUSES } from '../constants/order.js';

const requiredText = (max: number) => z.string().trim().min(1).max(max);

export const checkoutSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: requiredText(100),
            quantity: z.number().int().min(1).max(99),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    customer: z
      .object({
        name: requiredText(120),
        email: z.string().trim().email().max(254),
        phone: z
          .string()
          .trim()
          .min(8)
          .max(20)
          .regex(/^[+0-9() .-]+$/),
        address: requiredText(500),
      })
      .strict(),
    paymentMethod: z.enum(PAYMENT_METHODS),
    note: z.string().trim().max(1000).default(''),
    consent: z.literal(true),
    voucherCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,80}$/)
      .optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const productIds = new Set<string>();
    input.items.forEach((item, index) => {
      if (productIds.has(item.productId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'productId'],
          message: 'Sản phẩm không được lặp.',
        });
      }
      productIds.add(item.productId);
    });
  });

export const idempotencyKeySchema = z.string().uuid();
export const orderIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const adminOrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const adminOrderUpdateSchema = z
  .object({
    status: z.enum(ORDER_STATUSES).optional(),
    trackingNumber: z.string().trim().max(100).optional(),
    carrier: z.string().trim().max(100).optional(),
    shippingEvent: z
      .object({
        status: requiredText(80),
        description: requiredText(500),
        location: z.string().trim().max(150).optional(),
        occurredAt: z.coerce
          .date()
          .refine((value) => value.getTime() <= Date.now() + 60000)
          .optional(),
      })
      .strict()
      .optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export type CheckoutInput = z.infer<typeof checkoutSchema>;
