import { test, expect, type Page } from '@playwright/test';
import content from '../../content/site.json';

const customer = {
  name: 'Ngọc Thành',
  phone: '0901234567',
  email: 'thanh@example.com',
  address: '12 Phố Trúc Bạch, Hà Nội',
};
const user = { id: 'customer-1', ...customer, role: 'customer' };
const config = {
  enabled: true,
  payments: { cod: true, payos: false },
  shippingFee: 30000,
  freeShippingThreshold: 500000,
  pricingNotice: 'Giá tạm cho bản giới thiệu',
};
const order = {
  id: 'order-1',
  code: 'HTV-0001',
  customer,
  items: [
    {
      productId: content.products[0].id,
      name: content.products[0].name,
      quantity: 1,
      unitPrice: 79000,
    },
  ],
  subtotal: 79000,
  shippingFee: 30000,
  total: 109000,
  status: 'pending',
  paymentStatus: 'unpaid',
  paymentMethod: 'cod',
  createdAt: '2026-10-04T10:00:00Z',
  note: '',
};
const json = (value: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(value),
});

async function prepare(page: Page, authenticated = false) {
  await page.route('**/api/content', (route) => route.fulfill(json(content)));
  await page.route('**/api/commerce/config', (route) => route.fulfill(json(config)));
  await page.route('**/api/auth/me', (route) =>
    route.fulfill(authenticated ? json({ user }) : json({ message: 'Chưa đăng nhập' }, 401)),
  );
  await page.route('**/api/account/addresses', (route) =>
    route.fulfill(
      json({ addresses: [{ id: 'address-1', label: 'Nhà riêng', ...customer, isDefault: true }] }),
    ),
  );
  await page.route('**/api/account/vouchers', (route) => route.fulfill(json({ vouchers: [] })));
  await page.goto('/san-pham');
  await page
    .getByRole('button', { name: 'Thêm vào giỏ Bánh Chả Hà Nội – Vị Truyền Thống', exact: true })
    .click();
}

test('cart quantities, removal and persistence match the checkout total', async ({ page }) => {
  await prepare(page);
  await expect(page.locator('.notification-toast')).toContainText('Đã thêm vào giỏ hàng');
  await page.goto('/gio-hang');
  await page
    .getByRole('button', { name: 'Tăng số lượng Bánh Chả Hà Nội – Vị Truyền Thống', exact: true })
    .click();
  await expect(
    page.getByLabel('Số lượng Bánh Chả Hà Nội – Vị Truyền Thống', { exact: true }),
  ).toHaveText('2');
  await expect(page.locator('.cart-subtotal')).toContainText('158.000');
  await page.reload();
  await expect(
    page.getByLabel('Số lượng Bánh Chả Hà Nội – Vị Truyền Thống', { exact: true }),
  ).toHaveText('2');
  await page
    .getByRole('button', { name: 'Giảm số lượng Bánh Chả Hà Nội – Vị Truyền Thống', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Xóa Bánh Chả Hà Nội – Vị Truyền Thống', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Chưa có thức quà nào' })).toBeVisible();
});

test('guest can open the secure order-tracking link from the confirmation email', async ({
  page,
}) => {
  const trackedOrder = { ...order, id: 'a'.repeat(24) };
  const accessToken = 'a'.repeat(64);
  let submittedToken = '';
  await page.route('**/api/content', (route) => route.fulfill(json(content)));
  await page.route('**/api/commerce/config', (route) => route.fulfill(json(config)));
  await page.route('**/api/auth/me', (route) =>
    route.fulfill(json({ message: 'Chưa đăng nhập' }, 401)),
  );
  await page.route(`**/api/orders/${trackedOrder.id}`, (route) => {
    submittedToken = route.request().headers()['x-order-token'] || '';
    return route.fulfill(json(trackedOrder));
  });

  await page.goto(`/don-hang/${trackedOrder.id}#token=${accessToken}`);

  await expect(page.getByRole('heading', { name: `Đơn hàng ${trackedOrder.code}` })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/don-hang/${trackedOrder.id}$`));
  expect(submittedToken).toBe(accessToken);
});

test('failed checkout keeps cart and customer fields; retry uses the same request key', async ({
  page,
}) => {
  await prepare(page);
  const requests: { key: string | undefined; body: unknown }[] = [];
  await page.route('**/api/orders', async (route) => {
    requests.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON(),
    });
    await route.fulfill(
      requests.length === 1
        ? json({ message: 'Tạm thời chưa tiếp nhận đơn' }, 503)
        : json({ order, accessToken: 'guest-secret-key', paymentUrl: null }),
    );
  });
  await page.route('**/api/orders/order-1', (route) => route.fulfill(json(order)));
  await page.goto('/thanh-toan');
  await page.getByLabel('Họ và tên người nhận').fill(customer.name);
  await page.getByLabel('Số điện thoại nhận hàng').fill(customer.phone);
  await page.getByLabel('Email nhận thông tin').fill(customer.email);
  await page.getByLabel('Địa chỉ giao hàng đầy đủ').fill(customer.address);
  await page.getByLabel(/Tôi đã kiểm tra đơn hàng/).check();
  await page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Tạm thời chưa tiếp nhận đơn');
  await expect(page.getByLabel('Họ và tên người nhận')).toHaveValue(customer.name);
  await expect(page.locator('.cart-lines')).toContainText('Bánh Chả Hà Nội – Vị Truyền Thống');
  await page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đơn hàng HTV-0001' })).toBeVisible();
  await expect(page.locator('.notification-toast')).toContainText('Đặt hàng thành công');
  expect(requests).toHaveLength(2);
  expect(requests[0].key).toBeTruthy();
  expect(requests[1]).toEqual(requests[0]);
  await expect(page.getByLabel('Khóa tra cứu', { exact: true })).toHaveValue('guest-secret-key');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('htv-cart') || '[]'))).toEqual(
    [],
  );
});

test('signed-in checkout prefills the default address and validates a voucher before applying it', async ({
  page,
}) => {
  await prepare(page, true);
  let submitted: Record<string, unknown> | null = null;
  await page.route('**/api/account/vouchers/quote', (route) => {
    expect(route.request().postDataJSON()).toEqual({
      code: 'CAMON',
      items: [{ productId: content.products[0].id, quantity: 1 }],
    });
    return route.fulfill(json({ code: 'CAMON', discount: 10000, subtotal: 79000 }));
  });
  await page.route('**/api/orders', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill(
      json({
        order: { ...order, discount: 10000, voucherCode: 'CAMON', total: 99000 },
        accessToken: '',
        paymentUrl: null,
      }),
    );
  });
  await page.route('**/api/orders/order-1', (route) =>
    route.fulfill(json({ ...order, discount: 10000, voucherCode: 'CAMON', total: 99000 })),
  );
  await page.goto('/thanh-toan');
  await expect(page.getByLabel('Địa chỉ giao hàng đầy đủ')).toHaveValue(customer.address);
  await expect(page.getByLabel('Số điện thoại nhận hàng')).toHaveValue(customer.phone);
  await page.getByLabel('Mã ưu đãi', { exact: true }).fill('CAMON');
  await page.getByRole('button', { name: 'Áp dụng ưu đãi' }).click();
  await expect(page.locator('p[role=status]')).toContainText('Đã áp dụng CAMON');
  await expect(page.locator('.grand-total')).toContainText('99.000');
  await page.getByLabel(/Tôi đã kiểm tra đơn hàng/).check();
  await page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đơn hàng HTV-0001' })).toBeVisible();
  expect(submitted).toMatchObject({ customer, voucherCode: 'CAMON', paymentMethod: 'cod' });
  await expect(page.getByRole('heading', { name: 'Giữ lại khóa tra cứu của bạn' })).toHaveCount(0);
});

test('refunded payOS orders show reconciliation status without offering another payment', async ({
  page,
}) => {
  await page.route('**/api/content', (route) => route.fulfill(json(content)));
  await page.route('**/api/orders/order-1', (route) =>
    route.fulfill(
      json({ ...order, status: 'returned', paymentStatus: 'refunded', paymentMethod: 'payos' }),
    ),
  );
  await page.goto('/don-hang/order-1');
  await expect(page.getByRole('heading', { name: 'Đơn hàng HTV-0001' })).toBeVisible();
  await expect(page.locator('.order-badges')).toContainText('Đã hoàn tiền');
  await expect(page.locator('main')).toContainText('đối soát giao dịch thực tế');
  await expect(page.getByRole('button', { name: 'Thanh toán VietQR qua payOS' })).toHaveCount(0);
});

test('account owners can view shipment history without a guest retrieval key', async ({ page }) => {
  await page.route('**/api/content', (route) => route.fulfill(json(content)));
  await page.route('**/api/orders/order-1', (route) => {
    expect(route.request().headers()['x-order-token']).toBeUndefined();
    return route.fulfill(
      json({
        ...order,
        status: 'shipping',
        carrier: 'GHN',
        trackingNumber: 'GHN001',
        shippingEvents: [
          {
            status: 'shipping',
            description: 'Đã tiếp nhận tại bưu cục',
            location: 'Hà Nội',
            occurredAt: '2026-10-04T11:00:00Z',
          },
        ],
      }),
    );
  });
  await page.goto('/don-hang/order-1');
  await expect(page.getByRole('heading', { name: 'Đơn hàng HTV-0001' })).toBeVisible();
  await expect(page.locator('.shipping-timeline')).toContainText('Đã tiếp nhận tại bưu cục');
  await expect(page.locator('main')).toContainText('GHN001');
  await expect(page.getByRole('heading', { name: 'Giữ lại khóa tra cứu của bạn' })).toHaveCount(0);
});

test('public product reviews display verified feedback and do not invent ratings', async ({
  page,
}) => {
  await page.route('**/api/content', (route) => route.fulfill(json(content)));
  await page.route('**/api/products/banh-cha-truyen-thong/reviews', (route) =>
    route.fulfill(
      json({
        reviews: [
          {
            id: 'review-1',
            rating: 4,
            authorName: 'Ngọc Thành',
            comment: 'Bánh thơm, đóng gói đẹp.',
            createdAt: '2026-10-04T11:00:00Z',
          },
        ],
      }),
    ),
  );
  await page.goto('/san-pham/banh-cha-truyen-thong');
  await expect(page.locator('.review-average')).toContainText('4.0/5');
  await expect(page.locator('.review-card')).toContainText('Bánh thơm, đóng gói đẹp.');
  await expect(page.locator('.review-card')).toContainText('Đã mua hàng');
});
