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
  shuffledBoard,
} from './gameRules.js';
export type GameAction =
  | { kind: 'state' }
  | { kind: 'enter' }
  | { kind: 'visit'; page: 'products' | 'about' }
  | { kind: 'presence'; token?: string }
  | { kind: 'flip'; index: number; requestId: string }
  | { kind: 'memoryReward'; round: number }
  | { kind: 'draw'; requestId: string }
  | { kind: 'redeem'; tier: 9 | 10 };
export class GameService {
  constructor(private readonly random: (max: number) => number = randomInt) {}
  async act(userId: string, action: GameAction, now = Date.now()) {
    if (mongoose.connection.readyState !== 1)
      throw new CustomerError(503, 'Trò chơi tạm thời chưa sẵn sàng.');
    if (action.kind === 'state') {
      const existing = await GameState.findById(userId).lean();
      const data = existing?.data || newGame(now);
      refreshGame(data, now);
      const stock = await GameStock.findById('banh-cha').lean();
      return { state: publicGame(data, stock?.issued || 0) };
    }
    const drawRoll =
      action.kind === 'draw'
        ? { ordinary: INGREDIENTS[this.random(INGREDIENTS.length)], rare: this.random(100) < 5 }
        : null;
    // Unique account/stock records exist before opening a transaction, including first-visit races.
    try {
      await GameState.updateOne(
        { _id: userId },
        { $setOnInsert: { data: newGame(now) } },
        { upsert: true },
      );
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
    try {
      await GameStock.updateOne(
        { _id: 'banh-cha' },
        { $setOnInsert: { issued: 0 } },
        { upsert: true },
      );
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
    const key =
      action.kind === 'flip' || action.kind === 'draw'
        ? `${action.kind}:${action.requestId}`
        : action.kind === 'memoryReward'
          ? `memory:${action.round}`
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
        if (!doc) throw new CustomerError(503, 'Không tìm thấy tiến độ.');
        const data = doc.data;
        refreshGame(data, now);
        const receipt = key
          ? await GameReceipt.findOne({ userId, key }).session(session).lean()
          : null;
        const extra: Record<string, unknown> = receipt?.result || {};
        let rewardTier: 'memory' | 9 | 10 | undefined;
        if (!receipt) {
          switch (action.kind) {
            case 'enter':
              enterGame(data, now);
              break;
            case 'visit':
              if (!data[action.page]) {
                data[action.page] = true;
                data.attempts++;
              }
              break;
            case 'presence':
              presence(data, action.token, now);
              extra.token = data.presenceToken;
              break;
            case 'flip':
              flipCard(data, action.index, now);
              break;
            case 'memoryReward':
              if (action.round !== data.round || data.matched.length !== 20)
                throw new CustomerError(409, 'Hoàn thành bàn thẻ trước khi nhận thưởng.');
              rewardTier = 'memory';
              data.round++;
              data.board = shuffledBoard();
              data.matched = [];
              data.firstIndex = null;
              data.mismatch = [];
              data.mismatchUntil = 0;
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
                ? 'Lật thẻ làm bánh · giảm 30.000đ'
                : rewardTier === 9
                  ? 'Bộ 9 nguyên liệu · giảm 30.000đ'
                  : 'Bộ 10 thẻ · giảm 50% tối đa 100.000đ';
            const [voucher] = await CustomerVoucher.create(
              [
                {
                  code,
                  name,
                  type: rewardTier === 10 ? 'percent' : 'fixed',
                  value: rewardTier === 10 ? 50 : 30000,
                  maxDiscount: rewardTier === 10 ? 100000 : 0,
                  minOrder: 0,
                  startsAt: new Date(now),
                  expiresAt: new Date(now + 30 * 86400000),
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
        result = { state: publicGame(data, stock?.issued || 0), ...extra };
      });
    } finally {
      await session.endSession();
    }
    return result;
  }
}
