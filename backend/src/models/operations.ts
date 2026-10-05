import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'CustomerUser' },
    category: {
      type: String,
      enum: ['order', 'support', 'account', 'system'],
      required: true,
    },
    title: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 300 },
    href: { type: String, required: true, maxlength: 240 },
    eventKey: { type: String, required: true, maxlength: 180 },
    readAt: Date,
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    collection: 'notifications',
  },
);
notificationSchema.index({ userId: 1, eventKey: 1 }, { unique: true });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

const systemLogSchema = new Schema(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: 'CustomerUser' },
    actorName: { type: String, maxlength: 100 },
    actorRole: { type: String, enum: ['customer', 'staff', 'admin'] },
    requestId: { type: String, required: true, maxlength: 80 },
    event: { type: String, required: true, maxlength: 180 },
    outcome: { type: String, enum: ['success', 'failure'], required: true },
    reasonCode: { type: String, maxlength: 40 },
    severity: { type: String, enum: ['info', 'warning', 'error', 'critical'], required: true },
    method: { type: String, required: true, maxlength: 10 },
    path: { type: String, required: true, maxlength: 240 },
    statusCode: { type: Number, required: true },
    actorIp: { type: String, maxlength: 64 },
    actorUserAgent: { type: String, maxlength: 512 },
    targetType: { type: String, maxlength: 40 },
    targetId: { type: String, maxlength: 64 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    collection: 'system_audit_logs',
  },
);
systemLogSchema.index({ createdAt: -1 });
systemLogSchema.index({ severity: 1, createdAt: -1 });
systemLogSchema.index({ actorUserId: 1, createdAt: -1 });
systemLogSchema.index({ event: 1, createdAt: -1 });
systemLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
systemLogSchema.index({ requestId: 1 });

const modelFor = <T>(name: string, schema: Schema<T>): Model<T> =>
  (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema);

export const Notification = modelFor<InferSchemaType<typeof notificationSchema>>(
  'Notification',
  notificationSchema,
);
export const SystemAuditLog = modelFor<InferSchemaType<typeof systemLogSchema>>(
  'SystemAuditLog',
  systemLogSchema,
);
