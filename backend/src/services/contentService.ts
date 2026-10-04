import { contentSchema, type SiteContent } from '../validators/content.js';
import { ServiceError } from './errors.js';
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
}
