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
  await page.route('**/api/**', (route) => route.fulfill(json({})));
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
  await page.route('**/api/notifications*', (route) =>
    route.fulfill(json({ notifications: [], unread: 0, total: 0, page: 1, limit: 1 })),
  );
  await page.route('**/api/admin/appeals', (route) => route.fulfill(json({ appeals: [] })));
  await page.route('**/api/staff/dashboard', (route) =>
    route.fulfill(
      json({
        orders: { pending: 0, returnRequested: 0, byStatus: [], daily: [] },
        support: { open: 0 },
        chat: { waiting: 0, assignedToMe: 0 },
      }),
    ),
  );
  await page.route('**/api/staff/chat-handoffs/summary', (route) =>
    route.fulfill(json({ waiting: 0, unread: 0 })),
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
  await page.goto('/quan-tri?tab=orders');
  await page.getByRole('button', { name: 'Tất cả đơn hàng', exact: true }).click();
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
  await page.goto('/quan-tri?tab=tickets');
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

test('staff inbox notifies, claims, replies to, and resolves a Vị Ơi handoff', async ({ page }) => {
  await prepare(page);
  const handoff = {
    id: 'handoff-1',
    status: 'waiting',
    customerType: 'guest',
    assignedStaffName: null,
    assignedStaffId: null,
    createdAt: '2026-10-04T10:00:00Z',
    updatedAt: '2026-10-04T10:00:00Z',
    lastMessageAt: '2026-10-04T10:00:00Z',
    lastMessagePreview: 'Mình cần tư vấn set quà.',
    staffUnreadCount: 1,
    customerUnreadCount: 0,
    messages: [
      {
        id: 'customer-message',
        sender: 'customer',
        content: 'Mình cần tư vấn set quà.',
        authorName: null,
        createdAt: '2026-10-04T10:00:00Z',
      },
    ],
  };
  await page.route('**/api/staff/chat-handoffs/summary', (route) =>
    route.fulfill(json({ waiting: handoff.status === 'waiting' ? 1 : 0, unread: 1 })),
  );
  await page.route('**/api/staff/chat-handoffs', (route) =>
    route.fulfill(json({ handoffs: [handoff], summary: { waiting: 1, unread: 1 } })),
  );
  await page.route('**/api/staff/chat-handoffs/handoff-1', (route) =>
    route.fulfill(json({ handoff })),
  );
  await page.route('**/api/staff/chat-handoffs/handoff-1/claim', (route) => {
    handoff.status = 'assigned';
    handoff.assignedStaffId = 'operator-1';
    handoff.assignedStaffName = 'Ngọc Thành';
    handoff.updatedAt = '2026-10-04T10:02:00Z';
    return route.fulfill(json({ handoff }));
  });
  await page.route('**/api/staff/chat-handoffs/handoff-1/messages', (route) => {
    const body = route.request().postDataJSON();
    handoff.messages.push({
      id: 'staff-message',
      sender: 'staff',
      content: body.message,
      authorName: 'Ngọc Thành',
      createdAt: '2026-10-04T10:03:00Z',
    });
    handoff.lastMessagePreview = body.message;
    handoff.updatedAt = '2026-10-04T10:03:00Z';
    return route.fulfill(json({ handoff }));
  });
  await page.route('**/api/staff/chat-handoffs/handoff-1/resolve', (route) => {
    handoff.status = 'resolved';
    handoff.updatedAt = '2026-10-04T10:04:00Z';
    return route.fulfill(json({ handoff }));
  });

  await page.goto('/quan-tri?tab=chat');
  await expect(page.getByRole('link', { name: 'Hộp thư Vị Ơi' })).toBeVisible();
  await page.getByRole('button', { name: /Khách vãng lai/ }).click();
  await expect(page.locator('.staff-chat-transcript')).toContainText('Mình cần tư vấn set quà.');
  await page.getByRole('button', { name: 'Nhận xử lý', exact: true }).click();
  await page
    .getByLabel('Phản hồi khách hàng', { exact: true })
    .fill('Mình sẽ gợi ý set phù hợp với dịp tặng nhé.');
  await page.getByRole('button', { name: 'Gửi phản hồi', exact: true }).click();
  await expect(page.locator('.staff-chat-transcript')).toContainText(
    'Mình sẽ gợi ý set phù hợp với dịp tặng nhé.',
  );
  await page.getByRole('button', { name: 'Kết thúc tư vấn', exact: true }).click();
  await expect(page.locator('.staff-chat-closed')).toContainText('Cuộc tư vấn đã kết thúc');
});

test('admin creates staff credentials and issues an automatic voucher with exact conditions', async ({
  page,
}) => {
  await prepare(page, 'admin');
  const users: Record<string, unknown>[] = [];
  const vouchers: Record<string, unknown>[] = [];
  let staffBody: unknown;
  let voucherBody: Record<string, unknown> | undefined;
  await page.route('**/api/admin/users**', (route) =>
    route.fulfill(json({ users, total: users.length, page: 1, limit: 25 })),
  );
  await page.route('**/api/admin/staff', (route) => {
    staffBody = route.request().postDataJSON();
    const user = {
      id: 'new-staff',
      ...route.request().postDataJSON(),
      role: 'staff',
      accountStatus: 'active',
      accountStatusReason: '',
      accountStatusChangedAt: null,
    };
    users.push(user);
    return route.fulfill(json({ user }, 201));
  });
  await page.route('**/api/admin/vouchers', (route) => {
    if (route.request().method() === 'POST') {
      voucherBody = route.request().postDataJSON();
      vouchers.push({ id: 'campaign-1', walletCount: 0, ...voucherBody });
      return route.fulfill(json({ voucher: vouchers[0] }, 201));
    }
    return route.fulfill(json({ vouchers }));
  });
  await page.goto('/quan-tri?tab=users');
  await page.getByRole('button', { name: 'Thêm nhân viên', exact: true }).click();
  await page.getByLabel('Họ tên', { exact: true }).fill('Nhân viên bán hàng');
  await page.getByLabel('Email', { exact: true }).fill('staff@example.com');
  await page.getByLabel('Số điện thoại', { exact: true }).fill('0912345678');
  await page.getByLabel('Mật khẩu ban đầu', { exact: true }).fill('initialPassword123');
  await page.getByRole('button', { name: 'Tạo nhân viên', exact: true }).click();
  await expect(page.locator('.staff-page .form-status')).toContainText(
    'Đã tạo tài khoản nhân viên.',
  );
  await expect(page.locator('.admin-account-card')).toContainText('staff@example.com');
  expect(staffBody).toEqual({
    name: 'Nhân viên bán hàng',
    email: 'staff@example.com',
    phone: '0912345678',
    password: 'initialPassword123',
  });
  await page.getByRole('link', { name: 'Ưu đãi', exact: true }).click();
  await page.getByLabel('Mã ưu đãi', { exact: true }).fill('HATHANH10');
  await page.getByLabel('Tên chiến dịch', { exact: true }).fill('Ưu đãi khai trương');
  await page.getByRole('combobox', { name: 'Loại', exact: true }).selectOption('percent');
  await page.getByLabel('Giá trị', { exact: true }).fill('10');
  await page.getByLabel('Đơn tối thiểu', { exact: true }).fill('150000');
  await page.getByLabel('Giảm tối đa (0: không giới hạn)', { exact: true }).fill('50000');
  await page.getByLabel('Bắt đầu (giờ Việt Nam)', { exact: true }).fill('2026-10-04T10:00');
  await page.getByLabel('Kết thúc (giờ Việt Nam)', { exact: true }).fill('2026-10-20T23:59');
  await page.getByRole('combobox', { name: 'Cách nhận', exact: true }).selectOption('automatic');
  await page.getByLabel('Tổng lượt dùng', { exact: true }).fill('200');
  await page.getByLabel('Lượt mỗi khách', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Phát hành ưu đãi', exact: true }).click();
  await expect(page.locator('.staff-page .form-status')).toContainText(
    'Đã phát hành ưu đãi tự động cho khách hàng.',
  );
  await expect(page.locator('.campaign-card')).toContainText('HATHANH10');
  await expect(page.locator('.campaign-card')).toContainText('Tự động cho khách');
  expect(voucherBody).toMatchObject({
    code: 'HATHANH10',
    name: 'Ưu đãi khai trương',
    type: 'percent',
    value: 10,
    minOrder: 150000,
    maxDiscount: 50000,
    distribution: 'automatic',
    customerIds: [],
    startsAt: '2026-10-04T03:00:00.000Z',
    expiresAt: '2026-10-20T16:59:00.000Z',
    totalLimit: 200,
    perUserLimit: 1,
    active: true,
  });
  expect(Number.isNaN(Date.parse(String(voucherBody?.startsAt)))).toBeFalsy();
  expect(Date.parse(String(voucherBody?.expiresAt))).toBeGreaterThan(
    Date.parse(String(voucherBody?.startsAt)),
  );
});

test('admin grants a targeted voucher and can pause and reactivate it', async ({ page }) => {
  await prepare(page, 'admin');
  const recipient = {
    id: '507f1f77bcf86cd799439011',
    name: 'Khách nhận quà',
    email: 'gift@example.com',
    role: 'customer',
  };
  let campaign: Record<string, unknown> | undefined;
  const changes: boolean[] = [];
  await page.route('**/api/admin/users**', (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('role')).toBe('customer');
    expect(url.searchParams.get('accountStatus')).toBe('active');
    return route.fulfill(json({ users: [recipient], total: 1, page: 1, limit: 10 }));
  });
  await page.route('**/api/admin/vouchers', (route) => {
    if (route.request().method() === 'POST') {
      campaign = { id: 'target-campaign', walletCount: 1, ...route.request().postDataJSON() };
      return route.fulfill(json({ voucher: campaign, assignedCount: 1 }, 201));
    }
    return route.fulfill(json({ vouchers: campaign ? [campaign] : [] }));
  });
  await page.route('**/api/admin/vouchers/target-campaign', (route) => {
    expect(route.request().method()).toBe('PATCH');
    const { active } = route.request().postDataJSON();
    changes.push(active);
    campaign = { ...campaign, active };
    return route.fulfill(json({ voucher: campaign }));
  });
  await page.goto('/quan-tri?tab=vouchers');
  await page.getByLabel('Mã ưu đãi', { exact: true }).fill('GIFT20');
  await page.getByLabel('Tên chiến dịch', { exact: true }).fill('Quà cho khách');
  await page.getByLabel('Giá trị', { exact: true }).fill('20000');
  await page.getByLabel('Bắt đầu (giờ Việt Nam)', { exact: true }).fill('2030-10-04T10:00');
  await page.getByLabel('Kết thúc (giờ Việt Nam)', { exact: true }).fill('2030-10-20T23:59');
  await page.getByRole('combobox', { name: 'Cách nhận', exact: true }).selectOption('targeted');
  await page.getByRole('button', { name: 'Phát hành ưu đãi', exact: true }).click();
  await expect(page.locator('.form-status')).toContainText('Hãy chọn ít nhất một khách hàng');
  expect(campaign).toBeUndefined();
  await page.getByLabel('Tìm khách nhận ưu đãi').fill('gift');
  await page.getByRole('button', { name: /Khách nhận quà.*Thêm khách/ }).click();
  await expect(page.getByRole('list', { name: 'Khách đã chọn nhận voucher' })).toContainText(
    recipient.email,
  );
  await page.getByRole('button', { name: 'Phát hành ưu đãi', exact: true }).click();
  await expect(page.locator('.campaign-card')).toContainText('GIFT20');
  expect(campaign).toMatchObject({
    distribution: 'targeted',
    customerIds: [recipient.id],
    startsAt: '2030-10-04T03:00:00.000Z',
  });
  await page.getByRole('button', { name: 'Tạm ngưng voucher', exact: true }).click();
  await expect(page.locator('.campaign-status')).toHaveText('Tạm ngưng');
  await page.getByRole('button', { name: 'Kích hoạt lại', exact: true }).click();
  await expect(page.locator('.campaign-status')).toHaveText('Sắp diễn ra');
  expect(changes).toEqual([false, true]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
  await page.goto('/quan-tri?tab=orders');
  await expect(page.getByRole('heading', { name: 'Quản lý đơn hàng' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Đơn hàng', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Chăm sóc khách', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nhân sự & tài khoản', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ưu đãi', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Chỉnh nội dung', exact: true })).toHaveCount(0);
});

test('unpaid payOS order cannot be selected for fulfillment in the staff interface', async ({
  page,
}) => {
  await prepare(page, 'staff', [
    { ...baseOrder, status: 'pending', paymentMethod: 'payos', paymentStatus: 'unpaid' },
  ]);
  await page.goto('/quan-tri?tab=orders');
  await page.getByRole('button', { name: 'Chờ thanh toán', exact: true }).click();
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
  await page.goto('/quan-tri?tab=orders');
  await page.getByRole('button', { name: 'Đã đóng', exact: true }).click();
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

test('admin filters audit events and understands repeated authentication failures', async ({
  page,
}) => {
  await prepare(page, 'admin');
  const requests: URLSearchParams[] = [];
  await page.route('**/api/admin/system-logs*', (route) => {
    requests.push(new URL(route.request().url()).searchParams);
    return route.fulfill(
      json({
        logs: [
          {
            id: 'audit-1',
            actorName: 'Ngọc Thành',
            actorRole: 'admin',
            actorIp: '192.0.2.15',
            actorUserAgent: 'HTV-test-browser',
            requestId: 'request-audit-example',
            outcome: 'failure',
            reasonCode: 'HTTP_401',
            event: 'POST /auth/login',
            severity: 'warning',
            method: 'POST',
            path: '/auth/login',
            statusCode: 401,
            createdAt: '2026-10-05T11:30:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
        anomalies: [
          {
            type: 'repeated_auth_failures',
            count: 5,
            threshold: 5,
            windowMinutes: 15,
            actorIp: '192.0.2.15',
            latestAt: '2026-10-05T11:30:00.000Z',
          },
        ],
      }),
    );
  });
  await page.goto('/quan-tri?tab=logs');
  await expect(page.getByText('Nhiều lần xác thực thất bại từ cùng một địa chỉ IP')).toBeVisible();
  await expect(page.getByText('Tín hiệu cần rà soát', { exact: false })).toBeVisible();
  await expect(page.getByText('Đăng nhập tài khoản', { exact: true })).toBeVisible();
  await expect(page.locator('.workspace-log-plain-result')).toBeVisible();

  await page.getByLabel('Tìm người dùng, IP, request ID, mã hoặc từ khóa').fill('192.0.2.15');
  await expect.poll(() => requests.at(-1)?.get('q')).toBe('192.0.2.15');
  await page.getByLabel('Người thực hiện').selectOption('admin');
  await expect.poll(() => requests.at(-1)?.get('actorRole')).toBe('admin');
  await page.locator('.workspace-log-details summary').click();
  await expect(page.getByText('POST /auth/login')).toBeVisible();
  await expect(page.getByText('request-audit-example')).toBeVisible();
});

test('order workspace starts with a prioritized queue and sends search and filter criteria to the API', async ({
  page,
}) => {
  const orders = [
    { ...baseOrder, id: 'return-1', code: 'HTV-RETURN-001', status: 'return_requested' },
    { ...baseOrder, id: 'pending-1', code: 'HTV-PENDING-002', status: 'pending' },
  ];
  await prepare(page, 'staff', orders);
  const requests: URLSearchParams[] = [];
  await page.route(/\/api\/admin\/orders\?/, (route) => {
    requests.push(new URL(route.request().url()).searchParams);
    return route.fulfill(json({ orders, total: orders.length, page: 1, limit: 20 }));
  });
  await page.goto('/quan-tri?tab=orders');
  await expect(page.getByRole('button', { name: 'Cần xử lý', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.order-queue-row').first()).toContainText('Yêu cầu trả hàng');
  await expect.poll(() => requests.at(-1)?.get('queue')).toBe('needs_action');
  await page
    .getByLabel('Tìm mã đơn, người nhận, email, số điện thoại hoặc sản phẩm')
    .fill('HTV-RETURN');
  await expect.poll(() => requests.at(-1)?.get('q')).toBe('HTV-RETURN');
  await page.getByLabel('Phương thức').selectOption('cod');
  await expect.poll(() => requests.at(-1)?.get('paymentMethod')).toBe('cod');
  await page.getByRole('button', { name: 'Đang giao', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.get('queue')).toBe('shipping');
});
