import { test, expect } from '@playwright/test';
import content from '../../content/site.json';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      status: path === '/api/content' || path === '/api/chat/config' ? 200 : 401,
      contentType: 'application/json',
      body: JSON.stringify(
        path === '/api/content'
          ? content
          : path === '/api/chat/config'
            ? { enabled: false }
            : { message: 'Chưa đăng nhập' },
      ),
    });
  });
});

test('the mobile hero keeps its position when the bundled fonts arrive late', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/*.woff2', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const hero = page.locator('.home-hero .hero-photo');
  await expect(hero).toBeVisible();
  const before = await hero.boundingBox();
  expect(await page.evaluate(() => document.fonts.status)).toBe('loading');
  release();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const after = await hero.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(3);
});

test('responsive hero and launcher download derivatives without preloading the hero on other pages', async ({
  page,
}) => {
  const images: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'image') images.push(new URL(request.url()).pathname);
  });
  await page.goto('/tin-tuc');
  await expect(page.locator('.game-launcher img')).toHaveJSProperty('naturalWidth', 96);
  expect(images.some((image) => image.includes('/brand/pastry'))).toBe(false);
  await page.goto('/');
  await expect(page.locator('.hero-photo img')).toHaveJSProperty('complete', true);
  await expect(page.locator('.hero-photo img')).toHaveAttribute('fetchpriority', 'high');
  expect(
    await page.locator('.hero-photo img').evaluate((image: HTMLImageElement) => image.currentSrc),
  ).toMatch(/pastry-(640|960|1280)\.webp$/);
  expect(images).not.toContain('/brand/pattern.webp');
  expect(images).not.toContain('/brand/game/cards/card-back.webp');
});
