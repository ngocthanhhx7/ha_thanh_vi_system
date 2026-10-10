import mongoose from 'mongoose';
import { randomInt, randomUUID } from 'node:crypto';
import { GameState, GameStock, GameReceipt } from '../models/game.js';
import { CustomerVoucher, CustomerWallet } from '../models/customer.js';
import { notificationService } from './notificationService.js';
import { CustomerError } from '../utils/customerSecurity.js';
import {
  INGREDIENTS,
  newGame,
  enterGame,
  refreshGame,
  publicGame,
  flipCard,
  presence,
  consumeCollection,
} from './gameRules.js';
import { startMemory, redeemMemory } from './memoryRules.js';
export type GameAction =
  | { kind: 'state' }
  | { kind: 'enter' }
  | { kind: 'visit'; page: 'products' | 'about' }
  | { kind: 'presence'; token?: string }
  | { kind: 'startMemory'; round: number; requestId: string }
  | { kind: 'flip'; index: number; requestId: string; round: number }
  | { kind: 'redeemMemory'; requestId: string }
  | { kind: 'memoryReward'; round: number }
  | { kind: 'draw'; requestId: string }
  | { kind: 'redeem'; tier: 9 | 10 };
export class GameService {
  constructor(private readonly random: (max: number) => number = randomInt) {}
  async act(userId: string, action: GameAction, at?: number) {
    const now = at ?? Date.now();
    if (action.kind === 'memoryReward')
      throw new CustomerError(
        409,
        'Game lật thẻ đã chuyển sang tích điểm. Vui lòng tải lại trang.',
      );
    if (mongoose.connection.readyState !== 1)
      throw new CustomerError(503, 'Trò chơi tạm thời chưa sẵn sàng.');
    if (action.kind === 'state') {
      const [existing, stock] = await Promise.all([
        GameState.findById(userId).lean(),
        GameStock.findById('banh-cha').lean(),
      ]);
      const data = existing?.data || newGame(now);
      const readNow = at ?? Date.now();
      refreshGame(data, readNow);
      return { state: publicGame(data, stock?.issued || 0, readNow) };
    }
    const drawRoll =
      action.kind === 'draw'
        ? { ordinary: INGREDIENTS[this.random(INGREDIENTS.length)], rare: this.random(100) < 5 }
        : null;
    // Only entry/visit actions may create progress. A flip cannot exist before entry;
    // avoiding these upserts removes two network round trips from every card reveal.
    if (action.kind === 'enter' || action.kind === 'visit' || action.kind === 'presence') {
      try {
        await GameState.updateOne(
          { _id: userId },
          { $setOnInsert: { data: newGame(now) } },
          { upsert: true },
        );
      } catch (e) {
        if ((e as { code?: number }).code !== 11000) throw e;
      }
    }
    // Initialize the scarce-card counter only for an actual rare candidate. The
    // conditional increment remains inside the draw transaction and never resets it.
    if (drawRoll?.rare) {
      try {
        await GameStock.updateOne(
          { _id: 'banh-cha' },
          { $setOnInsert: { issued: 0 } },
          { upsert: true },
        );
      } catch (e) {
        if ((e as { code?: number }).code !== 11000) throw e;
      }
    }
    const key =
      action.kind === 'flip' ||
      action.kind === 'draw' ||
      action.kind === 'startMemory' ||
      action.kind === 'redeemMemory'
        ? `${action.kind}:${action.requestId}`
        : action.kind === 'redeem'
          ? `redeem:${action.tier}`
          : undefined;
    const session = await mongoose.startSession();
    let result: Record<string, unknown> = {};
    try {
      await session.withTransaction(async () => {
        const doc = await GameState.findOneAndUpdate(
          { _id: userId },
          { $inc: { revision: 1 } },
          { session, new: true },
        );
        if (!doc)
          throw new CustomerError(409, 'Vui lòng vào trò chơi trước khi thực hiện thao tác.');
        const data = doc.data;
        const receipt = key
          ? await GameReceipt.findOne({ userId, key }).session(session).lean()
          : null;
        // Retry callbacks may run well after request arrival. Evaluate deadlines,
        // point expiry and the Vietnam day after obtaining the serialized state.
        const actionNow = at ?? Date.now();
        refreshGame(data, actionNow);
        const extra: Record<string, unknown> = receipt?.result || {};
        let rewardTier: 'memory' | 9 | 10 | undefined;
        let rewardPoints = 0;
        if (!receipt) {
          switch (action.kind) {
            case 'enter':
              enterGame(data, actionNow);
              break;
            case 'visit':
              // Legacy clients may still send visits, but pair-attempt grants are retired.
              break;
            case 'presence':
              presence(data, action.token, actionNow);
              extra.token = data.presenceToken;
              break;
            case 'startMemory':
              startMemory(data, action.round, actionNow);
              break;
            case 'flip':
              if (action.round !== data.round)
                throw new CustomerError(409, 'Ván đã thay đổi. Tải lại tiến độ.');
              flipCard(data, action.index, actionNow);
              if (data.memoryProgress?.status === 'won')
                extra.pointsAwarded = data.memoryProgress.lastPoints;
              break;
            case 'redeemMemory':
              rewardPoints = redeemMemory(data, actionNow);
              rewardTier = 'memory';
              break;
            case 'draw': {
              if (data.draws < 1) throw new CustomerError(409, 'Bạn đã hết lượt rút hôm nay.');
              data.draws--;
              let card: string = drawRoll!.ordinary;
              if (!data.rareEver && drawRoll!.rare) {
                const stock = await GameStock.findOneAndUpdate(
                  { _id: 'banh-cha', issued: { $lt: 10 } },
                  { $inc: { issued: 1 } },
                  { session, new: true },
                );
                if (stock) {
                  card = 'banh-cha';
                  data.rareEver = true;
                }
              }
              data.inventory[card] = (data.inventory[card] || 0) + 1;
              extra.card = card;
              break;
            }
            case 'redeem':
              consumeCollection(data, action.tier);
              rewardTier = action.tier;
              break;
          }
          if (rewardTier) {
            const code = `HTVG${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
            const name =
              rewardTier === 'memory'
                ? `Lật thẻ · ${rewardPoints.toLocaleString('vi-VN')}đ · tối đa 10% đơn`
                : rewardTier === 9
                  ? 'Bộ 9 nguyên liệu · giảm 30.000đ'
                  : 'Bộ 10 thẻ · giảm 50% tối đa 100.000đ';
            const [voucher] = await CustomerVoucher.create(
              [
                {
                  code,
                  name,
                  type: rewardTier === 10 ? 'percent' : 'fixed',
                  value: rewardTier === 'memory' ? rewardPoints : rewardTier === 10 ? 50 : 30000,
                  maxDiscount: rewardTier === 10 ? 100000 : 0,
                  ...(rewardTier === 'memory' ? { orderPercentCap: 10 } : {}),
                  minOrder: 0,
                  startsAt: new Date(actionNow),
                  expiresAt: new Date(actionNow + 30 * 86400000),
                  distribution: 'targeted',
                  totalLimit: 1,
                  perUserLimit: 1,
                  active: true,
                },
              ],
              { session },
            );
            await CustomerWallet.create(
              [
                {
                  userId,
                  voucherId: voucher._id,
                  code,
                  grantSource: 'reward',
                  rewardOrderId: `game:${userId}:${key}`,
                },
              ],
              { session },
            );
            await notificationService.user(
              userId,
              {
                eventKey: `game:${key}`,
                category: 'system',
                title: 'Bạn vừa nhận được ưu đãi',
                message: `${name} · Mã ${code}`,
                href: '/tai-khoan?section=vouchers',
              },
              session,
            );
            extra.reward = { code, name };
          }
          if (key) await GameReceipt.create([{ userId, key, result: extra }], { session });
        }
        doc.markModified('data');
        await doc.save({ session });
        const stock = await GameStock.findById('banh-cha').session(session).lean();
        result = { state: publicGame(data, stock?.issued || 0, at ?? Date.now()), ...extra };
      });
    } finally {
      await session.endSession();
    }
    return result;
  }
}
