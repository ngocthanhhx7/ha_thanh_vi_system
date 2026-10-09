import { test, expect } from '@playwright/test';
import content from '../../content/site.json';
const json = (data: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(data),
});
const ids = [
  'flour',
  'sticky-rice',
  'sugar',
  'oil',
  'lime-leaf',
  'salted-egg',
  'lard',
  'matcha',
  'cacao',
  'banh-cha',
];
function state() {
  return {
    memory: {
      round: 1,
      attempts: 4,
      firstIndex: null as number | null,
      mismatchUntil: null,
      complete: false,
      missions: { welcome: true, daily: true, products: false, about: false },
      cards: Array.from({ length: 20 }, (_, index) => ({
        index,
        cardId: null as string | null,
        matched: false,
      })),
    },
    collection: {
      day: '2026-10-08',
      draws: 1,
      inventory: Object.fromEntries(ids.map((id) => [id, 0])),
      redeemed9: false,
      redeemed10: false,
      rareEver: false,
      rareRemaining: 10,
      rareChance: 0.05,
      productSeconds: 0,
      productBonusClaimed: false,
    },
  };
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (r) => r.fulfill(json({ message: 'Chưa đăng nhập' }, 401)));
  await page.route('**/api/content', (r) => r.fulfill(json(content)));
  await page.route('**/api/notifications*', (r) =>
    r.fulfill(json({ notifications: [], unread: 0, total: 0, page: 1, limit: 10 })),
  );
});
test('game launcher opens guest rules without horizontal overflow', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('link', { name: 'Chơi cùng Hà Thành Vị, lật thẻ và sưu tập nhận ưu đãi' })
    .click();
  await expect(page).toHaveURL(/\/tro-choi$/);
  await expect(page.getByRole('link', { name: /Đăng nhập để chơi/ })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.getByText('Luật chơi & những điều cần biết', { exact: true }).click();
  await expect(page.locator('.games-rules')).toContainText('10 thẻ toàn hệ thống');
});
test('memory reserves one attempt for two selections and hides a matched pair', async ({
  page,
}) => {
  const current = state();
  await page.route('**/api/games**', async (r) => {
    if (r.request().url().endsWith('/memory/flip')) {
      const body = r.request().postDataJSON();
      expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);
      if (current.memory.firstIndex === null) {
        current.memory.attempts--;
        current.memory.firstIndex = body.index;
        current.memory.cards[body.index].cardId = 'flour';
      } else {
        for (const index of [current.memory.firstIndex, body.index]) {
          current.memory.cards[index].matched = true;
          current.memory.cards[index].cardId = null;
        }
        current.memory.firstIndex = null;
      }
    }
    await r.fulfill(json({ state: current }));
  });
  await page.goto('/tro-choi');
  await expect(page.locator('.games-memory-card')).toHaveCount(20);
  await page.getByRole('button', { name: 'Lật thẻ 1', exact: true }).click();
  await expect(page.locator('.games-counter')).toContainText('3');
  await expect(page.getByRole('button', { name: 'Bột mì', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Lật thẻ 2', exact: true }).click();
  await expect(page.locator('.games-memory-card.is-matched')).toHaveCount(2);
  const second = page.locator('.games-memory-card').nth(1);
  await expect
    .poll(() =>
      second
        .locator('.games-memory-turn')
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m11),
    )
    .toBeLessThan(-0.99);
  await page.waitForTimeout(900);
  expect(await second.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.95);
  await expect.poll(() => second.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(0);
  await expect(page.locator('.games-counter')).toContainText('3');
  await expect(page.locator('.games-progress')).toContainText('1/10');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
});
test('memory responds during slow requests and closes mismatches without a refresh round trip', async ({
  page,
}) => {
  const current = state();
  let release: (() => void) | undefined;
  let reads = 0;
  const flips: number[] = [];
  await page.route('**/api/games**', async (r) => {
    if (r.request().url().endsWith('/memory/flip')) {
      const { index } = r.request().postDataJSON();
      flips.push(index);
      if (current.memory.firstIndex === null) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        current.memory.attempts--;
        current.memory.firstIndex = index;
        current.memory.cards[index].cardId = 'flour';
      } else {
        current.memory.firstIndex = null;
        current.memory.cards[index].cardId = 'oil';
        // Transaction + transmission has already consumed the server's viewing window.
        Object.assign(current.memory, { mismatchUntil: new Date(Date.now() - 4000).toISOString() });
      }
    } else if (r.request().method() === 'GET') {
      reads++;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    await r.fulfill(json({ state: current }));
  });
  await page.goto('/tro-choi');
  const first = page.locator('.games-memory-card').nth(0);
  await first.click();
  await expect(first).toHaveClass(/is-pending/, { timeout: 500 });
  await expect(first).not.toHaveClass(/is-revealed/);
  await expect
    .poll(() =>
      first
        .locator('.games-memory-turn')
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m11),
    )
    .toBeGreaterThan(0.95);
  const second = page.getByRole('button', { name: 'Lật thẻ 2', exact: true });
  await expect(second).toBeEnabled();
  await second.click();
  await expect(second).toHaveClass(/is-pending/);
  const collectionTab = page.locator('.games-switch button').nth(1);
  await expect(collectionTab).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Lật thẻ 3', exact: true })).toBeDisabled();
  expect(flips).toEqual([0]);
  release!();
  await expect(page.locator('.games-memory-card.is-revealed')).toHaveCount(2);
  expect(flips).toEqual([0, 1]);
  await expect
    .poll(() =>
      page
        .locator('.games-memory-card')
        .nth(1)
        .locator('.games-memory-turn')
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m11),
    )
    .toBeLessThan(-0.99);
  await page.waitForTimeout(900);
  await expect(page.locator('.games-memory-card.is-revealed')).toHaveCount(2);
  await expect(collectionTab).toBeDisabled();
  await expect(page.locator('.games-memory-card.is-revealed')).toHaveCount(0, { timeout: 3000 });
  await expect(first).toBeEnabled();
  await expect(first.locator('.games-memory-front img')).toHaveAttribute('src', /flour.webp$/);
  await expect
    .poll(() =>
      first
        .locator('.games-memory-turn')
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m11),
    )
    .toBe(1);
  expect(reads).toBe(0);
  await expect(page.locator('.games-counter')).toContainText('3');
  await expect(collectionTab).toBeEnabled();
  await collectionTab.click();
  await expect(page.getByRole('button', { name: /Rút một thẻ/ })).toBeEnabled();
});

test('a failed ingredient image shows its real name for the full pair viewing window', async ({
  page,
}) => {
  const current = state();
  await page.route('**/brand/game/cards/oil.webp', (route) => route.abort());
  await page.route('**/api/games**', async (route) => {
    if (route.request().url().endsWith('/memory/flip')) {
      const { index } = route.request().postDataJSON();
      if (current.memory.firstIndex === null) {
        current.memory.firstIndex = index;
        current.memory.attempts--;
        current.memory.cards[index].cardId = 'flour';
      } else {
        current.memory.firstIndex = null;
        current.memory.cards[index].cardId = 'oil';
        Object.assign(current.memory, { mismatchUntil: new Date(Date.now() - 4000).toISOString() });
      }
    }
    await route.fulfill(json({ state: current }));
  });
  await page.goto('/tro-choi');
  await page.getByRole('button', { name: 'Lật thẻ 1', exact: true }).click();
  await page.getByRole('button', { name: 'Lật thẻ 2', exact: true }).click();
  const second = page.locator('.games-memory-card').nth(1);
  await expect
    .poll(() =>
      second
        .locator('.games-memory-turn')
        .evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m11),
    )
    .toBeLessThan(-0.99);
  await expect(second.locator('.games-memory-front-fallback')).toHaveText('Dầu ăn');
  await expect(second.locator('.games-memory-front-fallback')).toBeVisible();
  await page.waitForTimeout(900);
  await expect(second).toHaveClass(/is-revealed/);
  await expect(page.locator('.games-memory-card.is-revealed')).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator('.games-switch button').nth(1)).toBeEnabled();
});

test('failed first selection cancels the queued card and retry keeps the request id', async ({
  page,
}) => {
  const current = state();
  const calls: { index: number; requestId: string }[] = [];
  let release: (() => void) | undefined;
  await page.route('**/api/games**', async (r) => {
    if (r.request().url().endsWith('/memory/flip')) {
      const body = r.request().postDataJSON();
      calls.push(body);
      if (calls.length === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await r.fulfill(json({ message: 'Kết nối gián đoạn' }, 503));
        return;
      }
      current.memory.firstIndex = body.index;
      current.memory.cards[body.index].cardId = 'flour';
      current.memory.attempts--;
    }
    await r.fulfill(json({ state: current }));
  });
  await page.goto('/tro-choi');
  await page.getByRole('button', { name: 'Lật thẻ 1', exact: true }).click();
  await page.getByRole('button', { name: 'Lật thẻ 2', exact: true }).click();
  release!();
  await expect(page.getByRole('alert')).toContainText('Kết nối gián đoạn');
  expect(calls).toHaveLength(1);
  await expect(page.locator('.games-memory-card.is-pending')).toHaveCount(0);
  await expect(page.locator('.games-counter')).toContainText('4');
  await page.getByRole('button', { name: 'Lật thẻ 1', exact: true }).click();
  await expect(page.locator('.games-counter')).toContainText('3');
  expect(calls[1]).toEqual(calls[0]);
});

test('a resumed first card stays visible with its matching second card', async ({ page }) => {
  const current = state();
  current.memory.firstIndex = 0;
  current.memory.cards[0].cardId = 'flour';
  current.memory.attempts = 3;
  await page.route('**/api/games**', async (route) => {
    if (route.request().url().endsWith('/memory/flip')) {
      current.memory.firstIndex = null;
      for (const index of [0, 1]) {
        current.memory.cards[index].matched = true;
        current.memory.cards[index].cardId = null;
      }
    }
    await route.fulfill(json({ state: current }));
  });
  await page.goto('/tro-choi');
  await page.getByRole('button', { name: 'Lật thẻ 2', exact: true }).click();
  for (const index of [0, 1]) {
    const card = page.locator('.games-memory-card').nth(index);
    await expect(card.locator('.games-memory-front img')).toHaveAttribute('src', /flour.webp$/);
    await expect
      .poll(() =>
        card
          .locator('.games-memory-turn')
          .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m11),
      )
      .toBeLessThan(-0.99);
    expect(await card.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.95);
  }
  await expect(page.locator('.games-counter')).toContainText('3');
});

test('collection redemption confirms consumption and uses server inventory and voucher', async ({
  page,
}) => {
  const current = state();
  current.collection.inventory = Object.fromEntries(ids.map((id) => [id, 1]));
  let redeemed = 0;
  await page.route('**/api/games**', async (r) => {
    if (r.request().url().endsWith('/collection/redeem')) {
      expect(r.request().postDataJSON()).toEqual({ tier: 9 });
      redeemed++;
      ids.slice(0, 9).forEach((id) => current.collection.inventory[id]--);
      current.collection.redeemed9 = true;
      await r.fulfill(
        json({
          state: current,
          reward: { code: 'TEST-GAME-9', name: 'Bộ 9 nguyên liệu · giảm 30.000đ' },
        }),
      );
      return;
    }
    await r.fulfill(json({ state: current }));
  });
  await page.goto('/tro-choi');
  await page.getByRole('button', { name: /Sưu tập hương vị/ }).click();
  await page.getByRole('button', { name: 'Đổi thưởng', exact: true }).click();
  await page.getByRole('button', { name: 'Đổi phần thưởng', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText('không gồm Bánh chả');
  expect(redeemed).toBe(0);
  await page.getByRole('button', { name: 'Xác nhận đổi thẻ' }).click();
  await expect(page.getByRole('dialog')).toContainText('TEST-GAME-9');
  expect(redeemed).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('customer-session-changed')));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.games-collectible').filter({ hasText: 'Bánh chả' })).toContainText(
    'Đang có: 1',
  );
  await expect(page.locator('.games-collectible.is-unowned')).toHaveCount(9);
  await expect(page.getByRole('button', { name: 'Đã đổi phần thưởng' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Chưa đủ thẻ' })).toBeDisabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
});
test('failed draw preserves retry id and never invents a collected card', async ({ page }) => {
  const current = state();
  const requestIds: string[] = [];
  await page.route('**/api/games**', async (r) => {
    if (r.request().url().endsWith('/collection/draw')) {
      requestIds.push(r.request().postDataJSON().requestId);
      if (requestIds.length === 1) {
        await r.fulfill(json({ message: 'Kết nối gián đoạn' }, 503));
        return;
      }
      current.collection.draws = 0;
      current.collection.inventory.oil = 1;
      await r.fulfill(json({ state: current, card: 'oil' }));
      return;
    }
    await r.fulfill(json({ state: current }));
  });
  await page.goto('/tro-choi');
  await page.getByRole('button', { name: /Sưu tập hương vị/ }).click();
  await page.getByRole('button', { name: 'Rút một thẻ' }).click();
  await expect(page.getByRole('alert')).toContainText('Kết nối gián đoạn');
  await expect(page.locator('.games-collectible.is-unowned')).toHaveCount(10);
  await page.getByRole('button', { name: 'Rút một thẻ' }).click();
  await expect(page.getByRole('dialog')).toContainText('Dầu ăn');
  expect(requestIds[0]).toBe(requestIds[1]);
});

test('product mission sends paced visible-page heartbeats and stops after daily bonus', async ({
  page,
}) => {
  const current = state();
  let heartbeats = 0;
  const heartbeatTimes: number[] = [];
  let visited = false;
  await page.clock.install();
  await page.route('**/api/games**', async (r) => {
    if (r.request().url().endsWith('/visit')) {
      expect(r.request().postDataJSON()).toEqual({ page: 'products' });
      expect(r.request().headers().referer).toContain('/san-pham');
      visited = true;
    }
    if (r.request().url().endsWith('/products-presence')) {
      expect(visited).toBeTruthy();
      heartbeatTimes.push(await page.evaluate(() => Date.now()));
      heartbeats++;
      current.collection.productSeconds = Math.min(30, (heartbeats - 1) * 5);
      current.collection.productBonusClaimed = current.collection.productSeconds === 30;
      await r.fulfill(json({ state: current, token: '12345678-1234-4123-8123-123456789012' }));
      return;
    }
    await r.fulfill(json({ state: current }));
  });
  await page.goto('/san-pham');
  await expect.poll(() => heartbeats).toBe(1);
  for (let step = 1; step <= 6; step++) {
    await page.clock.runFor(5000);
    // Receipt of a mocked request precedes fetch/JSON completion and scheduling
    // the next timer. Keep advancing the browser clock while awaiting it.
    await expect
      .poll(async () => {
        await page.clock.runFor(100);
        return heartbeats;
      })
      .toBe(step + 1);
  }
  await page.clock.runFor(15000);
  expect(heartbeats).toBe(7);
  for (let index = 1; index < heartbeatTimes.length; index++) {
    expect(heartbeatTimes[index] - heartbeatTimes[index - 1]).toBeGreaterThanOrEqual(5000);
  }
  await page
    .getByRole('link', { name: 'Chơi cùng Hà Thành Vị, lật thẻ và sưu tập nhận ưu đãi' })
    .click();
  await page.getByRole('button', { name: /Sưu tập hương vị/ }).click();
  await expect(
    page.locator('.games-mission').filter({ hasText: 'Dạo quầy bánh 30 giây' }),
  ).toContainText('Đã nhận thêm 1 lượt hôm nay');
});
