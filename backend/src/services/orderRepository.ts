import mongoose, { type FilterQuery } from 'mongoose';
import { randomInt } from 'node:crypto';
import type { OrderStatus, PaymentMethod, PaymentStatus } from '../constants/order.js';
import { OrderModel, type NewOrder, type OrderRecord } from '../models/order.js';

export type OrderQueue =
  'needs_action' | 'awaiting_payment' | 'fulfillment' | 'shipping' | 'closed' | 'all';
export type OrderListQuery = {
  q?: string;
  queue?: OrderQueue;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  from?: Date;
  to?: Date;
  sort?: 'priority' | 'oldest' | 'newest' | 'total-desc';
};

export interface OrderRepository {
  readonly available: boolean;
  create(order: NewOrder): Promise<OrderRecord>;
  findById(id: string): Promise<OrderRecord | null>;
  findByIdempotencyKey(key: string): Promise<OrderRecord | null>;
  findByOrderCode(orderCode: number): Promise<OrderRecord | null>;
  reserveOrderCode(): Promise<number>;
  updateById(
    id: string,
    filter: Partial<OrderRecord>,
    update: Partial<OrderRecord>,
  ): Promise<OrderRecord | null>;
  list(
    page: number,
    limit: number,
    query?: OrderListQuery,
  ): Promise<{ orders: OrderRecord[]; total: number }>;
  listByUser(userId: string): Promise<OrderRecord[]>;
  findByIdForUser(id: string, userId: string): Promise<OrderRecord | null>;
  markPaymentException(id: string, message: string): Promise<void>;
  findExpiredPayOsOrders(before: Date, limit: number): Promise<OrderRecord[]>;
}

function fromDocument(
  document: (mongoose.FlattenMaps<OrderRecord> & { _id?: mongoose.Types.ObjectId }) | null,
): OrderRecord | null {
  if (!document) return null;
  const result = document as unknown as OrderRecord & { _id?: mongoose.Types.ObjectId };
  return { ...result, id: result._id?.toString() ?? result.id, userId: result.userId?.toString() };
}

export class MongoOrderRepository implements OrderRepository {
  get available(): boolean {
    return mongoose.connection.readyState === 1;
  }

  private requireAvailable() {
    if (!this.available) throw new Error('Order database unavailable');
  }

  async create(order: NewOrder): Promise<OrderRecord> {
    this.requireAvailable();
    const document = await OrderModel.create(order);
    const result = document.toObject();
    return fromDocument({ ...result, _id: document._id })!;
  }

  async findById(id: string): Promise<OrderRecord | null> {
    this.requireAvailable();
    return fromDocument(await OrderModel.findById(id).lean().exec());
  }

  async findByIdempotencyKey(key: string): Promise<OrderRecord | null> {
    this.requireAvailable();
    return fromDocument(await OrderModel.findOne({ idempotencyKey: key }).lean().exec());
  }

  async findByOrderCode(orderCode: number): Promise<OrderRecord | null> {
    this.requireAvailable();
    return fromDocument(await OrderModel.findOne({ orderCode }).lean().exec());
  }

  async reserveOrderCode(): Promise<number> {
    this.requireAvailable();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const orderCode = randomInt(100_000_000, 1_000_000_000);
      if (!(await OrderModel.exists({ orderCode }).exec())) return orderCode;
    }
    throw new Error('Could not reserve a unique order code.');
  }

  async updateById(
    id: string,
    filter: Partial<OrderRecord>,
    update: Partial<OrderRecord>,
  ): Promise<OrderRecord | null> {
    this.requireAvailable();
    const query: FilterQuery<OrderRecord> = { _id: id, ...filter };
    return fromDocument(
      await OrderModel.findOneAndUpdate(query, { $set: update }, { new: true }).lean().exec(),
    );
  }

  async list(
    page: number,
    limit: number,
    query: OrderListQuery = { queue: 'all', sort: 'newest' },
  ): Promise<{ orders: OrderRecord[]; total: number }> {
    this.requireAvailable();
    const clauses: Record<string, unknown>[] = [];
    if (query.queue === 'needs_action') {
      clauses.push({
        $or: [
          { status: 'return_requested' },
          { paymentStatus: { $in: ['refund_pending', 'failed'] } },
          { payOsException: { $exists: true, $nin: ['', null] } },
          { paymentReviewAt: { $type: 'date' } },
          { status: 'pending', $or: [{ paymentMethod: 'cod' }, { paymentStatus: 'paid' }] },
        ],
      });
    } else if (query.queue === 'awaiting_payment') {
      clauses.push({
        status: 'pending',
        paymentMethod: 'payos',
        paymentStatus: { $in: ['unpaid'] },
        payOsException: { $in: ['', null] },
        paymentReviewAt: { $in: [null] },
      });
    } else if (query.queue === 'fulfillment') {
      clauses.push({ status: 'confirmed' });
    } else if (query.queue === 'shipping') {
      clauses.push({ status: 'shipping' });
    } else if (query.queue === 'closed') {
      clauses.push({ status: { $in: ['delivered', 'cancelled', 'returned'] } });
    }
    if (query.status) clauses.push({ status: query.status });
    if (query.paymentStatus) clauses.push({ paymentStatus: query.paymentStatus });
    if (query.paymentMethod) clauses.push({ paymentMethod: query.paymentMethod });
    if (query.from || query.to) {
      clauses.push({
        createdAt: {
          ...(query.from ? { $gte: query.from } : {}),
          ...(query.to ? { $lte: query.to } : {}),
        },
      });
    }
    const search = query.q?.trim();
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      clauses.push({
        $or: [
          { code: regex },
          { 'customer.name': regex },
          { 'customer.email': regex },
          { 'customer.phone': regex },
          { 'items.name': regex },
        ],
      });
    }
    const filter = clauses.length > 1 ? { $and: clauses } : (clauses[0] ?? {});
    const sort = query.sort ?? 'newest';
    const list = OrderModel.aggregate([
      { $match: filter },
      ...(sort === 'priority'
        ? [
            {
              $addFields: {
                queuePriority: {
                  $switch: {
                    branches: [
                      {
                        case: {
                          $or: [
                            { $eq: ['$status', 'return_requested'] },
                            { $in: ['$paymentStatus', ['refund_pending', 'failed']] },
                            { $and: [{ $ne: [{ $ifNull: ['$payOsException', ''] }, ''] }] },
                            { $eq: [{ $type: '$paymentReviewAt' }, 'date'] },
                          ],
                        },
                        then: 0,
                      },
                      {
                        case: {
                          $and: [
                            { $eq: ['$status', 'pending'] },
                            {
                              $or: [
                                { $eq: ['$paymentMethod', 'cod'] },
                                { $eq: ['$paymentStatus', 'paid'] },
                              ],
                            },
                          ],
                        },
                        then: 1,
                      },
                      { case: { $eq: ['$status', 'confirmed'] }, then: 2 },
                      {
                        case: {
                          $and: [
                            { $eq: ['$status', 'pending'] },
                            { $eq: ['$paymentMethod', 'payos'] },
                            { $eq: ['$paymentStatus', 'unpaid'] },
                          ],
                        },
                        then: 3,
                      },
                      { case: { $eq: ['$status', 'shipping'] }, then: 4 },
                      {
                        case: { $in: ['$status', ['delivered', 'cancelled', 'returned']] },
                        then: 5,
                      },
                    ],
                    default: 6,
                  },
                },
              },
            },
          ]
        : []),
      {
        $sort:
          sort === 'oldest'
            ? { createdAt: 1, _id: 1 }
            : sort === 'total-desc'
              ? { total: -1, createdAt: -1, _id: -1 }
              : sort === 'newest'
                ? { createdAt: -1, _id: -1 }
                : { queuePriority: 1, createdAt: 1, _id: 1 },
      },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]).exec();
    const [documents, total] = await Promise.all([list, OrderModel.countDocuments(filter).exec()]);
    return { orders: documents.map((doc) => fromDocument(doc)!), total };
  }

  async listByUser(userId: string): Promise<OrderRecord[]> {
    this.requireAvailable();
    const documents = await OrderModel.find({ userId }).sort({ createdAt: -1 }).lean().exec();
    return documents.map((doc) => fromDocument(doc)!);
  }

  async findByIdForUser(id: string, userId: string): Promise<OrderRecord | null> {
    this.requireAvailable();
    return fromDocument(await OrderModel.findOne({ _id: id, userId }).lean().exec());
  }

  async markPaymentException(id: string, message: string): Promise<void> {
    this.requireAvailable();
    await OrderModel.updateOne({ _id: id }, { $set: { payOsException: message } }).exec();
  }

  async findExpiredPayOsOrders(before: Date, limit: number): Promise<OrderRecord[]> {
    this.requireAvailable();
    const docs = await OrderModel.find({
      paymentMethod: 'payos',
      paymentStatus: 'unpaid',
      status: { $nin: ['cancelled', 'delivered', 'returned'] },
      createdAt: { $lt: before },
      paymentReviewAt: { $exists: false },
    })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean()
      .exec();
    return docs.map((doc) => fromDocument(doc)!);
  }
}
