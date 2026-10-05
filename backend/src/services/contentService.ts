import {
  contentSchema,
  productSchema,
  type Product,
  type SiteContent,
} from '../validators/content.js';
import { ServiceError } from './errors.js';
const optionalProductFields = [
  'tagline',
  'packaging',
  'packageContents',
  'ingredients',
  'ingredientImage',
  'allergens',
  'storage',
] as const;
import type { ContentRepository } from '../services/contentRepository.js';

export class ContentService {
  constructor(
    private readonly repository: ContentRepository,
    private readonly seedContent: SiteContent,
  ) {}

  async getPublicContent(): Promise<SiteContent> {
    return (await this.repository.getContent()) ?? this.seedContent;
  }

  async replaceContent(input: unknown): Promise<SiteContent> {
    const parsed = contentSchema.safeParse(input);
    if (!parsed.success)
      throw new ServiceError(
        400,
        'Nội dung không hợp lệ. Vui lòng kiểm tra cấu trúc site/products.',
      );
    try {
      return await this.repository.saveContent(parsed.data);
    } catch {
      throw new ServiceError(503, 'Hiện hệ thống chưa thể lưu dữ liệu. Vui lòng thử lại sau.');
    }
  }

  async mutateProduct(
    id: string | undefined,
    input: unknown,
    operation: 'create' | 'update' | 'delete',
  ): Promise<Product | null> {
    const previous = await this.repository.getContent();
    const current = previous ?? this.seedContent;
    const found = current.products.find((product) => product.id === id);
    if (operation !== 'create' && !found) throw new ServiceError(404, 'Không tìm thấy sản phẩm.');
    let product: Product | null = null;
    if (operation !== 'delete') {
      if (
        operation === 'update' &&
        (!input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          ('id' in input && input.id !== id))
      )
        throw new ServiceError(400, 'ID sản phẩm không được thay đổi.');
      let candidate: unknown = input;
      if (operation === 'update') {
        const patch = input as Record<string, unknown>;
        const updated: Record<string, unknown> = { ...found, ...patch };
        for (const key of optionalProductFields) if (patch[key] === null) delete updated[key];
        candidate = updated;
      }
      const parsed = productSchema.safeParse(candidate);
      if (!parsed.success) throw new ServiceError(400, 'Thông tin sản phẩm chưa hợp lệ.');
      product = parsed.data;
      if (
        current.products.some(
          (item) => item.id !== id && (item.id === product!.id || item.slug === product!.slug),
        )
      )
        throw new ServiceError(409, 'ID hoặc đường dẫn sản phẩm đã tồn tại.');
    }
    const products =
      operation === 'create'
        ? [...current.products, product!]
        : operation === 'delete'
          ? current.products.filter((item) => item.id !== id)
          : current.products.map((item) => (item.id === id ? product! : item));
    const parsedContent = contentSchema.safeParse({ ...current, products });
    if (!parsedContent.success)
      throw new ServiceError(400, 'Danh mục vượt giới hạn hoặc thông tin không hợp lệ.');
    if (this.repository.saveContentIfCurrent) {
      if (!(await this.repository.saveContentIfCurrent(parsedContent.data, previous)))
        throw new ServiceError(409, 'Danh mục vừa được cập nhật. Vui lòng tải lại trước khi lưu.');
    } else await this.repository.saveContent(parsedContent.data);
    return product;
  }
}
