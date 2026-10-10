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
      status: 'playing' as 'idle' | 'playing' | 'won' | 'lost',
      remainingRounds: 3,
      deadline: new Date(Date.now() + 60000).toISOString() as string | null,
      serverNow: new Date().toISOString(),
      bestMs: null as number | null,
      lastPoints: 0,
      wins: 0,
      points: 0,
      earnedToday: 0,
      soonestExpiry: null as string | null,
      firstIndex: null as number | null,
      mismatchUntil: null,
      complete: false,
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
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 430, height: 932 },
  { width: 360, height: 640 },
  { width: 844, height: 390 },
]) {
  test(`memory fits the desktop screen and keeps mobile cards readable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const current = state();
    current.memory.status = 'idle';
    current.memory.deadline = null;
    await page.route('**/api/games**', (route) => {
      if (route.request().url().endsWith('/memory/start')) {
        current.memory.status = 'playing';
        current.memory.deadline = new Date(Date.now() + 60000).toISOString();
      }
      return route.fulfill(json({ state: current }));
    });
    await page.goto(viewport.width === 360 ? '/tro-choi/' : '/tro-choi');
    await expect(page.locator('.games-memory-card')).toHaveCount(20);
    const bounds = await page.locator('.games-memory-card').evaluateAll((cards) =>
      cards.map((card) => {
        const box = card.getBoundingClientRect();
        return {
          top: box.top,
          bottom: box.bottom,
          left: box.left,
          right: box.right,
          width: box.width,
          height: box.height,
        };
      }),
    );
    for (const box of bounds) {
      expect(box.top).toBeGreaterThanOrEqual(0);
      if (viewport.height > 700 || viewport.width > 760)
        expect(box.bottom).toBeLessThanOrEqual(viewport.height);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(viewport.width);
      expect(box.width).toBeGreaterThanOrEqual(viewport.width >= 1100 ? 110 : 60);
      expect(box.height).toBeGreaterThanOrEqual(60);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    const start = await page
      .getByRole('button', { name: 'Bắt đầu ván 60 giây', exact: true })
      .boundingBox();
    expect(start!.y + start!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({ path: test.info().outputPath('memory-screen.png') });
    await page.getByRole('button', { name: /Đổi thưởng từ điểm/ }).click();
    await expect(page.getByRole('dialog', { name: 'Đổi thưởng từ điểm' })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng', exact: true }).click();
    await page
      .getByRole('button', { name: 'Luật chơi & những điều cần biết', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toContainText('3 ván mỗi ngày');
    await page.getByRole('button', { name: 'Đóng', exact: true }).click();
    await page.getByRole('button', { name: 'Bắt đầu ván 60 giây', exact: true }).click();
    await expect(page.getByRole('timer')).toContainText('01:00');
    if (viewport.height > 700 || viewport.width > 760)
      expect(
        await page.locator('#main-content').evaluate((el) => el.scrollHeight <= el.clientHeight),
      ).toBeTruthy();
    current.memory.status = 'lost';
    current.memory.bestMs = 41000;
    await page.reload();
    await expect(page.locator('.games-round-result')).toContainText('Hết giờ');
    await page.screenshot({ path: test.info().outputPath('memory-ended.png') });
    const last = await page.locator('.games-memory-card').last().boundingBox();
    if (viewport.height > 700 || viewport.width > 760)
      expect(last!.y + last!.height).toBeLessThanOrEqual(viewport.height);
    expect(last!.width).toBeGreaterThanOrEqual(viewport.width >= 1100 ? 110 : 60);
  });
}
test('memory can expand its board and escape back without changing the round', async ({ page }) => {
  const current = state();
  current.memory.firstIndex = 0;
  current.memory.cards[0].cardId = 'flour';
  await page.route('**/api/games**', (route) => route.fulfill(json({ state: current })));
  // Exercise the viewport fallback used when native fullscreen is unavailable.
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error('Unavailable'));
  });
  await page.goto('/tro-choi');
  await page.getByRole('button', { name: 'Phóng to bàn thẻ', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Thu nhỏ bàn thẻ', exact: true })).toBeVisible();
  const board = await page.getByRole('region', { name: 'Bàn lật thẻ' }).boundingBox();
  const viewport = page.viewportSize()!;
  expect(board!.x).toBe(0);
  expect(board!.y).toBe(0);
  expect(board!.width).toBe(viewport.width);
  expect(board!.height).toBe(viewport.height);
  await expect(page.locator('.games-memory-card')).toHaveCount(20);
  await expect(page.getByRole('button', { name: 'Bột mì', exact: true })).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Thu nhỏ bàn thẻ', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Phóng to bàn thẻ', exact: true })).toBeVisible();
  await expect(page.locator('.games-memory-card')).toHaveCount(20);
  await expect(page.getByRole('button', { name: 'Bột mì', exact: true })).toBeVisible();
});
test('native fullscreen keeps round details accessible and restores the board on exit', async ({
  page,
}) => {
  const current = state();
  current.memory.status = 'lost';
  await page.route('**/api/games**', (route) => route.fulfill(json({ state: current })));
  await page.goto('/tro-choi');
  await page.getByRole('button', { name: 'Phóng to bàn thẻ', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('games-page')))
    .toBe(true);
  await page.getByRole('button', { name: 'Chi tiết', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Chi tiết ván chơi' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Ván này không có điểm');
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('button', { name: 'Thu nhỏ bàn thẻ', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(page.locator('.games-memory-card')).toHaveCount(20);
});
test('expanded memory board shows request errors and recovers keyboard focus after a card is disabled', async ({
  page,
}) => {
  const current = state();
  await page.route('**/api/games**', async (route) => {
    if (route.request().url().endsWith('/memory/flip')) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill(json({ message: 'Không thể mở thẻ. Vui lòng thử lại.' }, 503));
    } else await route.fulfill(json({ state: current }));
  });
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error('Unavailable'));
  });
  await page.goto('/tro-choi');
  await page.getByRole('button', { name: 'Phóng to bàn thẻ', exact: true }).click();
  const last = page.getByRole('button', { name: 'Lật thẻ 20', exact: true });
  await last.focus();
  await page.keyboard.press('Enter');
  const alert = page.getByRole('region', { name: 'Bàn lật thẻ' }).getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Không thể mở thẻ');
  await page.keyboard.press('Tab');
  expect(
    await page
      .getByRole('region', { name: 'Bàn lật thẻ' })
      .evaluate((el) => el.contains(document.activeElement)),
  ).toBeTruthy();
  await alert.getByRole('button', { name: 'Tải lại tiến độ' }).click();
  await expect(alert).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Thu nhỏ bàn thẻ', exact: true })).toBeVisible();
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
  await page.getByRole('button', { name: 'Luật chơi & những điều cần biết', exact: true }).click();
  await expect(page.locator('.games-rules')).toContainText('10 thẻ toàn hệ thống');
});
test('memory starts a timed round, disables expired cards and has no mission grants', async ({
  page,
}) => {
  await page.clock.install();
  const current = state();
  current.memory.status = 'idle';
  current.memory.deadline = null;
  let starts = 0;
  await page.route('**/api/games**', async (route) => {
    if (route.request().url().endsWith('/memory/start')) {
      const body = route.request().postDataJSON();
      expect(body.round).toBe(1);
      expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);
      starts++;
      current.memory.status = 'playing';
      current.memory.remainingRounds = 2;
      current.memory.serverNow = new Date(await page.evaluate(() => Date.now())).toISOString();
      current.memory.deadline = new Date(
        Date.parse(current.memory.serverNow) + 60000,
      ).toISOString();
    }
    current.memory.serverNow = new Date(await page.evaluate(() => Date.now())).toISOString();
    if (
      current.memory.deadline &&
      Date.parse(current.memory.serverNow) >= Date.parse(current.memory.deadline)
    ) {
      current.memory.status = 'lost';
    }
    await route.fulfill(json({ state: current }));
  });
  await page.goto('/tro-choi');
  await expect(page.getByRole('button', { name: 'Đổi thưởng từ điểm' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nhiệm vụ của bạn' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Lật thẻ 1', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Bắt đầu ván 60 giây', exact: true }).click();
  await expect(page.getByRole('timer')).toContainText('01:00');
  await expect(page.locator('.games-counter')).toContainText('2');
  await expect(page.getByRole('button', { name: 'Lật thẻ 1', exact: true })).toBeEnabled();
  await page.clock.runFor(61000);
  await expect(page.getByRole('button', { name: 'Lật thẻ 1', exact: true })).toBeDisabled();
  await expect(page.locator('.games-round-result')).toContainText('Hết giờ');
  expect(starts).toBe(1);
});
test('memory exchanges every active point only after confirming its order cap and loss of remainder', async ({
  page,
}) => {
  const current = state();
  current.memory.status = 'idle';
  current.memory.deadline = null;
  current.memory.points = 3200;
  current.memory.soonestExpiry = new Date(Date.now() + 86400000).toISOString();
  let exchanges = 0;
  await page.route('**/api/games**', async (route) => {
    if (route.request().url().endsWith('/memory/redeem')) {
      expect(Object.keys(route.request().postDataJSON())).toEqual(['requestId']);
      expect(route.request().postDataJSON().requestId).toMatch(/^[a-f0-9-]{36}$/);
      exchanges++;
      current.memory.points = 0;
      await route.fulfill(
        json({ state: current, reward: { code: 'POINT-3200', name: 'Lật thẻ · giảm 3.200đ' } }),
      );
      return;
    }
    await route.fulfill(json({ state: current }));
  });
  await page.goto('/tro-choi');
  await page.getByRole('button', { name: 'Đổi thưởng từ điểm', exact: true }).click();
  await page.getByRole('button', { name: 'Đổi toàn bộ điểm', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('3.200');
  await expect(page.getByRole('dialog')).toContainText('10%');
  await expect(page.getByRole('dialog')).toContainText('Phần chưa dùng sẽ mất');
  expect(exchanges).toBe(0);
  await page.getByRole('button', { name: 'Xác nhận đổi điểm', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('POINT-3200');
  await expect(page.getByRole('dialog')).toContainText('10%');
  expect(exchanges).toBe(1);
  await expect(page.locator('.games-point-balance')).toContainText('0');
});
test('points expiring in an open page close the old exchange confirmation', async ({ page }) => {
  await page.clock.install();
  const current = state();
  current.memory.status = 'idle';
  current.memory.deadline = null;
  current.memory.points = 3200;
  let expiry = 0;
  await page.route('**/api/games**', async (route) => {
    const now = await page.evaluate(() => Date.now());
    if (!expiry) expiry = now + 5000;
    current.memory.serverNow = new Date(now).toISOString();
    current.memory.soonestExpiry = now < expiry ? new Date(expiry).toISOString() : null;
    current.memory.points = now < expiry ? 3200 : 2800;
    await route.fulfill(json({ state: current }));
  });
  await page.goto('/tro-choi');
  await page.getByRole('button', { name: 'Đổi thưởng từ điểm', exact: true }).click();
  await page.getByRole('button', { name: 'Đổi toàn bộ điểm', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.runFor(6000);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.games-point-balance')).toContainText('2.800');
  await page.getByRole('button', { name: 'Đổi thưởng từ điểm', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Chưa đủ 3.000 điểm', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Số điểm còn hạn đã thay đổi');
});
for (const wins of [1, 2]) {
  test(`memory victory ${wins} preserves the final pair view before showing its points result`, async ({
    page,
  }) => {
    const current = state();
    current.memory.wins = wins - 1;
    for (const card of current.memory.cards.slice(2)) card.matched = true;
    await page.route('**/api/games**', async (route) => {
      if (route.request().url().endsWith('/memory/flip')) {
        const { index } = route.request().postDataJSON();
        if (current.memory.firstIndex === null) {
          current.memory.firstIndex = index;
          current.memory.cards[index].cardId = 'flour';
        } else {
          current.memory.firstIndex = null;
          current.memory.cards[0].cardId = current.memory.cards[1].cardId = null;
          current.memory.cards[0].matched = current.memory.cards[1].matched = true;
          current.memory.status = 'won';
          current.memory.complete = true;
          current.memory.wins = wins;
          current.memory.bestMs = 41000;
          current.memory.lastPoints = wins === 1 ? 0 : 250;
          current.memory.points = current.memory.earnedToday = current.memory.lastPoints;
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
          .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m11),
      )
      .toBeLessThan(-0.99);
    await page.waitForTimeout(900);
    expect(await second.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(
      0.95,
    );
    await expect(page.locator('.games-round-result')).toHaveCount(0);
    await expect(page.locator('.games-round-result')).toContainText(
      wins === 1 ? 'Chiến thắng đầu tiên' : 'Đã cộng 250 điểm',
    );
    await expect(page.locator('.games-personal-best')).toContainText('41 giây');
    await expect(page.locator('.games-point-balance')).toContainText(String(current.memory.points));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
  });
}
test('memory includes its round in selections and hides a matched pair after viewing', async ({
  page,
}) => {
  const current = state();
  await page.route('**/api/games**', async (r) => {
    if (r.request().url().endsWith('/memory/flip')) {
      const body = r.request().postDataJSON();
      expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);
      expect(body.round).toBe(current.memory.round);
      if (current.memory.firstIndex === null) {
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
  await expect(page.locator('.games-counter')).toContainText('3');
  await page.getByRole('button', { name: 'Lật thẻ 1', exact: true }).click();
  await expect(page.locator('.games-counter')).toContainText('3');
  expect(calls[1]).toEqual(calls[0]);
});

test('a resumed first card stays visible with its matching second card', async ({ page }) => {
  const current = state();
  current.memory.firstIndex = 0;
  current.memory.cards[0].cardId = 'flour';
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
  await page.clock.install();
  await page.route('**/api/games**', async (r) => {
    if (r.request().url().endsWith('/visit')) {
      throw new Error('Legacy memory visits must not be sent');
    }
    if (r.request().url().endsWith('/products-presence')) {
      expect(r.request().headers().referer).toContain('/san-pham');
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
