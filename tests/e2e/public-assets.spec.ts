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
  // While every network font is held, the portable brand subset must already be usable.
  // This catches reliance on local Times/Arial fonts that may be absent on Linux/macOS.
  expect(
    await page.evaluate(() => document.fonts.check('40px "Home Serif Fallback"', 'Ắằ Đđ Ỡỡ Ựự Ỷỷ')),
  ).toBe(true);
  expect(
    await page.evaluate(() => document.fonts.check('13px "Home UI Fallback"', 'Ớớ Ụụ Ỹỹ 0123')),
  ).toBe(true);
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
  expect(images.some((image) => image.includes('/brand/product/'))).toBe(false);
  await page.goto('/');
  await expect(page.locator('.hero-photo img').first()).toHaveJSProperty('complete', true);
  await expect(page.locator('.hero-photo img').first()).toHaveAttribute('fetchpriority', 'high');
  expect(
    await page
      .locator('.hero-photo img')
      .first()
      .evaluate((image: HTMLImageElement) => image.currentSrc),
  ).toMatch(/traditional-(640|1080)\.webp$/);
  expect(images).not.toContain('/brand/pattern.webp');
  expect(images).not.toContain('/brand/game/cards/card-back.webp');
});

test('square photos change after two seconds with no control row and the note beside the copy', async ({
  page,
}) => {
  await page.goto('/');
  const root = page.locator('.home-product-carousel');
  await root.scrollIntoViewIfNeeded();
  await root
    .locator('img')
    .nth(1)
    .evaluate((image: HTMLImageElement) => image.decode());
  const frame = await root.locator('.hero-photo').boundingBox();
  expect(Math.abs(frame!.width - frame!.height)).toBeLessThan(2);
  await expect(root.getByRole('button')).toHaveCount(0);
  await expect(page.locator('.home-product-carousel-controls')).toHaveCount(0);
  await expect(page.locator('.hero-copy .hero-note')).toContainText('Một chút vị xưa,');
  await expect(page.locator('.hero-visual .hero-note')).toHaveCount(0);
  const start = Date.now();
  await expect(root.locator('img.is-active')).toHaveAttribute('alt', /Vị matcha/, {
    timeout: 3500,
  });
  expect(Date.now() - start).toBeLessThan(3500);
  await expect(root.locator('img.is-active')).toHaveCSS('opacity', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('home-two-second-products.png'),
    fullPage: true,
  });
});

test('hover pauses the product photos and leaving resumes autoplay', async ({ page }) => {
  await page.goto('/');
  const root = page.locator('.home-product-carousel');
  await root.hover();
  const active = await root.locator('img.is-active').getAttribute('src');
  await page.waitForTimeout(2600);
  await expect(root.locator('img.is-active')).toHaveAttribute('src', active!);
  await page.mouse.move(0, 0);
  await expect(root.locator('img.is-active')).not.toHaveAttribute('src', active!, {
    timeout: 3500,
  });
});

test('reduced motion keeps a static product photo without autoplay', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const root = page.locator('.home-product-carousel');
  await root.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2600);
  await expect(root.locator('img.is-active')).toHaveAttribute('alt', /Vị truyền thống/);
  await expect(root.locator('img.is-active')).toHaveCSS('opacity', '1');
});

test('an unavailable product photo is skipped during autoplay', async ({ page }) => {
  await page.route('**/brand/product/matcha-*.webp', (route) => route.abort());
  await page.goto('/');
  const root = page.locator('.home-product-carousel');
  await root.scrollIntoViewIfNeeded();
  await expect(root.locator('img.is-active')).toHaveAttribute('alt', /Vị socola/, {
    timeout: 6000,
  });
  await expect(root.locator('img.is-active')).toHaveCSS('opacity', '1');
});
