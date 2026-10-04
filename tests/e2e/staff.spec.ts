import { test, expect, type Page } from '@playwright/test';
import content from '../../content/site.json';
import type { Order } from '../../frontend/src/constants/commerce';

const json = (value: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(value),
});
const baseOrder: Order = {
  id: 'order-1',
  code: 'HTV-STAFF-001',
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
  status: 'confirmed',
  paymentStatus: 'unpaid',
  paymentMethod: 'cod',
  createdAt: '2026-10-04T10:00:00Z',
  customer: {
    name: 'Khách Hà Nội',
    email: 'khach@example.com',
    phone: '0901234567',
    address: '12 Phố Trúc Bạch, Hà Nội',
  },
  note: '',
};
async function prepare(
  page: Page,
  role: 'staff' | 'admin' | 'customer' = 'staff',
  orders: Order[] = [],
) {
  await page.route('**/api/content', (route) => route.fulfill(json(content)));
  await page.route('**/api/auth/me', (route) =>
    route.fulfill(
      json({
        user: {
          id: 'operator-1',
          name: 'Ngọc Thành',
          email: 'thanh@example.com',
          phone: '0901234567',
          role,
        },
      }),
    ),
  );
  await page.route(/\/api\/admin\/orders\?/, (route) =>
    route.fulfill(json({ orders, total: orders.length })),
  );
}

test('staff advances an order and records its real carrier, tracking number and shipping event', async ({
  page,
}) => {
  const orders = [{ ...baseOrder }];
  await prepare(page, 'staff', orders);
  let submitted: unknown;
  await page.route('**/api/admin/orders/order-1', (route) => {
    expect(route.request().method()).toBe('PATCH');
    expect(route.request().headers()['x-requested-with']).toBe('XMLHttpRequest');
    expect(route.request().headers().authorization).toBeUndefined();
    const body = route.request().postDataJSON();
    submitted = body;
    orders[0] = {
      ...orders[0],
      status: body.status,
      carrier: body.carrier,
      trackingNumber: body.trackingNumber,
      shippingEvents: [{ ...body.shippingEvent, occurredAt: '2026-10-04T11:00:00Z' }],
    };
    return route.fulfill(json(orders[0]));
  });
  await page.goto('/quan-tri');
  await expect(page.getByRole('heading', { name: 'Đơn HTV-STAFF-001' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Bước xử lý', exact: true }).selectOption('shipping');
  await page.getByLabel('Đơn vị vận chuyển', { exact: true }).fill('GHN');
  await page.getByLabel('Mã vận đơn', { exact: true }).fill('GHN001');
  await page.getByLabel('Cập nhật hành trình', { exact: true }).fill('Bưu cục đã nhận kiện hàng');
  await page.getByRole('button', { name: 'Cập nhật đơn', exact: true }).click();
  await expect(page.locator('.shipping-timeline')).toContainText('Bưu cục đã nhận kiện hàng');
  await expect(page.getByRole('combobox', { name: 'Bước xử lý', exact: true })).toHaveValue(
    'shipping',
  );
  expect(submitted).toEqual({
    status: 'shipping',
    carrier: 'GHN',
    trackingNumber: 'GHN001',
    shippingEvent: { status: 'shipping', description: 'Bưu cục đã nhận kiện hàng' },
  });
});

test('staff can reply to a customer ticket and see the persisted response', async ({ page }) => {
  await prepare(page);
  const tickets = [
    {
      id: 'ticket-1',
      orderId: 'order-1',
      kind: 'support',
      status: 'open',
      message: 'Tôi cần kiểm tra ngày giao hàng.',
      createdAt: '2026-10-04T10:00:00Z',
      replies: [] as { message: string; createdAt: string }[],
    },
  ];
  await page.route('**/api/staff/tickets', (route) => route.fulfill(json({ tickets })));
  let submitted: unknown;
  await page.route('**/api/staff/tickets/ticket-1', (route) => {
    const body = route.request().postDataJSON();
    submitted = body;
    tickets[0].status = body.status;
    tickets[0].replies.push({ message: body.reply, createdAt: '2026-10-04T11:00:00Z' });
    return route.fulfill(json({ ticket: tickets[0] }));
  });
  await page.goto('/quan-tri');
  await page.getByRole('button', { name: 'Chăm sóc khách hàng', exact: true }).click();
  await expect(page.locator('.staff-ticket')).toContainText('Tôi cần kiểm tra ngày giao hàng.');
  await page.getByRole('combobox', { name: 'Trạng thái', exact: true }).selectOption('in_progress');
  await page
    .getByLabel('Phản hồi khách hàng', { exact: true })
    .fill('Cửa hàng đã liên hệ đơn vị vận chuyển và sẽ cập nhật cho bạn.');
  await page.getByRole('button', { name: 'Gửi phản hồi', exact: true }).click();
  await expect(page.locator('.staff-ticket blockquote')).toContainText(
    'Cửa hàng đã liên hệ đơn vị vận chuyển',
  );
  await expect(page.getByRole('combobox', { name: 'Trạng thái', exact: true })).toHaveValue(
    'in_progress',
  );
  expect(submitted).toEqual({
    status: 'in_progress',
    reply: 'Cửa hàng đã liên hệ đơn vị vận chuyển và sẽ cập nhật cho bạn.',
  });
});

test('admin creates staff credentials and issues an automatic voucher with exact conditions', async ({
  page,
}) => {
  await prepare(page, 'admin');
  const users: Record<string, unknown>[] = [];
  const vouchers: Record<string, unknown>[] = [];
  let staffBody: unknown;
  let voucherBody: Record<string, unknown> | undefined;
  await page.route('**/api/admin/users', (route) => route.fulfill(json({ users })));
  await page.route('**/api/admin/staff', (route) => {
    staffBody = route.request().postDataJSON();
    users.push({ id: 'new-staff', ...route.request().postDataJSON(), role: 'staff' });
    return route.fulfill(json({ user: users[0] }, 201));
  });
  await page.route('**/api/admin/vouchers', (route) => {
    if (route.request().method() === 'POST') {
      voucherBody = route.request().postDataJSON();
      vouchers.push({ id: 'campaign-1', ...voucherBody });
      return route.fulfill(json({ voucher: vouchers[0] }, 201));
    }
    return route.fulfill(json({ vouchers }));
  });
  await page.goto('/quan-tri');
  await page.getByRole('button', { name: 'Nhân sự', exact: true }).click();
  await page.getByLabel('Họ tên', { exact: true }).fill('Nhân viên bán hàng');
  await page.getByLabel('Email', { exact: true }).fill('staff@example.com');
  await page.getByLabel('Số điện thoại', { exact: true }).fill('0912345678');
  await page.getByLabel('Mật khẩu ban đầu', { exact: true }).fill('initialPassword123');
  await page.getByRole('button', { name: 'Tạo nhân viên', exact: true }).click();
  await expect(page.locator('.staff-page .form-status')).toContainText(
    'Đã tạo tài khoản nhân viên.',
  );
  await expect(page.locator('table tbody')).toContainText('staff@example.com');
  expect(staffBody).toEqual({
    name: 'Nhân viên bán hàng',
    email: 'staff@example.com',
    phone: '0912345678',
    password: 'initialPassword123',
  });
  await page.getByRole('button', { name: 'Voucher', exact: true }).click();
  await page.getByLabel('Mã ưu đãi', { exact: true }).fill('HATHANH10');
  await page.getByLabel('Tên chiến dịch', { exact: true }).fill('Ưu đãi khai trương');
  await page.getByRole('combobox', { name: 'Loại', exact: true }).selectOption('percent');
  await page.getByLabel('Giá trị', { exact: true }).fill('10');
  await page.getByLabel('Đơn tối thiểu', { exact: true }).fill('150000');
  await page.getByLabel('Giảm tối đa (0: không giới hạn)', { exact: true }).fill('50000');
  await page.getByLabel('Bắt đầu', { exact: true }).fill('2026-10-04T10:00');
  await page.getByLabel('Kết thúc', { exact: true }).fill('2026-10-20T23:59');
  await page.getByRole('combobox', { name: 'Cách nhận', exact: true }).selectOption('automatic');
  await page.getByLabel('Tổng lượt dùng', { exact: true }).fill('200');
  await page.getByLabel('Lượt mỗi khách', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Phát hành ưu đãi', exact: true }).click();
  await expect(page.locator('.staff-page .form-status')).toContainText('Đã phát hành voucher.');
  await expect(page.locator('.campaign-card')).toContainText('HATHANH10');
  await expect(page.locator('.campaign-card')).toContainText('Tự động vào ví');
  expect(voucherBody).toMatchObject({
    code: 'HATHANH10',
    name: 'Ưu đãi khai trương',
    type: 'percent',
    value: 10,
    minOrder: 150000,
    maxDiscount: 50000,
    distribution: 'automatic',
    totalLimit: 200,
    perUserLimit: 1,
    active: true,
  });
  expect(Number.isNaN(Date.parse(String(voucherBody?.startsAt)))).toBeFalsy();
  expect(Date.parse(String(voucherBody?.expiresAt))).toBeGreaterThan(
    Date.parse(String(voucherBody?.startsAt)),
  );
});

test('customers cannot see or request management data; staff sees only order and support tabs', async ({
  page,
}) => {
  await prepare(page, 'customer');
  let privateRequests = 0;
  page.on('request', (request) => {
    if (/\/api\/(admin|staff)\//.test(request.url())) privateRequests++;
  });
  await page.goto('/quan-tri');
  await expect(page.locator('.staff-page')).toContainText(
    'Tài khoản của bạn không có quyền truy cập',
  );
  await expect(page.getByRole('navigation', { name: 'Các mục quản trị' })).toHaveCount(0);
  expect(privateRequests).toBe(0);
  await page.route('**/api/auth/me', (route) =>
    route.fulfill(
      json({
        user: {
          id: 'staff-1',
          name: 'Nhân viên',
          email: 'staff@example.com',
          phone: '0901234567',
          role: 'staff',
        },
      }),
    ),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Điều hành cửa hàng' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đơn hàng', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Chăm sóc khách hàng', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nhân sự', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Voucher', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Chỉnh nội dung', exact: true })).toHaveCount(0);
});

test('unpaid payOS order cannot be selected for fulfillment in the staff interface', async ({
  page,
}) => {
  await prepare(page, 'staff', [
    { ...baseOrder, status: 'pending', paymentMethod: 'payos', paymentStatus: 'unpaid' },
  ]);
  await page.goto('/quan-tri');
  await expect(page.getByRole('heading', { name: 'Đơn HTV-STAFF-001' })).toBeVisible();
  await expect(page.locator('.managed-order')).toContainText('Đơn VietQR cần xác nhận thanh toán');
  const states = await page
    .getByRole('combobox', { name: 'Bước xử lý', exact: true })
    .locator('option')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(states).toEqual(['pending', 'cancelled']);
  await expect(page.getByLabel('Đã đối soát và thu đủ tiền COD', { exact: true })).toHaveCount(0);
});

test('admin marks a returned COD order for refund and confirms only the recorded real refund', async ({
  page,
}) => {
  const orders = [{ ...baseOrder, status: 'returned', paymentStatus: 'paid' }];
  await prepare(page, 'admin', orders);
  const submitted: unknown[] = [];
  await page.route('**/api/admin/orders/order-1', (route) => {
    const body = route.request().postDataJSON();
    submitted.push(body);
    orders[0] = { ...orders[0], ...body };
    return route.fulfill(json(orders[0]));
  });
  await page.goto('/quan-tri');
  const refund = page.getByRole('combobox', { name: /Đối soát hoàn tiền/ });
  await expect(page.locator('.managed-order')).toContainText(
    'thao tác này không chuyển tiền tự động',
  );
  await refund.selectOption('refund_pending');
  await page.getByRole('button', { name: 'Cập nhật đơn', exact: true }).click();
  await expect(page.locator('.order-badges')).toContainText('Chờ hoàn tiền');
  await refund.selectOption('refunded');
  await page.getByRole('button', { name: 'Cập nhật đơn', exact: true }).click();
  await expect(page.locator('.order-badges')).toContainText('Đã hoàn tiền');
  expect(submitted).toEqual([
    { status: 'returned', paymentStatus: 'refund_pending' },
    { status: 'returned', paymentStatus: 'refunded' },
  ]);
});
