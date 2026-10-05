import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

export const chatHandoffStatuses = ['waiting', 'assigned', 'resolved'] as const;

const chatMessageSchema = new Schema(
  {
    sender: { type: String, enum: ['customer', 'assistant', 'staff', 'system'], required: true },
    content: { type: String, required: true, maxlength: 2000 },
    authorId: String,
    authorName: String,
    createdAt: { type: Date, default: Date.now, required: true },
  },
  { versionKey: false },
);
const auditEventSchema = new Schema(
  {
    action: {
      type: String,
      enum: ['created', 'customer_message', 'claimed', 'staff_message', 'resolved'],
      required: true,
    },
    actorId: String,
    actorName: String,
    actorRole: {
      type: String,
      enum: ['guest', 'customer', 'staff', 'admin', 'system'],
      required: true,
    },
    occurredAt: { type: Date, default: Date.now, required: true },
  },
  { versionKey: false },
);

const chatHandoffSchema = new Schema(
  {
    accessTokenHash: { type: String, required: true, unique: true, select: false },
    guestAccessExpiresAt: Date,
    ownerUserId: { type: String, index: true },
    activeOwnerUserId: String,
    status: { type: String, enum: chatHandoffStatuses, default: 'waiting', required: true },
    assignedStaffId: String,
    assignedStaffName: String,
    assignedAt: Date,
    resolvedAt: Date,
    messages: { type: [chatMessageSchema], default: [] },
    auditTrail: { type: [auditEventSchema], default: [] },
    lastMessageAt: { type: Date, default: Date.now, required: true },
    lastMessagePreview: { type: String, default: '' },
    staffUnreadCount: { type: Number, default: 1, min: 0 },
    customerUnreadCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false, collection: 'chat_handoffs' },
);

chatHandoffSchema.index({ status: 1, lastMessageAt: 1 });
chatHandoffSchema.index({ status: 1, staffUnreadCount: 1 });
chatHandoffSchema.index({ assignedStaffId: 1, status: 1, lastMessageAt: -1 });
chatHandoffSchema.index({ ownerUserId: 1, status: 1, lastMessageAt: -1 });
chatHandoffSchema.index(
  { activeOwnerUserId: 1 },
  { unique: true, partialFilterExpression: { activeOwnerUserId: { $type: 'string' } } },
);

export type ChatHandoffRecord = InferSchemaType<typeof chatHandoffSchema>;
export const ChatHandoff =
  (mongoose.models.ChatHandoff as Model<ChatHandoffRecord> | undefined) ??
  mongoose.model<ChatHandoffRecord>('ChatHandoff', chatHandoffSchema);
