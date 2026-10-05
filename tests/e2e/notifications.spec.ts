import { test, expect } from '@playwright/test';
import content from '../../content/site.json';

const json = (value: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(value),
});

test('new account notifications show a badge and a toast linking to details', async ({ page }) => {
  let notificationPolls = 0;
  await page.route('**/api/content', (route) => route.fulfill(json(content)));
  await page.route('**/api/commerce/config', (route) =>
    route.fulfill(
      json({
        enabled: true,
        payments: { cod: true, payos: false },
        shippingFee: 30000,
        freeShippingThreshold: 500000,
        pricingNotice: '',
      }),
    ),
  );
  await page.route('**/api/auth/me', (route) =>
    route.fulfill(
      json({
        user: {
          id: 'customer-1',
          name: 'Khách hàng',
          email: 'customer@example.com',
          phone: '',
          role: 'customer',
          accountStatus: 'active',
          accountStatusReason: '',
          accountStatusChangedAt: null,
        },
      }),
    ),
  );
  await page.route('**/api/notifications**', (route) => {
    if (route.request().method() === 'PATCH') return route.fulfill(json({ updated: 1 }));
    notificationPolls += 1;
    const notifications =
      notificationPolls === 1
        ? []
        : [3, 2, 1].map((index) => ({
            id: `notification-${index}`,
            category: 'order',
            title: `Đơn hàng ${index} đã được tiếp nhận`,
            message: `Đơn HTV-000${index} đang chờ xác nhận.`,
            href: '/tai-khoan?section=notifications',
            createdAt: `2026-10-05T10:0${index}:00.000Z`,
            readAt: null,
          }));
    return route.fulfill(
      json({
        notifications,
        unread: notifications.length,
        total: notifications.length,
        page: 1,
        limit: 10,
      }),
    );
  });

  await page.goto('/');
  await expect.poll(() => notificationPolls).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  const toast = page.locator('.notification-toast');
  await expect(toast).toHaveCount(2);
  await expect(toast.nth(0)).toContainText('Đơn hàng 2 đã được tiếp nhận');
  await expect(toast.nth(1)).toContainText('Đơn hàng 3 đã được tiếp nhận');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(toast).toHaveCount(3);
  await expect(toast.nth(2)).toContainText('Đơn hàng 1 đã được tiếp nhận');
  await expect(page.locator('.account-notification-dot')).toBeVisible();
  await toast.nth(2).getByRole('link', { name: 'Xem chi tiết' }).click();
  await expect(page).toHaveURL(/\/tai-khoan\?section=notifications/);
});
