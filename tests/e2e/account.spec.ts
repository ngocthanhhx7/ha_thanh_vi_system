import { test, expect } from '@playwright/test';
import content from '../../content/site.json';

const json = (value: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(value),
});
const user = {
  id: 'customer-1',
  name: 'Khách Hà Nội',
  email: 'khach@example.com',
  phone: '0901234567',
  role: 'customer',
};

test('customer signs in, adds a default address, sees it at checkout and signs out', async ({
  page,
}) => {
  let signedIn = false;
  const addresses: Record<string, unknown>[] = [];
  await page.route('**/api/content', (route) => route.fulfill(json(content)));
  await page.route('**/api/auth/me', (route) =>
    route.fulfill(signedIn ? json({ user }) : json({ message: 'Chưa đăng nhập' }, 401)),
  );
  await page.route('**/api/auth/login', (route) => {
    expect(route.request().postDataJSON()).toEqual({
      email: user.email,
      password: 'customerPassword123',
    });
    signedIn = true;
    return route.fulfill(json({ user }));
  });
  await page.route('**/api/auth/logout', (route) => {
    signedIn = false;
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/account/orders', (route) => route.fulfill(json({ orders: [] })));
  await page.route('**/api/account/vouchers', (route) => route.fulfill(json({ vouchers: [] })));
  await page.route('**/api/account/addresses', (route) => {
    if (route.request().method() === 'POST') {
      const address = { id: 'address-1', ...route.request().postDataJSON() };
      addresses.push(address);
      return route.fulfill(json({ address }));
    }
    return route.fulfill(json({ addresses }));
  });
  await page.route('**/api/commerce/config', (route) =>
    route.fulfill(
      json({
        enabled: true,
        payments: { cod: true, payos: false },
        shippingFee: 30000,
        freeShippingThreshold: 500000,
        pricingNotice: 'Giá tạm',
      }),
    ),
  );
  await page.goto('/');
  if (await page.getByRole('button', { name: 'Mở menu', exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Tài khoản', exact: true }).click();
  } else await page.getByRole('link', { name: 'Tài khoản', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('customerPassword123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Xin chào, Khách Hà Nội.' })).toBeVisible();
  await page.getByRole('button', { name: 'Sổ địa chỉ', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm địa chỉ', exact: true }).click();
  await page.getByLabel('Người nhận', { exact: true }).fill('Người nhận quà');
  await page.getByLabel('Số điện thoại', { exact: true }).fill('0912345678');
  await page.getByLabel('Địa chỉ đầy đủ', { exact: true }).fill('12 Phố Trúc Bạch, Hà Nội');
  await expect(page.getByLabel('Đặt làm địa chỉ mặc định')).toBeChecked();
  await page.getByRole('button', { name: 'Lưu địa chỉ', exact: true }).click();
  await expect(page.locator('.account-notice')).toContainText('Đã lưu địa chỉ nhận hàng');
  await expect(page.locator('.account-content')).toContainText('Người nhận quà');
  await page.goto('/san-pham');
  await page
    .getByRole('button', { name: 'Thêm vào giỏ Bánh chả truyền thống', exact: true })
    .click();
  await page.goto('/thanh-toan');
  await expect(page.getByLabel('Họ và tên người nhận')).toHaveValue('Người nhận quà');
  await expect(page.getByLabel('Số điện thoại nhận hàng')).toHaveValue('0912345678');
  await expect(page.getByLabel('Địa chỉ giao hàng đầy đủ')).toHaveValue('12 Phố Trúc Bạch, Hà Nội');
  await page.goto('/tai-khoan');
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mừng bạn trở lại' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Xin chào, Khách Hà Nội.' })).toHaveCount(0);
});

test('address save failures remain visible and retain entered data', async ({ page }) => {
  await page.route('**/api/content', (route) => route.fulfill(json(content)));
  await page.route('**/api/auth/me', (route) => route.fulfill(json({ user })));
  await page.route('**/api/account/orders', (route) => route.fulfill(json({ orders: [] })));
  await page.route('**/api/account/addresses', (route) =>
    route.fulfill(
      route.request().method() === 'POST'
        ? json({ message: 'Chưa lưu được địa chỉ' }, 503)
        : json({ addresses: [] }),
    ),
  );
  await page.goto('/tai-khoan');
  await page.getByRole('button', { name: 'Sổ địa chỉ', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm địa chỉ', exact: true }).click();
  await page.getByLabel('Địa chỉ đầy đủ', { exact: true }).fill('12 Phố Trúc Bạch, Hà Nội');
  await page.getByRole('button', { name: 'Lưu địa chỉ', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Chưa lưu được địa chỉ');
  await expect(page.getByRole('textbox', { name: 'Địa chỉ đầy đủ', exact: true })).toHaveValue(
    '12 Phố Trúc Bạch, Hà Nội',
  );
  await expect(page.getByText('Đã lưu địa chỉ nhận hàng.', { exact: true })).toHaveCount(0);
});
