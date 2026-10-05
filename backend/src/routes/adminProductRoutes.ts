import express, { Router, type RequestHandler } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { OrderModel } from '../models/order.js';
import { CustomerUser } from '../models/customer.js';
import type { ContentService } from '../services/contentService.js';
import { saveProductImage } from '../services/productImageService.js';
import { ServiceError } from '../services/errors.js';

export function createAdminProductRouter(
  content: ContentService,
  adminAuth: RequestHandler,
  limiter: RequestHandler,
) {
  const router = Router();
  router.use('/admin/products', limiter, adminAuth);
  router.get('/admin/products', async (_req, res, next) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).max(100000).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(25),
          q: z.string().trim().max(120).default(''),
          category: z.string().trim().max(100).optional(),
          sort: z.enum(['name', 'price', 'category']).default('name'),
          direction: z.enum(['asc', 'desc']).default('asc'),
        })
        .safeParse(_req.query);
      if (!query.success) throw new ServiceError(400, 'Bộ lọc sản phẩm không hợp lệ.');
      const { page, limit, q, category, sort, direction } = query.data;
      let products = (await content.getPublicContent()).products;
      if (category) products = products.filter((product) => product.category === category);
      if (q) {
        const normalized = q.toLocaleLowerCase('vi-VN');
        products = products.filter((product) =>
          [product.name, product.id, product.slug, product.category, product.flavor]
            .join(' ')
            .toLocaleLowerCase('vi-VN')
            .includes(normalized),
        );
      }
      products = [...products].sort((left, right) => {
        const compared =
          sort === 'price'
            ? (left.price ?? -1) - (right.price ?? -1)
            : String(left[sort]).localeCompare(String(right[sort]), 'vi', {
                sensitivity: 'base',
                numeric: true,
              });
        return (direction === 'asc' ? compared : -compared) || left.id.localeCompare(right.id);
      });
      const total = products.length;
      if (page !== undefined) {
        const offset = (page - 1) * limit;
        products = products.slice(offset, offset + limit);
      }
      res.json({ products, total, ...(page === undefined ? {} : { page, limit }) });
    } catch (error) {
      next(error);
    }
  });
  router.get('/admin/products/:id', async (req, res, next) => {
    try {
      const product = (await content.getPublicContent()).products.find(
        (item) => item.id === req.params.id,
      );
      if (!product) throw new ServiceError(404, 'Không tìm thấy sản phẩm.');
      res.json(product);
    } catch (error) {
      next(error);
    }
  });
  router.post('/admin/products', async (req, res, next) => {
    try {
      res.status(201).json(await content.mutateProduct(undefined, req.body, 'create'));
    } catch (error) {
      next(error);
    }
  });
  router.patch('/admin/products/:id', async (req, res, next) => {
    try {
      res.json(await content.mutateProduct(String(req.params.id), req.body, 'update'));
    } catch (error) {
      next(error);
    }
  });
  router.delete('/admin/products/:id', async (req, res, next) => {
    try {
      await content.mutateProduct(String(req.params.id), undefined, 'delete');
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });
  router.post(
    '/admin/uploads',
    limiter,
    adminAuth,
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }),
    async (req, res, next) => {
      try {
        if (!Buffer.isBuffer(req.body))
          throw new ServiceError(415, 'Chọn ảnh JPEG, PNG hoặc WebP.');
        res.status(201).json(await saveProductImage(req.body));
      } catch (error) {
        next(error);
      }
    },
  );
  router.get('/admin/statistics', limiter, adminAuth, async (req, res, next) => {
    try {
      if (mongoose.connection.readyState !== 1)
        throw new ServiceError(503, 'Chưa thể tải thống kê từ cơ sở dữ liệu.');
      const from = dateBoundary(req.query.from, false);
      const to = dateBoundary(req.query.to, true);
      if (from && to && from >= to) throw new ServiceError(400, 'Khoảng ngày không hợp lệ.');
      const match =
        from || to
          ? { createdAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) } }
          : {};
      const result = await OrderModel.aggregate([
        { $match: match },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  orders: { $sum: 1 },
                  delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
                  pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
                  totalCollected: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $eq: ['$paymentStatus', 'paid'] },
                            { $not: [{ $in: ['$status', ['cancelled', 'returned']] }] },
                          ],
                        },
                        '$total',
                        0,
                      ],
                    },
                  },
                },
              },
            ],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } },
              { $project: { _id: 0, status: '$_id', count: 1 } },
            ],
            topProducts: [
              { $match: { paymentStatus: 'paid', status: { $nin: ['cancelled', 'returned'] } } },
              { $unwind: '$items' },
              {
                $group: {
                  _id: '$items.productId',
                  name: { $last: '$items.name' },
                  quantity: { $sum: '$items.quantity' },
                  revenue: { $sum: { $multiply: ['$items.quantity', '$items.unitPrice'] } },
                },
              },
              { $sort: { quantity: -1 } },
              { $limit: 10 },
              { $project: { _id: 0, productId: '$_id', name: 1, quantity: 1, revenue: 1 } },
            ],
            dailyOrders: [
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m-%d',
                      date: '$createdAt',
                      timezone: 'Asia/Ho_Chi_Minh',
                    },
                  },
                  orders: { $sum: 1 },
                  collected: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $eq: ['$paymentStatus', 'paid'] },
                            { $not: [{ $in: ['$status', ['cancelled', 'returned']] }] },
                          ],
                        },
                        '$total',
                        0,
                      ],
                    },
                  },
                },
              },
              { $sort: { _id: -1 } },
              { $limit: 31 },
              { $sort: { _id: 1 } },
              { $project: { _id: 0, date: '$_id', orders: 1, collected: 1 } },
            ],
          },
        },
      ]).exec();
      const summary = result[0];
      const [customers, current] = await Promise.all([
        CustomerUser.countDocuments({
          role: 'customer',
          $or: [{ emailVerification: { $exists: false } }, { verifiedAt: { $ne: null } }],
        }).exec(),
        content.getPublicContent(),
      ]);
      res.json({
        orders: 0,
        totalCollected: 0,
        delivered: 0,
        pending: 0,
        ...summary?.totals[0],
        _id: undefined,
        byStatus: summary?.byStatus || [],
        topProducts: summary?.topProducts || [],
        dailyOrders: summary?.dailyOrders || [],
        customers,
        products: current.products.length,
      });
    } catch (error) {
      next(error);
    }
  });
  return router;
}

function dateBoundary(value: unknown, end: boolean): Date | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ServiceError(400, 'Ngày phải theo định dạng YYYY-MM-DD.');
  const date = new Date(value + 'T00:00:00+07:00');
  if (
    !Number.isFinite(date.getTime()) ||
    new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10) !== value
  )
    throw new ServiceError(400, 'Ngày không hợp lệ.');
  if (end) date.setTime(date.getTime() + 24 * 60 * 60 * 1000);
  return date;
}
