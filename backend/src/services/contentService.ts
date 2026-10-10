import {
  contentSchema,
  productSchema,
  ingredientSchema,
  siteContentSchema,
  type Ingredient,
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
  'ingredientIds',
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

  async updateSite(input: unknown): Promise<SiteContent> {
    const parsed = siteContentSchema.safeParse(input);
    if (!parsed.success) throw new ServiceError(400, 'Thông tin website chưa hợp lệ.');
    const previous = await this.repository.getContent();
    const current = previous ?? this.seedContent;
    const updated = { ...current, site: parsed.data };
    await this.saveMutation(updated, previous);
    return updated;
  }

  async replaceContent(input: unknown): Promise<SiteContent> {
    const previous = await this.repository.getContent();
    const current = previous ?? this.seedContent;
    let candidate = input;
    if (input && typeof input === 'object' && !Array.isArray(input) && !('ingredients' in input)) {
      const legacy = input as Record<string, unknown>;
      candidate = {
        ...legacy,
        ingredients: current.ingredients,
        products: Array.isArray(legacy.products)
          ? legacy.products.map((product) => {
              if (
                !product ||
                typeof product !== 'object' ||
                Array.isArray(product) ||
                'ingredientIds' in product
              )
                return product;
              const found = current.products.find((item) => item.id === product.id);
              return found?.ingredientIds === undefined
                ? product
                : { ...product, ingredientIds: found.ingredientIds };
            })
          : legacy.products,
      };
    }
    const parsed = contentSchema.safeParse(candidate);
    if (!parsed.success)
      throw new ServiceError(
        400,
        'Nội dung không hợp lệ. Vui lòng kiểm tra cấu trúc site/products.',
      );
    try {
      await this.saveMutation(parsed.data, previous);
      return parsed.data;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(503, 'Hiện hệ thống chưa thể lưu dữ liệu. Vui lòng thử lại sau.');
    }
  }

  private async saveMutation(content: SiteContent, previous: SiteContent | null): Promise<void> {
    if (this.repository.saveContentIfCurrent) {
      if (!(await this.repository.saveContentIfCurrent(content, previous)))
        throw new ServiceError(409, 'Danh mục vừa được cập nhật. Vui lòng tải lại trước khi lưu.');
    } else await this.repository.saveContent(content);
  }

  async mutateIngredient(
    id: string | undefined,
    input: unknown,
    operation: 'create' | 'update' | 'delete',
  ): Promise<Ingredient | null> {
    const previous = await this.repository.getContent();
    const current = previous ?? this.seedContent;
    const catalog = current.ingredients ?? [];
    const found = catalog.find((item) => item.id === id);
    if (operation !== 'create' && !found) throw new ServiceError(404, 'Không tìm thấy thành phần.');
    if (
      operation === 'delete' &&
      current.products.some((product) => product.ingredientIds?.includes(id!))
    )
      throw new ServiceError(
        409,
        'Thành phần đang được sử dụng. Bỏ chọn khỏi sản phẩm trước khi xóa.',
      );
    let ingredient: Ingredient | null = null;
    if (operation !== 'delete') {
      if (
        operation === 'update' &&
        (!input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          ('id' in input && input.id !== id))
      )
        throw new ServiceError(400, 'ID thành phần không được thay đổi.');
      const parsed = ingredientSchema.safeParse(
        operation === 'update' ? { ...found, ...(input as Record<string, unknown>) } : input,
      );
      if (!parsed.success) throw new ServiceError(400, 'Thông tin thành phần chưa hợp lệ.');
      ingredient = parsed.data;
      const normalizedName = ingredient.name.normalize('NFC').toLocaleLowerCase('vi-VN');
      if (
        catalog.some(
          (item) =>
            item.id !== id &&
            (item.id === ingredient!.id ||
              item.name.normalize('NFC').toLocaleLowerCase('vi-VN') === normalizedName),
        )
      )
        throw new ServiceError(409, 'ID hoặc tên thành phần đã tồn tại.');
    }
    const ingredients =
      operation === 'create'
        ? [...catalog, ingredient!]
        : operation === 'delete'
          ? catalog.filter((item) => item.id !== id)
          : catalog.map((item) => (item.id === id ? ingredient! : item));
    const parsedContent = contentSchema.safeParse({ ...current, ingredients });
    if (!parsedContent.success)
      throw new ServiceError(400, 'Danh mục thành phần chưa hợp lệ hoặc vượt giới hạn.');
    await this.saveMutation(parsedContent.data, previous);
    return ingredient;
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
    await this.saveMutation(parsedContent.data, previous);
    return product;
  }
}
