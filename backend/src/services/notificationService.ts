import mongoose from 'mongoose';
import { CustomerUser } from '../models/customer.js';
import { Notification } from '../models/operations.js';
import type { Role } from './customerRepository.js';

export type NotificationCategory = 'order' | 'support' | 'account' | 'system';
export type NotificationInput = {
  category: NotificationCategory;
  title: string;
  message: string;
  href: string;
  eventKey: string;
};

export class NotificationService {
  async safeUser(userId: string, input: NotificationInput) {
    try {
      await this.user(userId, input);
    } catch {
      process.stderr.write('User notification could not be persisted.\n');
    }
  }

  async safeRoles(roles: Role[], input: NotificationInput) {
    try {
      await this.roles(roles, input);
    } catch {
      process.stderr.write('Role notification could not be persisted.\n');
    }
  }

  async user(userId: string, input: NotificationInput) {
    if (!mongoose.isValidObjectId(userId)) return;
    await Notification.updateOne(
      { userId, eventKey: input.eventKey },
      { $setOnInsert: { userId, ...input } },
      { upsert: true },
    );
  }

  async roles(roles: Role[], input: NotificationInput) {
    const recipients = await CustomerUser.find({
      role: { $in: roles },
      accountStatus: { $ne: 'suspended' },
      ...(roles.includes('customer')
        ? { $or: [{ emailVerification: { $exists: false } }, { verifiedAt: { $ne: null } }] }
        : {}),
    })
      .select('_id')
      .lean();
    if (!recipients.length) return;
    await Notification.bulkWrite(
      recipients.map(({ _id }) => ({
        updateOne: {
          filter: { userId: _id, eventKey: input.eventKey },
          update: { $setOnInsert: { userId: _id, ...input } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
}

export const notificationService = new NotificationService();
