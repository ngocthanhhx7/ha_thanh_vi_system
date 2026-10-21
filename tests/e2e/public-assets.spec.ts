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

test('square home product photos keep their artwork and switch automatically', async ({ page }) => {
  await page.goto('/');
  const root = page.locator('.home-product-carousel');
  await root.scrollIntoViewIfNeeded();
  const frame = await root.locator('.hero-photo').boundingBox();
  expect(frame).not.toBeNull();
  expect(Math.abs(frame!.width - frame!.height)).toBeLessThan(2);
  await expect(root.locator('img')).toHaveCount(4);
  await expect
    .poll(() =>
      root
        .locator('img')
        .first()
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(root.locator('.home-product-carousel-name')).toHaveText('Vị truyền thống');
  await expect(root.locator('.home-product-carousel-name')).toHaveText('Vị matcha', {
    timeout: 10000,
  });
  await expect(root.locator('img.is-active')).toHaveCSS('opacity', '1');
  await expect(root.locator('img.is-active')).toHaveCSS('object-fit', 'contain');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('home-square-products.png'),
    fullPage: true,
  });
});

test('visitors can choose and pause product photos with the keyboard', async ({ page }) => {
  await page.goto('/');
  const root = page.locator('.home-product-carousel');
  await root.getByRole('button', { name: 'Xem vị socola' }).focus();
  await page.keyboard.press('Enter');
  await expect(root.locator('.home-product-carousel-name')).toHaveText('Vị socola');
  await root.getByRole('button', { name: 'Tạm dừng chuyển ảnh sản phẩm' }).click();
  await page.locator('.hero-copy h1').click();
  await page.waitForTimeout(5500);
  await expect(root.locator('.home-product-carousel-name')).toHaveText('Vị socola');
  await root.getByRole('button', { name: 'Tiếp tục chuyển ảnh sản phẩm' }).click();
  await page.locator('.hero-copy h1').click();
  await root.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await expect(root.locator('.home-product-carousel-name')).toHaveText('Hộp bánh mix vị', {
    timeout: 10000,
  });
});

test('reduced motion disables autoplay while manual product selection still works', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const root = page.locator('.home-product-carousel');
  await root.scrollIntoViewIfNeeded();
  await page.waitForTimeout(5500);
  await expect(root.locator('.home-product-carousel-name')).toHaveText('Vị truyền thống');
  await root.getByRole('button', { name: 'Xem vị matcha' }).click();
  await expect(root.locator('.home-product-carousel-name')).toHaveText('Vị matcha');
  await expect(root.locator('img.is-active')).toHaveCSS('opacity', '1');
});

test('an unavailable product photo never replaces the current photo with a blank slide', async ({
  page,
}) => {
  await page.route('**/brand/product/matcha-*.webp', (route) => route.abort());
  await page.goto('/');
  const root = page.locator('.home-product-carousel');
  await root.scrollIntoViewIfNeeded();
  await expect(root.getByRole('button', { name: 'Xem vị matcha' })).toBeDisabled();
  await expect(root.locator('.home-product-carousel-name')).toHaveText('Vị truyền thống');
  await root.getByRole('button', { name: 'Xem vị socola' }).click();
  await expect(root.locator('.home-product-carousel-name')).toHaveText('Vị socola');
});
