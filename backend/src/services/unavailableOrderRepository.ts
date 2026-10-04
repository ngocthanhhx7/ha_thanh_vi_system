import type { OrderRecord } from '../models/order.js';
import type { OrderRepository } from './orderRepository.js';

export class UnavailableOrderRepository implements OrderRepository {
  readonly available = false;

  private unavailable(): never {
    throw new Error('Order storage is unavailable.');
  }

  async create(): Promise<OrderRecord> {
    return this.unavailable();
  }
  async findById(): Promise<OrderRecord | null> {
    return this.unavailable();
  }
  async findByIdempotencyKey(): Promise<OrderRecord | null> {
    return this.unavailable();
  }
  async findByOrderCode(): Promise<OrderRecord | null> {
    return this.unavailable();
  }
  async reserveOrderCode(): Promise<number> {
    return this.unavailable();
  }
  async updateById(): Promise<OrderRecord | null> {
    return this.unavailable();
  }
  async list(): Promise<{ orders: OrderRecord[]; total: number }> {
    return this.unavailable();
  }
  async listByUser(): Promise<OrderRecord[]> {
    return this.unavailable();
  }
  async findByIdForUser(): Promise<OrderRecord | null> {
    return this.unavailable();
  }
  async markPaymentException(): Promise<void> {
    return this.unavailable();
  }
  async findExpiredPayOsOrders(): Promise<OrderRecord[]> {
    return this.unavailable();
  }
}
