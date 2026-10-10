import { test, expect, type Page } from '@playwright/test';
import content from '../../content/site.json';

const json = (value: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(value),
});
const roles = ['customer', 'staff', 'admin'] as const;
const destination = {
  customer: '/',
  staff: '/quan-tri?tab=dashboard',
  admin: '/admin?tab=overview',
};
async function prepare(page: Page, role: (typeof roles)[number], initiallySignedIn = false) {
  let signedIn = initiallySignedIn;
  const user = {
    id: 'redirect-user',
    name: 'Người dùng',
    email: 'redirect@example.com',
    phone: '0901234567',
    role,
  };
  await page.route('**/api/**', (route) => route.fulfill(json({})));
  await page.route('**/api/content', (route) => route.fulfill(json(content)));
  await page.route('**/api/auth/me', (route) =>
    route.fulfill(signedIn ? json({ user }) : json({ message: 'Chưa đăng nhập' }, 401)),
  );
  await page.route('**/api/account/orders', (route) => route.fulfill(json({ orders: [] })));
  await page.route('**/api/notifications*', (route) =>
    route.fulfill(json({ notifications: [], unread: 0, total: 0, page: 1, limit: 1 })),
  );
  await page.route('**/api/staff/dashboard', (route) =>
    route.fulfill(
      json({
        orders: { pending: 0, returnRequested: 0, byStatus: [], daily: [] },
        support: { open: 0 },
        chat: { waiting: 0, assignedToMe: 0 },
      }),
    ),
  );
  await page.route('**/api/admin/statistics*', (route) =>
    route.fulfill(
      json({
        orders: 0,
        totalCollected: 0,
        delivered: 0,
        pending: 0,
        customers: 0,
        products: content.products.length,
        byStatus: [],
        topProducts: [],
        dailyOrders: [],
      }),
    ),
  );
  await page.route('**/api/auth/logout', (route) => {
    signedIn = false;
    return route.fulfill({ status: 204 });
  });
  return {
    user,
    signIn: () => {
      signedIn = true;
    },
  };
}

for (const role of roles) {
  for (const flow of ['trusted device', 'OTP'] as const) {
    test(`${role} ${flow} login redirects to its home or dashboard`, async ({ page }) => {
      const session = await prepare(page, role);
      await page.route('**/api/auth/login', (route) => {
        if (flow === 'OTP')
          return route.fulfill(
            json({
              otpRequired: true,
              challengeId: 'redirect-challenge',
              email: session.user.email,
            }),
          );
        session.signIn();
        return route.fulfill(json({ user: session.user }));
      });
      await page.route('**/api/auth/verify-login', (route) => {
        expect(route.request().postDataJSON()).toEqual({
          challengeId: 'redirect-challenge',
          code: '123456',
        });
        session.signIn();
        return route.fulfill(json({ user: session.user }));
      });
      await page.goto('/tai-khoan?section=vouchers');
      await page.getByLabel('Email', { exact: true }).fill(session.user.email);
      await page.getByLabel('Mật khẩu', { exact: true }).fill('password123');
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).last().click();
      if (flow === 'OTP') {
        await page.getByLabel('Mã xác minh', { exact: true }).fill('123456');
        await page.getByRole('button', { name: 'Xác minh', exact: true }).click();
      }
      await expect(page).toHaveURL(
        role === 'customer'
          ? /\/$/
          : role === 'staff'
            ? /\/quan-tri\?tab=dashboard$/
            : /\/admin\?tab=overview$/,
      );
      if (role !== 'customer')
        await expect(
          page.getByRole('heading', {
            name: role === 'admin' ? 'Tổng quan vận hành' : 'Tổng quan công việc',
          }),
        ).toBeVisible();
    });
  }
  test(`${role} account logout goes home and clears the session`, async ({ page }) => {
    await prepare(page, role, true);
    await page.goto('/tai-khoan');
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/tai-khoan');
    await expect(page.getByRole('heading', { name: 'Mừng bạn trở lại' })).toBeVisible();
  });
  test(`${role} public account menu logout goes home`, async ({ page }) => {
    await prepare(page, role, true);
    await page.goto('/san-pham');
    await page.getByRole('button', { name: 'Mở menu tài khoản', exact: true }).click();
    await page.locator('.account-dropdown-logout').click();
    await expect(page).toHaveURL(/\/$/);
  });
}

for (const role of ['staff', 'admin'] as const) {
  test(`${role} workspace logout goes home`, async ({ page }) => {
    await prepare(page, role, true);
    await page.goto(destination[role]);
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  });
}

test('failed logout keeps the account page and shows the failure', async ({ page }) => {
  await prepare(page, 'customer', true);
  await page.route('**/api/auth/logout', (route) =>
    route.fulfill(json({ message: 'Chưa thể đăng xuất. Vui lòng thử lại.' }, 503)),
  );
  await page.goto('/tai-khoan');
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page).toHaveURL(/\/tai-khoan$/);
  await expect(page.getByRole('alert')).toContainText('Chưa thể đăng xuất');
  await expect(page.getByRole('heading', { name: 'Xin chào, Người dùng.' })).toBeVisible();
});

test('admin workspace images retain native context menus and dragging', async ({ page }) => {
  await prepare(page, 'admin', true);
  await page.goto(destination.admin);
  const image = page.locator('.workspace-shell img:visible').first();
  await expect(image).toBeVisible();
  expect(
    await image.evaluate((element) =>
      element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    ),
  ).toBe(true);
  expect(
    await image.evaluate((element) =>
      element.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true })),
    ),
  ).toBe(true);
});

test('public image context menus and dragging are blocked while text and links retain context menus', async ({
  page,
}) => {
  await prepare(page, 'customer');
  await page.goto('/san-pham');
  const image = page.locator('.public-layout img').first();
  await expect(image).toBeVisible();
  expect(
    await image.evaluate(
      (element) =>
        !element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    ),
  ).toBe(true);
  expect(
    await image.evaluate(
      (element) =>
        !element.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true })),
    ),
  ).toBe(true);
  await expect(image).toHaveCSS('user-select', 'none');
  expect(
    await page
      .locator('.public-layout h1')
      .first()
      .evaluate((element) =>
        element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
      ),
  ).toBe(true);
  expect(
    await page
      .locator('.public-layout a')
      .first()
      .evaluate((element) =>
        element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
      ),
  ).toBe(true);
});
