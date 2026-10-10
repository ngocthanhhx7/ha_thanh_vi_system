import { randomInt, randomUUID } from 'node:crypto';
import { CustomerError } from '../utils/customerSecurity.js';
import { flipMemory, publicMemory, refreshMemory, type MemoryProgress } from './memoryRules.js';
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
  memoryProgress?: MemoryProgress;
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
  refreshMemory(data, now);
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
  flipMemory(data, index, now);
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
export function publicGame(data: GameData, issued: number, now = Date.now()) {
  return {
    memory: publicMemory(data, now),
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
  if (data.enteredDay !== data.day) {
    data.enteredDay = data.day;
    data.draws++;
  }
}
