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

test('story shows a poster without downloading the film until the visitor chooses to watch', async ({
  page,
}) => {
  const media: string[] = [];
  page.on('request', (request) => {
    if (/\.(mp4|mov)(\?|$)/i.test(request.url())) media.push(request.url());
  });
  await page.goto('/cau-chuyen');
  const video = page.locator('.story-film video');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Hà Nội trong ký ức.');
  await expect(video).toHaveAttribute('preload', 'none');
  await expect(video).toHaveAttribute('poster', '/brand/video/story-poster-v1.webp');
  await expect(video).not.toHaveAttribute('src', /.+/);
  await expect(video).toHaveJSProperty('controls', false);
  await expect(page.getByRole('button', { name: 'Xem câu chuyện Hà Thành Vị' })).toBeVisible();
  await video.scrollIntoViewIfNeeded();
  await expect(page.locator('.game-launcher')).toBeHidden();
  await expect(page.locator('.vi-chat-widget')).toBeHidden();
  await expect(page.locator('.story-card')).toHaveCount(3);
  expect(media).toEqual([]);
  await page.getByRole('button', { name: 'Xem câu chuyện Hà Thành Vị' }).click();
  await expect(video).toHaveJSProperty('controls', true);
  await expect(video).toHaveJSProperty('paused', false);
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(0);
  await expect(video).toHaveJSProperty('muted', false);
  await expect(video).toHaveAttribute('playsinline', '');
  expect(media.some((url) => url.endsWith('/brand/video/story-film-v1.mp4'))).toBe(true);
  expect(media.some((url) => url.endsWith('.mov'))).toBe(false);
});

test('the actual film supports seeking and pauses when scrolled out of view', async ({ page }) => {
  await page.goto('/cau-chuyen');
  const video = page.locator('.story-film video');
  await page.getByRole('button', { name: 'Xem câu chuyện Hà Thành Vị' }).click();
  await expect(video).toHaveJSProperty('paused', false);
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
    .toBeGreaterThan(2);
  await video.evaluate((el: HTMLVideoElement) => {
    el.currentTime = 40;
  });
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(39);
  await page.locator('.editorial-ending').scrollIntoViewIfNeeded();
  await expect(video).toHaveJSProperty('paused', true);
  await expect(page.locator('.game-launcher')).toBeVisible();
  await expect(page.locator('.vi-chat-widget')).toBeVisible();
  await video.scrollIntoViewIfNeeded();
  await expect(video).toHaveJSProperty('paused', true);
  await page.getByRole('link', { name: 'Khám phá những thức quà', exact: true }).click();
  await expect(page).toHaveURL(/\/san-pham$/);
  await expect(page.locator('.story-film')).toHaveCount(0);
});

test('a failed video request offers a retry that can recover', async ({ page }) => {
  await page.route('**/brand/video/story-film-v1.mp4', (route) => route.abort());
  await page.goto('/cau-chuyen');
  const video = page.locator('.story-film video');
  await page.getByRole('button', { name: 'Xem câu chuyện Hà Thành Vị' }).click();
  await expect(page.getByRole('button', { name: 'Thử lại video câu chuyện' })).toBeVisible();
  await expect(page.locator('.story-film')).toContainText('Video chưa tải được.');
  await page.unroute('**/brand/video/story-film-v1.mp4');
  await page.getByRole('button', { name: 'Thử lại video câu chuyện' }).click();
  await expect(video).toHaveJSProperty('paused', false);
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Thử lại video câu chuyện' })).toHaveCount(0);
});

test('the film keeps its full aspect ratio across narrow phones, tablets and wide desktops', async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/cau-chuyen');
    const frame = await page.locator('.story-film__frame').boundingBox();
    expect(frame).not.toBeNull();
    expect(frame!.width).toBeLessThan(width);
    expect(Math.abs(frame!.width / frame!.height - 1912 / 1080)).toBeLessThan(0.03);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await expect(page.getByRole('button', { name: 'Xem câu chuyện Hà Thành Vị' })).toBeVisible();
  }
});

test('keyboard activation and reduced motion still allow visitor-controlled playback', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/cau-chuyen');
  const button = page.getByRole('button', { name: 'Xem câu chuyện Hà Thành Vị' });
  await button.focus();
  await button.press('Enter');
  await expect(page.locator('.story-film video')).toHaveJSProperty('paused', false);
  await expect(page.locator('.story-film video')).toBeFocused();
  const duration = await page
    .locator('.story-opening__intro')
    .evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(duration)).toBeLessThan(0.01);
});

test('About retains its original introduction and never loads the story film', async ({ page }) => {
  await page.goto('/ve-chung-toi');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mang vị Hà Nội');
  await expect(page.locator('.about-hero__visual img').first()).toBeVisible();
  await expect(page.locator('.story-film')).toHaveCount(0);
});
