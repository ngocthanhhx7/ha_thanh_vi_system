import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';
const options = { timestamps: true, versionKey: false as const };
export const addressSchema = new Schema({
  label: String,
  name: String,
  phone: String,
  address: String,
  isDefault: { type: Boolean, default: false },
});
const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: String,
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'staff', 'customer'], default: 'customer' },
    accountStatus: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
    accountStatusReason: { type: String, maxlength: 500 },
    accountStatusChangedAt: Date,
    accountStatusChangedBy: { type: Schema.Types.ObjectId, ref: 'CustomerUser' },
    addresses: { type: [addressSchema], default: [] },
    emailVerification: { type: String, enum: ['required'] },
    verifiedAt: Date,
    authVersion: { type: Number, default: 0 },
    resetTokenHash: { type: String, select: false },
    resetExpiresAt: { type: Date, select: false },
    loginOtpSentAt: { type: Date, select: false },
    loginOtpLease: { type: String, select: false },
    loginOtpLeaseUntil: { type: Date, select: false },
  },
  { ...options, collection: 'users' },
);
const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'CustomerUser', required: true },
    expiresAt: { type: Date, required: true },
    authVersion: { type: Number, default: 0 },
  },
  options,
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const voucherSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    name: String,
    type: { type: String, enum: ['fixed', 'percent'] },
    value: Number,
    minOrder: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: 0 },
    startsAt: Date,
    expiresAt: Date,
    distribution: { type: String, enum: ['automatic', 'code', 'targeted'] },
    totalLimit: Number,
    perUserLimit: Number,
    active: Boolean,
    reservations: {
      type: [
        new Schema(
          {
            orderId: String,
            userId: String,
            state: { type: String, enum: ['reserved', 'used'] },
            createdAt: Date,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  options,
);
voucherSchema.index({ 'reservations.orderId': 1 });
const walletSchema = new Schema(
  {
    userId: { type: String, required: true },
    voucherId: { type: Schema.Types.ObjectId, ref: 'CustomerVoucher', required: true },
    rewardOrderId: { type: String },
    code: String,
    grantSource: { type: String, enum: ['automatic', 'claim', 'admin', 'reward', 'checkout'] },
    grantedBy: { type: String, ref: 'CustomerUser' },
  },
  options,
);
walletSchema.index({ userId: 1, voucherId: 1 }, { unique: true });
walletSchema.index(
  { rewardOrderId: 1 },
  { unique: true, partialFilterExpression: { rewardOrderId: { $type: 'string' } } },
);
const reviewSchema = new Schema(
  {
    userId: String,
    orderId: String,
    productId: { type: String, index: true },
    rating: { type: Number, min: 1, max: 5 },
    comment: String,
    authorName: String,
  },
  options,
);
reviewSchema.index({ userId: 1, orderId: 1, productId: 1 }, { unique: true });
const ticketSchema = new Schema(
  {
    userId: { type: String, index: true },
    orderId: String,
    kind: { type: String, enum: ['support', 'return'] },
    message: String,
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
    replies: {
      type: [
        new Schema(
          { authorName: String, role: String, message: String, createdAt: Date },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  options,
);
ticketSchema.index(
  { userId: 1, orderId: 1, kind: 1 },
  { unique: true, partialFilterExpression: { kind: 'return' } },
);
const modelFor = <T>(name: string, schema: Schema<T>): Model<T> =>
  (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema);
export const CustomerUser = modelFor<InferSchemaType<typeof userSchema>>(
  'CustomerUser',
  userSchema,
);
export const CustomerSession = modelFor<InferSchemaType<typeof sessionSchema>>(
  'CustomerSession',
  sessionSchema,
);
export const CustomerVoucher = modelFor<InferSchemaType<typeof voucherSchema>>(
  'CustomerVoucher',
  voucherSchema,
);
export const CustomerWallet = modelFor<InferSchemaType<typeof walletSchema>>(
  'CustomerWallet',
  walletSchema,
);
export const CustomerReview = modelFor<InferSchemaType<typeof reviewSchema>>(
  'CustomerReview',
  reviewSchema,
);
export const CustomerTicket = modelFor<InferSchemaType<typeof ticketSchema>>(
  'CustomerTicket',
  ticketSchema,
);
