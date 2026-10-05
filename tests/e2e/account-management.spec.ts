import { test, expect } from '@playwright/test';

const json = (value: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(value),
});

test('admin edits an account and reviews a verified suspension appeal', async ({ page }) => {
  const currentUser = {
    id: 'admin-1',
    name: 'Quản trị viên',
    email: 'admin@example.com',
    phone: '0901234567',
    role: 'admin',
    accountStatus: 'active',
    accountStatusReason: '',
    accountStatusChangedAt: null,
  };
  let account = {
    id: 'customer-1',
    name: 'Nguyễn Hà My',
    email: 'customer@example.com',
    phone: '0912345678',
    role: 'customer',
    accountStatus: 'active',
    accountStatusReason: '',
    accountStatusChangedAt: null,
  };
  let appeals = [
    {
      id: 'appeal-1',
      userId: account.id,
      userName: account.name,
      userEmail: account.email,
      message: 'Tôi tin tài khoản bị khóa nhầm, xin vui lòng kiểm tra giúp tôi.',
      status: 'pending',
      submittedAt: '2026-10-04T10:00:00.000Z',
    },
  ];
  let accountPatch: Record<string, unknown> | undefined;
  let appealDecision: Record<string, unknown> | undefined;

  await page.route('**/api/**', (route) => route.fulfill(json({})));
  await page.route('**/api/auth/me', (route) => route.fulfill(json({ user: currentUser })));
  await page.route('**/api/notifications*', (route) =>
    route.fulfill(json({ notifications: [], unread: 0, total: 0, page: 1, limit: 1 })),
  );
  await page.route('**/api/staff/chat-handoffs/summary', (route) =>
    route.fulfill(json({ waiting: 0, unread: 0 })),
  );
  await page.route('**/api/admin/users**', async (route) => {
    if (route.request().method() === 'PATCH') {
      accountPatch = route.request().postDataJSON();
      account = {
        ...account,
        ...accountPatch,
        accountStatusReason: String(accountPatch.reason ?? account.accountStatusReason),
      };
      return route.fulfill(json({ user: account }));
    }
    return route.fulfill(json({ users: [account], total: 1, page: 1, limit: 25 }));
  });
  await page.route('**/api/admin/users/customer-1/audit', (route) =>
    route.fulfill(json({ audit: [] })),
  );
  await page.route('**/api/admin/appeals', (route) => route.fulfill(json({ appeals })));
  await page.route('**/api/admin/appeals/appeal-1', async (route) => {
    appealDecision = route.request().postDataJSON();
    appeals = [];
    return route.fulfill(json({ appeal: { id: 'appeal-1', status: 'approved', reviewNote: '' } }));
  });

  await page.goto('/quan-tri?tab=users');
  const appealCard = page.locator('.admin-appeal-card');
  await expect(appealCard).toContainText('Tôi tin tài khoản bị khóa nhầm');
  await page.getByRole('button', { name: 'Chấp thuận và mở tài khoản' }).click();
  await expect(page.locator('.admin-appeal-card')).toHaveCount(0);
  expect(appealDecision).toEqual({ decision: 'approve', note: '' });

  await page.getByRole('button', { name: 'Quản lý hồ sơ' }).click();
  const accountCard = page.locator('.admin-account-card').filter({ hasText: account.email });
  await accountCard.getByLabel('Họ và tên').fill('Nguyễn Hà My mới');
  await accountCard.getByLabel('Số điện thoại').fill('0987654321');
  await accountCard.getByLabel('Vai trò').selectOption('staff');
  await accountCard.getByLabel('Trạng thái tài khoản').selectOption('suspended');
  await accountCard.getByLabel('Lý do / ghi chú thay đổi').fill('Tạm khóa để rà soát bảo mật.');
  await accountCard.getByRole('button', { name: 'Lưu thay đổi' }).click();

  await expect
    .poll(() => accountPatch)
    .toEqual({
      name: 'Nguyễn Hà My mới',
      phone: '0987654321',
      role: 'staff',
      accountStatus: 'suspended',
      reason: 'Tạm khóa để rà soát bảo mật.',
    });
});
