import { isIP } from 'node:net';
import { z } from 'zod';
export type SiteContent = z.infer<typeof contentSchema>;
export type Product = SiteContent['products'][number];
export type ContactInput = z.infer<typeof contactSchema>;

const text = (max: number) => z.string().trim().min(1).max(max);

function isSafeHttpUrl(value: string, httpsOnly = false): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const localHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    return (
      (httpsOnly ? url.protocol === 'https:' : ['http:', 'https:'].includes(url.protocol)) &&
      Boolean(hostname) &&
      (httpsOnly || !localHost) &&
      !isIP(hostname.replace(/^\[|\]$/g, '')) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function isSafeImage(value: string): boolean {
  if (value.startsWith('/')) {
    if (!value.startsWith('/brand/') || value.includes('\\') || value.includes('//')) return false;
    try {
      const decoded = decodeURIComponent(value);
      return !decoded.split('/').some((part) => part === '.' || part === '..');
    } catch {
      return false;
    }
  }
  return isSafeHttpUrl(value);
}

const safeSocialUrl = z
  .string()
  .url()
  .max(2048)
  .refine((value) => isSafeHttpUrl(value, true));
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(100);

export const productSchema = z
  .object({
    id: slug,
    slug,
    name: text(160),
    category: slug,
    weight: text(80),
    flavor: text(100),
    description: text(2000),
    image: z
      .string()
      .min(1)
      .max(2048)
      .refine(isSafeImage, 'Ảnh phải là URL HTTP(S) an toàn hoặc đường dẫn /brand/ hợp lệ.'),
    price: z.number().int().nonnegative().finite().nullable(),
    featured: z.boolean(),
  })
  .strict();

export const siteContentSchema = z
  .object({
    name: text(160),
    company: text(200),
    tagline: text(300),
    heroTitle: text(500),
    heroDescription: text(2000),
    phone: text(40),
    email: z.string().trim().email().max(254),
    address: text(500),
    facebook: safeSocialUrl,
    zalo: safeSocialUrl,
    story: text(5000),
  })
  .strict();

export const contentSchema = z
  .object({
    site: siteContentSchema,
    products: z.array(productSchema).min(1).max(200),
  })
  .strict()
  .superRefine((content, ctx) => {
    const slugs = new Set<string>();
    for (const [index, product] of content.products.entries()) {
      if (slugs.has(product.slug)) {
        ctx.addIssue({
          code: 'custom',
          path: ['products', index, 'slug'],
          message: 'Slug sản phẩm không được trùng.',
        });
      }
      slugs.add(product.slug);
    }
  });

export const contactSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    phone: z
      .string()
      .trim()
      .min(8)
      .max(20)
      .regex(/^[+0-9() .-]+$/),
    message: z.string().trim().min(5).max(2000),
    consent: z.literal(true),
  })
  .strict();
