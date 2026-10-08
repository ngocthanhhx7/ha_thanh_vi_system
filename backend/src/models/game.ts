import mongoose, { Schema } from 'mongoose';
import type { GameData } from '../services/gameRules.js';
const stateSchema = new Schema(
  {
    _id: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    revision: { type: Number, default: 0 },
  },
  { timestamps: true },
);
const stockSchema = new Schema({ _id: String, issued: { type: Number, default: 0 } });
const receiptSchema = new Schema(
  { userId: String, key: String, result: Schema.Types.Mixed },
  { timestamps: true },
);
receiptSchema.index({ userId: 1, key: 1 }, { unique: true });
export const GameState = mongoose.model<{ _id: string; data: GameData }>('GameState', stateSchema);
export const GameStock = mongoose.model('GameStock', stockSchema);
export const GameReceipt = mongoose.model('GameReceipt', receiptSchema);
