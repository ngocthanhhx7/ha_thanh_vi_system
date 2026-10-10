import { CustomerError } from '../utils/customerSecurity.js';
import { gameDay, shuffledBoard, type GameData } from './gameRules.js';

export type MemoryProgress = {
  version: 1;
  day: string;
  started: number;
  status: 'idle' | 'playing' | 'won' | 'lost';
  startedAt: number;
  deadline: number;
  wins: number;
  bestMs: number | null;
  lastPoints: number;
  lots: { amount: number; expiresAt: number }[];
  earnedDay: string;
  earnedToday: number;
};

export function refreshMemory(data: GameData, now: number): MemoryProgress {
  if (!data.memoryProgress) {
    data.memoryProgress = {
      version: 1,
      day: gameDay(now),
      started: 0,
      status: 'idle',
      startedAt: 0,
      deadline: 0,
      wins: 0,
      bestMs: null,
      lastPoints: 0,
      lots: [],
      earnedDay: gameDay(now),
      earnedToday: 0,
    };
    // A board played under pair-attempt rules cannot earn timed-game points.
    data.attempts = 0;
    data.firstIndex = null;
    data.mismatch = [];
    data.mismatchUntil = 0;
    data.matched = [];
  }
  const memory = data.memoryProgress;
  const day = gameDay(now);
  if (memory.day < day) {
    memory.day = day;
    memory.started = 0;
  }
  if (memory.earnedDay < day) {
    memory.earnedDay = day;
    memory.earnedToday = 0;
  }
  memory.lots = memory.lots.filter((lot) => lot.expiresAt > now && lot.amount > 0);
  if (memory.status === 'playing' && now >= memory.deadline) {
    memory.status = 'lost';
    data.firstIndex = null;
    data.mismatch = [];
    data.mismatchUntil = 0;
  }
  return memory;
}

export function startMemory(data: GameData, round: number, now: number) {
  const memory = refreshMemory(data, now);
  if (round !== data.round) throw new CustomerError(409, 'Ván đã thay đổi. Tải lại tiến độ.');
  if (memory.status === 'playing') throw new CustomerError(409, 'Bạn đang có một ván chơi.');
  if (memory.started >= 3) throw new CustomerError(409, 'Bạn đã dùng hết 3 ván hôm nay.');
  memory.started++;
  memory.status = 'playing';
  memory.startedAt = now;
  memory.deadline = now + 60000;
  memory.lastPoints = 0;
  data.round++;
  data.board = shuffledBoard();
  data.matched = [];
  data.firstIndex = null;
  data.mismatch = [];
  data.mismatchUntil = 0;
}

export function flipMemory(data: GameData, index: number, now: number) {
  const memory = refreshMemory(data, now);
  if (memory.status !== 'playing')
    throw new CustomerError(
      409,
      memory.status === 'lost' ? 'Ván chơi đã hết giờ.' : 'Bắt đầu một ván để lật thẻ.',
    );
  if (!Number.isInteger(index) || index < 0 || index >= 20)
    throw new CustomerError(400, 'Thẻ không hợp lệ.');
  if (data.mismatchUntil > now) throw new CustomerError(409, 'Chờ hai thẻ úp lại.');
  if (data.matched.includes(index) || data.firstIndex === index)
    throw new CustomerError(409, 'Hãy chọn một thẻ khác.');
  if (data.firstIndex === null) {
    data.firstIndex = index;
    return;
  }
  const first = data.firstIndex;
  data.firstIndex = null;
  if (data.board[first] !== data.board[index]) {
    data.mismatch = [first, index];
    data.mismatchUntil = now + 1600;
    return;
  }
  data.matched.push(first, index);
  if (data.matched.length !== 20) return;
  const elapsed = now - memory.startedAt;
  const record = memory.bestMs !== null && elapsed < memory.bestMs;
  memory.wins++;
  const base = memory.wins === 1 ? 0 : 200 + (record ? 50 : 0);
  memory.lastPoints = Math.max(0, Math.min(base, 600 - memory.earnedToday));
  memory.earnedToday += memory.lastPoints;
  if (memory.lastPoints)
    memory.lots.push({ amount: memory.lastPoints, expiresAt: now + 90 * 86400000 });
  if (memory.bestMs === null || record) memory.bestMs = elapsed;
  memory.status = 'won';
}

export function memoryPoints(memory: MemoryProgress) {
  return memory.lots.reduce((total, lot) => total + lot.amount, 0);
}

export function redeemMemory(data: GameData, now: number) {
  const memory = refreshMemory(data, now);
  const points = memoryPoints(memory);
  if (points < 3000) throw new CustomerError(409, 'Cần ít nhất 3.000 điểm còn hạn để đổi thưởng.');
  memory.lots = [];
  return points;
}

export function publicMemory(data: GameData, now: number) {
  const memory = refreshMemory(data, now);
  return {
    round: data.round,
    firstIndex: data.firstIndex,
    mismatchUntil: data.mismatchUntil ? new Date(data.mismatchUntil).toISOString() : null,
    complete: memory.status === 'won',
    cards: data.board.map((id, index) => ({
      index,
      cardId: index === data.firstIndex || data.mismatch.includes(index) ? id : null,
      matched: data.matched.includes(index),
    })),
    status: memory.status,
    remainingRounds: Math.max(0, 3 - memory.started),
    deadline: memory.deadline ? new Date(memory.deadline).toISOString() : null,
    serverNow: new Date(now).toISOString(),
    bestMs: memory.bestMs,
    lastPoints: memory.lastPoints,
    wins: memory.wins,
    points: memoryPoints(memory),
    earnedToday: memory.earnedToday,
    soonestExpiry: memory.lots.length
      ? new Date(Math.min(...memory.lots.map((lot) => lot.expiresAt))).toISOString()
      : null,
  };
}
