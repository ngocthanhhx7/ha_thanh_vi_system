import type { ContactInput } from '../validators/content.js';
import type { ContentRepository } from '../services/contentRepository.js';
import { ServiceError } from './errors.js';

export class ContactService {
  constructor(private readonly repository: ContentRepository) {}

  async submit(contact: ContactInput): Promise<void> {
    try {
      await this.repository.createContact(contact);
    } catch {
      throw new ServiceError(503, 'Hiện hệ thống chưa thể lưu dữ liệu. Vui lòng thử lại sau.');
    }
  }
}
