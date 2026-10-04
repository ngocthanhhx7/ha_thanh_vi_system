import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import type { OrderStatus, PaymentMethod, PaymentStatus } from '../constants/order.js';

export type OrderItem = { productId: string; name: string; quantity: number; unitPrice: number };
export type OrderCustomer = { name: string; email: string; phone: string; address: string };
export type ShippingEvent = {
  status: string;
  description: string;
  message: string;
  location?: string;
  occurredAt: Date;
  createdAt: Date;
};

export type OrderRecord = {
  id: string;
  _id?: mongoose.Types.ObjectId;
  code: string;
  items: OrderItem[];
  subtotal: number;
  shippingFee: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  createdAt: Date;
  updatedAt: Date;
  customer: OrderCustomer;
  note: string;
  accessTokenHash: string;
  idempotencyKey: string;
  payloadHash: string;
  orderCode: number;
  paymentUrl?: string;
  paymentLinkId?: string;
  payOsException?: string;
  paymentReviewAt?: Date | null;
  trackingNumber?: string;
  userId?: string;
  discount?: number;
  voucherCode?: string;
  voucherReservationId?: string;
  carrier?: string;
  shippingEvents?: ShippingEvent[];
};

export type NewOrder = Omit<OrderRecord, 'id' | '_id' | 'createdAt' | 'updatedAt'>;
export type OrderDocument = HydratedDocument<OrderRecord>;

const orderSchema = new Schema<OrderRecord>(
  {
    code: { type: String, required: true, unique: true },
    items: [
      {
        productId: { type: String, required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1, max: 99 },
        unitPrice: { type: Number, required: true, min: 0 },
      },
    ],
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      required: true,
      enum: [
        'pending',
        'confirmed',
        'shipping',
        'delivered',
        'cancelled',
        'return_requested',
        'returned',
      ],
      default: 'pending',
    },
    paymentStatus: {
      type: String,
      required: true,
      enum: ['unpaid', 'paid', 'failed', 'refund_pending', 'refunded'],
      default: 'unpaid',
    },
    paymentMethod: { type: String, required: true, enum: ['cod', 'payos'] },
    customer: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: String, required: true },
    },
    note: { type: String, default: '', maxlength: 1000 },
    accessTokenHash: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    payloadHash: { type: String, required: true },
    orderCode: { type: Number, required: true, unique: true, min: 1 },
    paymentUrl: { type: String },
    paymentLinkId: { type: String },
    payOsException: { type: String },
    paymentReviewAt: { type: Date },
    trackingNumber: { type: String },
    userId: { type: Schema.Types.ObjectId, index: true, ref: 'CustomerUser' },
    discount: { type: Number, min: 0 },
    voucherCode: String,
    voucherReservationId: String,
    carrier: String,
    shippingEvents: [
      {
        status: String,
        description: String,
        message: String,
        location: String,
        occurredAt: Date,
        createdAt: Date,
      },
    ],
  },
  { timestamps: true, versionKey: false },
);

orderSchema.index({ idempotencyKey: 1 }, { unique: true });
orderSchema.index({ status: 1, paymentMethod: 1, paymentStatus: 1, createdAt: 1 });

export const OrderModel: Model<OrderRecord> =
  (mongoose.models.Order as Model<OrderRecord>) ??
  mongoose.model<OrderRecord>('Order', orderSchema);
