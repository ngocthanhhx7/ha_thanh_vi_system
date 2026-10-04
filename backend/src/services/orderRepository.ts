import mongoose, { type FilterQuery } from 'mongoose';
import { randomInt } from 'node:crypto';
import { OrderModel, type NewOrder, type OrderRecord } from '../models/order.js';

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
  list(page: number, limit: number): Promise<{ orders: OrderRecord[]; total: number }>;
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

  async list(page: number, limit: number): Promise<{ orders: OrderRecord[]; total: number }> {
    this.requireAvailable();
    const [documents, total] = await Promise.all([
      OrderModel.find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      OrderModel.countDocuments().exec(),
    ]);
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
