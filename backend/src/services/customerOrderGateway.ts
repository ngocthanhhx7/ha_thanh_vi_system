import type { CustomerOrderGateway, CustomerOrder } from './customerRules.js';
import type { CommerceService } from './commerceService.js';
import { publicOrder } from '../utils/orderViews.js';

export function createCommerceCustomerOrderGateway(
  commerce: CommerceService,
): CustomerOrderGateway {
  return {
    async listByUser(userId: string): Promise<CustomerOrder[]> {
      const orders = await commerce.listByUser(userId);
      return orders.map((order) => ({
        ...publicOrder(order),
        userId: order.userId,
        items: order.items,
      }));
    },
    async findById(id: string): Promise<CustomerOrder | null> {
      const order = await commerce.findByIdForCustomerModule(id);
      return order ? { ...publicOrder(order), userId: order.userId, items: order.items } : null;
    },
    requestReturn: (id, userId) => commerce.requestReturn(id, userId),
  };
}
