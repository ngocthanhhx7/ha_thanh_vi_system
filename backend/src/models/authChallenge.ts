import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';
const challengeSchema = new Schema(
  {
    idHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    kind: { type: String, enum: ['email', 'login', 'appeal_access'], required: true },
    codeHash: String,
    authVersion: { type: Number, required: true },
    rememberDevice: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
    active: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
    sentAt: Date,
    lease: String,
    leaseUntil: Date,
  },
  { timestamps: true },
);
challengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const trustedSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    authVersion: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
trustedSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AuthChallenge =
  (mongoose.models.AuthChallenge as Model<InferSchemaType<typeof challengeSchema>>) ??
  mongoose.model('AuthChallenge', challengeSchema);
export const TrustedDevice =
  (mongoose.models.TrustedDevice as Model<InferSchemaType<typeof trustedSchema>>) ??
  mongoose.model('TrustedDevice', trustedSchema);
