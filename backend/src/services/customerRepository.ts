import mongoose, { Types } from 'mongoose';
import {
  CustomerUser,
  CustomerSession,
  CustomerVoucher,
  CustomerWallet,
  CustomerReview,
  CustomerTicket,
} from '../models/customer.js';
import {
  CustomerError,
  hashPassword,
  hashSessionToken,
  newSessionToken,
} from '../utils/customerSecurity.js';
import { discountFor } from './customerRules.js';

export type Role = 'admin' | 'staff' | 'customer';
export type UserView = { id: string; name: string; email: string; phone: string; role: Role };
export type AddressInput = {
  label: string;
  name: string;
  phone: string;
  address: string;
  isDefault: boolean;
};
type AddressRecord = AddressInput & { _id: Types.ObjectId };
type VoucherRecord = {
  _id: Types.ObjectId;
  code: string;
  name: string;
  type: 'fixed' | 'percent';
  value: number;
  minOrder: number;
  maxDiscount: number;
  startsAt: Date;
  expiresAt: Date;
  distribution: 'automatic' | 'code';
  totalLimit: number;
  perUserLimit: number;
  active: boolean;
  reservations: { orderId: string; userId: string; state: string }[];
};
export const userView = (value: Record<string, unknown>): UserView => ({
  id: String(value._id),
  name: String(value.name),
  email: String(value.email),
  phone: String(value.phone ?? ''),
  role: value.role as Role,
});
export const addressView = (value: AddressRecord) => ({
  id: String(value._id),
  label: value.label,
  name: value.name,
  phone: value.phone,
  address: value.address,
  isDefault: value.isDefault,
});
export const isDuplicate = (error: unknown) =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);

export class CustomerRepository {
  requireAvailable() {
    if (mongoose.connection.readyState !== 1)
      throw new CustomerError(503, 'Tài khoản cần cơ sở dữ liệu MongoDB đang hoạt động.');
  }
  async sessionUser(token: string) {
    this.requireAvailable();
    if (!/^[a-f0-9]{64}$/.test(token)) return undefined;
    const session = await CustomerSession.findOne({
      tokenHash: hashSessionToken(token),
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!session) return undefined;
    const user = await CustomerUser.findById(session.userId).lean();
    return user ? userView(user) : undefined;
  }
  async createSession(userId: string) {
    const token = newSessionToken();
    await CustomerSession.create({
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    });
    return token;
  }
  async deleteSession(token: string) {
    await CustomerSession.deleteOne({ tokenHash: hashSessionToken(token) });
  }
  async addresses(userId: string) {
    const user = await CustomerUser.findById(userId).lean();
    if (!user) throw new CustomerError(401, 'Vui lòng đăng nhập.');
    return (user.addresses as AddressRecord[]).map(addressView);
  }
  async saveAddress(userId: string, input: AddressInput, id?: string) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const user = await CustomerUser.findById(userId).lean();
      if (!user) throw new CustomerError(401, 'Vui lòng đăng nhập.');
      const previous = user.addresses as AddressRecord[];
      const index = id ? previous.findIndex((item) => String(item._id) === id) : -1;
      if (id && index < 0) throw new CustomerError(404, 'Không tìm thấy địa chỉ.');
      if (!id && previous.length >= 10)
        throw new CustomerError(409, 'Sổ địa chỉ tối đa 10 địa chỉ.');
      const address = {
        ...input,
        _id: id ? new Types.ObjectId(id) : new Types.ObjectId(),
        isDefault: input.isDefault || previous.length === 0,
      };
      const next = previous.map((item) => ({
        ...item,
        ...(address.isDefault ? { isDefault: false } : {}),
      }));
      if (id) next[index] = address;
      else next.push(address);
      if (!next.some((item) => item.isDefault)) next[0].isDefault = true;
      const updated = await CustomerUser.updateOne(
        { _id: userId, addresses: previous },
        { $set: { addresses: next } },
      );
      if (updated.modifiedCount)
        return addressView(next.find((item) => String(item._id) === String(address._id))!);
    }
    throw new CustomerError(409, 'Sổ địa chỉ đã thay đổi; vui lòng thử lại.');
  }
  async deleteAddress(userId: string, id: string) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const user = await CustomerUser.findById(userId).lean();
      if (!user) throw new CustomerError(401, 'Vui lòng đăng nhập.');
      const previous = user.addresses as AddressRecord[];
      const next = previous.filter((item) => String(item._id) !== id);
      if (next.length === previous.length) throw new CustomerError(404, 'Không tìm thấy địa chỉ.');
      if (next.length && !next.some((item) => item.isDefault)) next[0].isDefault = true;
      const updated = await CustomerUser.updateOne(
        { _id: userId, addresses: previous },
        { $set: { addresses: next } },
      );
      if (updated.modifiedCount) return;
    }
    throw new CustomerError(409, 'Sổ địa chỉ đã thay đổi; vui lòng thử lại.');
  }
  async wallet(userId: string) {
    const now = new Date();
    const automatic = await CustomerVoucher.find({
      distribution: 'automatic',
      active: true,
      expiresAt: { $gt: now },
    }).lean();
    for (const voucher of automatic)
      await CustomerWallet.updateOne(
        { userId, voucherId: voucher._id },
        { $setOnInsert: { userId, voucherId: voucher._id, code: voucher.code } },
        { upsert: true },
      );
    const entries = await CustomerWallet.find({ userId }).lean();
    const vouchers = await CustomerVoucher.find({
      _id: { $in: entries.map((entry) => entry.voucherId) },
    }).lean();
    return vouchers.map((raw) => {
      const voucher = raw as unknown as VoucherRecord;
      const used =
        voucher.reservations.filter((item) => item.userId === userId).length >=
        voucher.perUserLimit;
      return {
        id: String(voucher._id),
        code: voucher.code,
        name: voucher.name,
        type: voucher.type,
        value: voucher.value,
        minOrder: voucher.minOrder,
        maxDiscount: voucher.maxDiscount,
        startsAt: voucher.startsAt,
        expiresAt: voucher.expiresAt,
        status:
          !voucher.active || voucher.expiresAt <= now ? 'expired' : used ? 'used' : 'available',
      };
    });
  }
  async claim(userId: string, code: string) {
    const voucher = await CustomerVoucher.findOne({
      code,
      active: true,
      startsAt: { $lte: new Date() },
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!voucher) throw new CustomerError(404, 'Voucher không tồn tại hoặc đã hết hạn.');
    if (
      code.startsWith('REVIEW_') &&
      !(await CustomerWallet.exists({ userId, voucherId: voucher._id }))
    )
      throw new CustomerError(404, 'Voucher không tồn tại hoặc đã hết hạn.');
    await CustomerWallet.updateOne(
      { userId, voucherId: voucher._id },
      { $setOnInsert: { userId, voucherId: voucher._id, code } },
      { upsert: true },
    );
    return this.wallet(userId);
  }
  private async validVoucher(code: string, userId: string, subtotal: number) {
    this.requireAvailable();
    const now = new Date();
    const raw = await CustomerVoucher.findOne({
      code,
      active: true,
      startsAt: { $lte: now },
      expiresAt: { $gt: now },
    }).lean();
    if (!raw) throw new CustomerError(409, 'Voucher chưa có hiệu lực hoặc đã hết hạn.');
    const voucher = raw as unknown as VoucherRecord;
    // Reward codes must exist in the owner's wallet; ordinary public codes can be entered directly.
    if (
      code.startsWith('REVIEW_') &&
      !(await CustomerWallet.exists({ userId, voucherId: voucher._id }))
    )
      throw new CustomerError(409, 'Voucher không thuộc tài khoản này.');
    return { voucher, discount: discountFor(voucher, subtotal) };
  }
  async quote(code: string, userId: string, subtotal: number) {
    const { voucher, discount } = await this.validVoucher(code, userId, subtotal);
    if (
      voucher.reservations.length >= voucher.totalLimit ||
      voucher.reservations.filter((item) => item.userId === userId).length >= voucher.perUserLimit
    )
      throw new CustomerError(409, 'Voucher đã hết lượt sử dụng.');
    return { code: voucher.code, discount, subtotal };
  }
  async reserve(code: string, userId: string, subtotal: number, orderId: string) {
    const { voucher, discount } = await this.validVoucher(code, userId, subtotal);
    await CustomerWallet.updateOne(
      { userId, voucherId: voucher._id },
      { $setOnInsert: { userId, voucherId: voucher._id, code } },
      { upsert: true },
    );
    const existing = voucher.reservations.find((item) => item.orderId === orderId);
    if (existing) {
      if (existing.userId !== userId)
        throw new CustomerError(409, 'Không thể sử dụng mã đặt hàng này.');
      return { code, discount };
    }
    const now = new Date();
    const updated = await CustomerVoucher.findOneAndUpdate(
      {
        _id: voucher._id,
        active: true,
        startsAt: { $lte: now },
        expiresAt: { $gt: now },
        'reservations.orderId': { $ne: orderId },
        $expr: {
          $and: [
            { $lt: [{ $size: '$reservations' }, '$totalLimit'] },
            {
              $lt: [
                {
                  $size: {
                    $filter: {
                      input: '$reservations',
                      as: 'reservation',
                      cond: { $eq: ['$$reservation.userId', userId] },
                    },
                  },
                },
                '$perUserLimit',
              ],
            },
          ],
        },
      },
      { $push: { reservations: { orderId, userId, state: 'reserved', createdAt: now } } },
      { new: true },
    ).lean();
    if (!updated) {
      const replay = await CustomerVoucher.exists({
        _id: voucher._id,
        reservations: { $elemMatch: { orderId, userId } },
      });
      if (!replay) throw new CustomerError(409, 'Voucher đã hết lượt sử dụng.');
    }
    return { code, discount };
  }
  async release(orderId: string) {
    await CustomerVoucher.updateMany(
      {},
      { $pull: { reservations: { orderId, state: 'reserved' } } },
    );
  }
  async settle(orderId: string) {
    await CustomerVoucher.updateOne(
      { 'reservations.orderId': orderId },
      { $set: { 'reservations.$.state': 'used' } },
    );
  }
  async reviewReward(userId: string, orderId: string) {
    const existing = await CustomerWallet.findOne({ rewardOrderId: orderId }).lean();
    if (existing) return;
    const code = `REVIEW_${orderId.toUpperCase()}`;
    const now = new Date();
    const voucher = await CustomerVoucher.findOneAndUpdate(
      { code },
      {
        $setOnInsert: {
          code,
          name: 'Cảm ơn đánh giá của bạn',
          type: 'fixed',
          value: 20000,
          minOrder: 149000,
          maxDiscount: 20000,
          startsAt: now,
          expiresAt: new Date(now.getTime() + 30 * 86400000),
          distribution: 'code',
          totalLimit: 1,
          perUserLimit: 1,
          active: true,
          reservations: [],
        },
      },
      { upsert: true, new: true },
    ).lean();
    if (voucher)
      await CustomerWallet.updateOne(
        { rewardOrderId: orderId },
        { $setOnInsert: { rewardOrderId: orderId, userId, voucherId: voucher._id, code } },
        { upsert: true },
      );
  }
}

export async function bootstrapAdmin(env: NodeJS.ProcessEnv = process.env) {
  if (!env.ADMIN_EMAIL && !env.ADMIN_PASSWORD) return;
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password ||
    password.length < 10 ||
    password.length > 128
  )
    throw new Error('ADMIN_EMAIL và ADMIN_PASSWORD (10–128 ký tự) phải được cấu hình cùng nhau.');
  const current = await CustomerUser.findOne({ email }).lean();
  if (current) {
    if (current.role !== 'admin') throw new Error('Email bootstrap đã thuộc tài khoản khác.');
    return;
  }
  await CustomerUser.create({
    name: env.ADMIN_NAME?.trim() || 'Ngọc Thành',
    email,
    phone: env.ADMIN_PHONE?.trim() || '',
    role: 'admin',
    passwordHash: await hashPassword(password),
  });
}

export async function initializeCustomerIndexes() {
  await Promise.all(
    [
      CustomerUser,
      CustomerSession,
      CustomerVoucher,
      CustomerWallet,
      CustomerReview,
      CustomerTicket,
    ].map((model) => model.init()),
  );
}
