export const gameCards = [
  ['flour', 'Bột mì'],
  ['sticky-rice', 'Bột nếp'],
  ['sugar', 'Đường'],
  ['oil', 'Dầu ăn'],
  ['lime-leaf', 'Lá chanh'],
  ['salted-egg', 'Trứng muối'],
  ['lard', 'Mỡ lợn'],
  ['matcha', 'Bột matcha'],
  ['cacao', 'Bột cacao'],
  ['banh-cha', 'Bánh chả'],
] as const;
export const gameImage = (id: string) => `/brand/game/cards/${id}.webp`;
export const gameCardName = (id: string) => gameCards.find(([key]) => key === id)?.[1] || id;
export type GameState = {
  memory: {
    round: number;
    attempts: number;
    cards: { index: number; cardId: string | null; matched: boolean }[];
    firstIndex: number | null;
    mismatchUntil: string | null;
    complete: boolean;
    missions: { welcome: boolean; daily: boolean; products: boolean; about: boolean };
  };
  collection: {
    day: string;
    draws: number;
    inventory: Record<string, number>;
    redeemed9: boolean;
    redeemed10: boolean;
    rareEver: boolean;
    rareRemaining: number;
    rareChance: number;
    productSeconds: number;
    productBonusClaimed: boolean;
  };
};
export type GameResult = {
  state: GameState;
  reward?: { code: string; name: string };
  card?: string;
  token?: string;
};
export class GameApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
// Game errors stay in the game UI, including guests and expired sessions.
async function call(path: string, body?: object): Promise<GameResult> {
  const response = await fetch(`/api/games${path}`, {
    referrerPolicy: 'same-origin',
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw new GameApiError(
      data?.message || 'Chưa kết nối được trò chơi. Vui lòng thử lại.',
      response.status,
    );
  return data;
}
export const gameApi = {
  state: () => call(''),
  enter: () => call('/enter', {}),
  visit: (page: 'products' | 'about') => call('/visit', { page }),
  presence: (token?: string) => call('/products-presence', { token }),
  flip: (index: number, requestId: string) => call('/memory/flip', { index, requestId }),
  memoryReward: (round: number) => call('/memory/reward', { round }),
  draw: (requestId: string) => call('/collection/draw', { requestId }),
  redeem: (tier: 9 | 10) => call('/collection/redeem', { tier }),
};
