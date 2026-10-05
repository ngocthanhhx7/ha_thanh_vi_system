import mongoose from 'mongoose';
import type { ContactInput, SiteContent } from '../validators/content.js';
import { ContactModel, ContentModel } from '../models/content.js';
import { MongoOrderRepository, type OrderRepository } from './orderRepository.js';

export interface ContentRepository {
  readonly storage: string;
  readonly available: boolean;
  getContent(): Promise<SiteContent | null>;
  saveContent(content: SiteContent): Promise<SiteContent>;
  saveContentIfCurrent?(content: SiteContent, previous: SiteContent | null): Promise<boolean>;
  createContact(contact: ContactInput): Promise<void>;
}

export interface ApplicationRepository extends ContentRepository {
  readonly available: boolean;
  readonly orderRepository: OrderRepository;
}

export class MongoRepository implements ApplicationRepository {
  readonly orderRepository: OrderRepository = new MongoOrderRepository();
  readonly storage = 'mongodb';

  get available() {
    return mongoose.connection.readyState === 1;
  }

  async getContent(): Promise<SiteContent | null> {
    const document = await ContentModel.findOne({ key: 'site' }).lean().exec();
    return document ? document.content : null;
  }

  async saveContent(content: SiteContent): Promise<SiteContent> {
    await ContentModel.findOneAndUpdate(
      { key: 'site' },
      { $set: { content }, $setOnInsert: { key: 'site' } },
      { upsert: true, new: true, runValidators: true },
    ).exec();
    return content;
  }

  async saveContentIfCurrent(content: SiteContent, previous: SiteContent | null): Promise<boolean> {
    try {
      const result = await ContentModel.updateOne(
        previous
          ? { key: 'site', content: previous }
          : { key: 'site', content: { $exists: false } },
        { $set: { content }, $setOnInsert: { key: 'site' } },
        { upsert: !previous, runValidators: true },
      ).exec();
      return result.matchedCount === 1 || result.upsertedCount === 1;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
        return false;
      throw error;
    }
  }

  async seedIfAbsent(content: SiteContent): Promise<void> {
    await ContentModel.updateOne(
      { key: 'site' },
      { $setOnInsert: { key: 'site', content } },
      { upsert: true, runValidators: true },
    ).exec();
  }

  async createContact(contact: ContactInput): Promise<void> {
    await ContactModel.create(contact);
  }
}
