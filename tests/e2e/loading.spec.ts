import { test, expect } from '@playwright/test';
import content from '../../content/site.json';

const user = {
  id: 'loading-customer',
  name: 'Khách Hà Nội',
  email: 'loading@example.com',
  phone: '0901234567',
  role: 'customer',
};
const json = (value: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(value),
});

test('concurrent account consumers share one pending request and menu remains useful while loading', async ({
  page,
}) => {
  let requests = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/content') return route.fulfill(json(content));
    if (path === '/api/auth/me') {
      requests++;
      await held;
      return route.fulfill(json({ user }));
    }
    if (path === '/api/notifications') return route.fulfill(json({ notifications: [], unread: 0 }));
    if (path === '/api/chat/config') return route.fulfill(json({ enabled: false }));
    return route.fulfill(json({ message: 'Fixture' }, 404));
  });
  await page.goto('/');
  await expect.poll(() => requests).toBe(1);
  await page.getByRole('button', { name: 'Mở menu tài khoản', exact: true }).click();
  const menu = page.locator('#account-dropdown');
  await expect(menu.locator('[aria-busy="true"]')).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Tra cứu đơn hàng' })).toBeVisible();
  await page.waitForTimeout(200);
  expect(requests).toBe(1);
  release();
  await expect(menu.getByRole('navigation', { name: 'Tài khoản của tôi' })).toBeVisible();
  await page.getByRole('button', { name: 'Mở menu tài khoản', exact: true }).click();
  await page.getByRole('button', { name: 'Mở menu tài khoản', exact: true }).click();
  await expect.poll(() => requests).toBe(2); // A settled account response is not cached.
});

test('lazy navigation keeps public header mounted and renders accessible reduced-motion loading state', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    /\/(?:src\/pages\/News\.tsx|assets\/News-[^/]+\.js)(?:\?.*)?$/,
    async (route) => {
      await held;
      await route.continue();
    },
  );
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill(
      path === '/api/content'
        ? json(content)
        : path === '/api/chat/config'
          ? json({ enabled: false })
          : json({ message: 'Chưa đăng nhập' }, 401),
    );
  });
  await page.goto('/');
  await page
    .locator('header.header')
    .evaluate((element) => element.setAttribute('data-retained-shell', 'true'));
  await page.locator('footer').getByRole('link', { name: 'Tin tức', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đang mở trang…' })).toBeVisible();
  await expect(page.locator('header.header')).toHaveAttribute('data-retained-shell', 'true');
  await expect(page.locator('.page-loading-mark')).toHaveCSS('animation-name', 'none');
  release();
  await expect(page.getByRole('heading', { name: 'Câu chuyện ẩm thực Hà Nội.' })).toBeVisible();
  await expect(page.locator('header.header')).toHaveAttribute('data-retained-shell', 'true');
  await expect(page.locator('.page-entry')).toHaveCSS('animation-name', 'none');
});

test('session change discards an earlier account response even when it finishes last', async ({
  page,
}) => {
  let requests = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/content') return route.fulfill(json(content));
    if (path === '/api/auth/me') {
      const first = ++requests === 1;
      if (first) await held;
      return route.fulfill(
        json({ user: { ...user, name: first ? 'Tài khoản cũ' : 'Tài khoản mới' } }),
      );
    }
    if (path === '/api/notifications') return route.fulfill(json({ notifications: [], unread: 0 }));
    if (path === '/api/chat/config') return route.fulfill(json({ enabled: false }));
    return route.fulfill(json({ message: 'Fixture' }, 404));
  });
  await page.goto('/');
  await expect.poll(() => requests).toBe(1);
  await page.getByRole('button', { name: 'Mở menu tài khoản', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('customer-session-changed')));
  await expect.poll(() => requests).toBe(2);
  release();
  await expect(page.locator('#account-dropdown .account-dropdown-heading strong')).toHaveText(
    'Tài khoản mới',
  );
  await expect(page.locator('#account-dropdown [aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('#account-dropdown')).not.toContainText('Tài khoản cũ');
});
