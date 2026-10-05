import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const accountAppealSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'CustomerUser' },
    userName: { type: String, required: true },
    userEmail: { type: String, required: true },
    message: { type: String, required: true, maxlength: 1500 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'CustomerUser' },
    reviewedByName: String,
    reviewedByEmail: String,
    reviewNote: { type: String, maxlength: 1000 },
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: Date,
  },
  { timestamps: true, versionKey: false, collection: 'account_appeals' },
);

accountAppealSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);
accountAppealSchema.index({ status: 1, submittedAt: 1 });

const accountAuditChangeSchema = new Schema(
  {
    field: { type: String, required: true },
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
  },
  { _id: false },
);

const accountAuditSchema = new Schema(
  {
    actorUserId: { type: Schema.Types.ObjectId, required: true, ref: 'CustomerUser' },
    actorName: { type: String, required: true },
    actorEmail: { type: String, required: true },
    actorIp: String,
    actorUserAgent: { type: String, maxlength: 512 },
    targetUserId: { type: Schema.Types.ObjectId, required: true, ref: 'CustomerUser' },
    targetName: { type: String, required: true },
    targetEmail: { type: String, required: true },
    action: { type: String, required: true },
    changes: { type: [accountAuditChangeSchema], default: [] },
    reason: { type: String, maxlength: 1500 },
    details: Schema.Types.Mixed,
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    collection: 'account_audit_logs',
  },
);

accountAuditSchema.index({ targetUserId: 1, createdAt: -1 });
accountAuditSchema.index({ actorUserId: 1, createdAt: -1 });

const modelFor = <T>(name: string, schema: Schema<T>): Model<T> =>
  (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema);

export const CustomerAccountAppeal = modelFor<InferSchemaType<typeof accountAppealSchema>>(
  'CustomerAccountAppeal',
  accountAppealSchema,
);
export const CustomerAccountAudit = modelFor<InferSchemaType<typeof accountAuditSchema>>(
  'CustomerAccountAudit',
  accountAuditSchema,
);
