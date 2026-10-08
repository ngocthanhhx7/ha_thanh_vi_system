import { randomInt, randomUUID } from 'node:crypto';
import { CustomerError } from '../utils/customerSecurity.js';
export const INGREDIENTS = [
  'flour',
  'sticky-rice',
  'sugar',
  'oil',
  'lime-leaf',
  'salted-egg',
  'lard',
  'matcha',
  'cacao',
] as const;
export const CARDS = [...INGREDIENTS, 'banh-cha'];
export type GameData = {
  day: string;
  welcome: boolean;
  enteredDay: string;
  attempts: number;
  round: number;
  board: string[];
  matched: number[];
  firstIndex: number | null;
  mismatch: number[];
  mismatchUntil: number;
  products: boolean;
  about: boolean;
  draws: number;
  inventory: Record<string, number>;
  rareEver: boolean;
  redeemed9: boolean;
  redeemed10: boolean;
  productSeconds: number;
  productBonusClaimed: boolean;
  presenceToken: string;
  presenceAt: number;
};
export const gameDay = (now: number) => new Date(now + 7 * 3600000).toISOString().slice(0, 10);
export function shuffledBoard() {
  const result = [...CARDS, ...CARDS];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function newGame(now: number): GameData {
  return {
    day: gameDay(now),
    welcome: false,
    enteredDay: '',
    attempts: 0,
    round: 1,
    board: shuffledBoard(),
    matched: [],
    firstIndex: null,
    mismatch: [],
    mismatchUntil: 0,
    products: false,
    about: false,
    draws: 0,
    inventory: Object.fromEntries(CARDS.map((id) => [id, 0])),
    rareEver: false,
    redeemed9: false,
    redeemed10: false,
    productSeconds: 0,
    productBonusClaimed: false,
    presenceToken: '',
    presenceAt: 0,
  };
}
export function refreshGame(data: GameData, now: number) {
  if (data.day !== gameDay(now)) {
    data.day = gameDay(now);
    data.draws = 0;
    data.productSeconds = 0;
    data.productBonusClaimed = false;
    data.presenceToken = '';
    data.presenceAt = 0;
  }
  if (data.mismatchUntil && now >= data.mismatchUntil) {
    data.mismatch = [];
    data.mismatchUntil = 0;
  }
}
export function flipCard(data: GameData, index: number, now: number) {
  if (!Number.isInteger(index) || index < 0 || index >= 20)
    throw new CustomerError(400, 'Thẻ không hợp lệ.');
  if (data.mismatchUntil > now) throw new CustomerError(409, 'Chờ hai thẻ úp lại.');
  if (data.matched.includes(index) || data.firstIndex === index)
    throw new CustomerError(409, 'Hãy chọn một thẻ khác.');
  if (data.firstIndex === null) {
    if (data.attempts < 1) throw new CustomerError(409, 'Bạn đã hết lượt lật.');
    data.attempts--;
    data.firstIndex = index;
    return;
  }
  const first = data.firstIndex;
  data.firstIndex = null;
  if (data.board[first] === data.board[index]) data.matched.push(first, index);
  else {
    data.mismatch = [first, index];
    data.mismatchUntil = now + 1600;
  }
}
export function presence(data: GameData, token: string | undefined, now: number) {
  if (!token || token !== data.presenceToken) {
    data.presenceToken = randomUUID();
    data.presenceAt = now;
    return;
  }
  const elapsed = now - data.presenceAt;
  data.presenceAt = now;
  // Count only short, visible-page heartbeats; a suspended tab cannot claim elapsed wall time.
  if (elapsed >= 3000 && elapsed <= 8000)
    data.productSeconds = Math.min(30, data.productSeconds + elapsed / 1000);
  if (data.productSeconds >= 30 && !data.productBonusClaimed) {
    data.productBonusClaimed = true;
    data.draws++;
  }
}
export function consumeCollection(data: GameData, tier: 9 | 10) {
  if (tier === 9 ? data.redeemed9 : data.redeemed10)
    throw new CustomerError(409, 'Bạn đã đổi phần thưởng này.');
  const ids = tier === 9 ? [...INGREDIENTS] : CARDS;
  if (ids.some((id) => (data.inventory[id] || 0) < 1))
    throw new CustomerError(409, 'Bạn chưa đủ bộ thẻ để đổi.');
  for (const id of ids) data.inventory[id]--;
  if (tier === 9) data.redeemed9 = true;
  else data.redeemed10 = true;
}
export function publicGame(data: GameData, issued: number) {
  return {
    memory: {
      round: data.round,
      attempts: data.attempts,
      firstIndex: data.firstIndex,
      mismatchUntil: data.mismatchUntil ? new Date(data.mismatchUntil).toISOString() : null,
      complete: data.matched.length === 20,
      cards: data.board.map((id, index) => ({
        index,
        cardId: index === data.firstIndex || data.mismatch.includes(index) ? id : null,
        matched: data.matched.includes(index),
      })),
      missions: {
        welcome: data.welcome,
        daily: data.enteredDay === data.day,
        products: data.products,
        about: data.about,
      },
    },
    collection: {
      day: data.day,
      draws: data.draws,
      inventory: data.inventory,
      redeemed9: data.redeemed9,
      redeemed10: data.redeemed10,
      rareEver: data.rareEver,
      rareRemaining: Math.max(0, 10 - issued),
      rareChance: !data.rareEver && issued < 10 ? 0.05 : 0,
      productSeconds: Math.floor(data.productSeconds),
      productBonusClaimed: data.productBonusClaimed,
    },
  };
}

export function enterGame(data: GameData, now: number) {
  refreshGame(data, now);
  if (!data.welcome) {
    data.welcome = true;
    data.attempts += 3;
  }
  if (data.enteredDay !== data.day) {
    data.enteredDay = data.day;
    data.attempts++;
    data.draws++;
  }
}
