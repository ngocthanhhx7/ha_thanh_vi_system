import { test, expect, type Locator, type Page } from '@playwright/test';
import content from '../../content/site.json';

const json = (value: unknown) => ({
  contentType: 'application/json',
  body: JSON.stringify(value),
});

async function enterText(page: Page, field: Locator, multiline = false) {
  await field.fill('Một');
  await field.press('Space');
  await expect(field).toHaveValue('Một ');
  await page.keyboard.insertText('hộp bánh');
  await expect(field).toHaveValue('Một hộp bánh');
  if (multiline) {
    await field.press('Enter');
    await field.press('Enter');
    await expect(field).toHaveValue('Một hộp bánh\n\n');
    await page.keyboard.insertText('Hai túi trà');
    await expect(field).toHaveValue('Một hộp bánh\n\nHai túi trà');
  }
  await expect(field).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill(json({})));
  await page.route('**/api/content', (route) => route.fulfill(json(content)));
  await page.route('**/api/admin/content', (route) => route.fulfill(json(content)));
  await page.route('**/api/auth/me', (route) =>
    route.fulfill(
      json({
        user: { id: 'admin-test', name: 'Quản trị', email: 'admin@example.com', role: 'admin' },
      }),
    ),
  );
  await page.route('**/api/admin/ingredients', (route) =>
    route.fulfill(json({ ingredients: content.ingredients })),
  );
  await page.route('**/api/notifications*', (route) =>
    route.fulfill(json({ notifications: [], unread: 0, total: 0, page: 1, limit: 10 })),
  );
});

test('product, ingredient and website text fields preserve spaces and blank lines', async ({
  page,
}) => {
  await page.route('**/api/admin/products**', (route) =>
    route.fulfill(json({ products: [], total: 0, page: 1, limit: 25 })),
  );
  await page.goto('/admin?tab=products');
  await page.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click();
  for (const name of [
    'Tên sản phẩm',
    'Mô tả',
    'Quy cách',
    'Hương vị',
    'Thông điệp sản phẩm',
    'Đóng gói',
    'Thành phần chính thức',
    'Thông tin dị ứng',
    'Hướng dẫn bảo quản',
  ]) {
    await enterText(page, page.getByRole('textbox', { name, exact: true }), true);
  }
  await page.getByRole('button', { name: 'Đóng chỉnh sửa', exact: true }).click();
  await page.goto('/admin?tab=ingredients');
  await page.getByRole('button', { name: 'Thêm thành phần', exact: true }).click();
  for (const name of ['Tên thành phần', 'Mô tả thành phần', 'Hương vị cốt lõi']) {
    await enterText(
      page,
      page.getByRole('textbox', { name, exact: true }),
      name !== 'Tên thành phần',
    );
  }
  await page.goto('/admin?tab=site');
  for (const name of [
    'Thông điệp thương hiệu',
    'Tiêu đề trang chủ',
    'Lời giới thiệu trang chủ',
    'Câu chuyện',
    'Địa chỉ',
  ]) {
    await enterText(page, page.getByRole('textbox', { name, exact: true }), true);
  }
});

test('checkout recipient, address and note preserve spaces while typing', async ({ page }) => {
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
  await page.route('**/api/account/addresses', (route) => route.fulfill(json({ addresses: [] })));
  await page.route('**/api/account/vouchers', (route) => route.fulfill(json({ vouchers: [] })));
  await page.goto('/san-pham');
  await page
    .getByRole('button', { name: 'Thêm vào giỏ ' + content.products[0].name, exact: true })
    .click();
  await page.goto('/thanh-toan');
  for (const name of ['Họ và tên người nhận', 'Địa chỉ giao hàng đầy đủ']) {
    await enterText(page, page.getByRole('textbox', { name, exact: true }));
  }
  await enterText(
    page,
    page.getByRole('textbox', { name: 'Lời nhắn cho đơn hàng', exact: true }),
    true,
  );
});

test('catalog and news searches preserve multiword queries', async ({ page }) => {
  await page.goto('/san-pham');
  await enterText(page, page.getByRole('searchbox', { name: 'Tìm trong bộ sưu tập' }));
  await page.goto('/tin-tuc');
  await enterText(page, page.getByRole('searchbox', { name: 'Tìm bài viết' }));
});

test('chat draft preserves spaces and Shift+Enter without sending', async ({ page }) => {
  let sent = false;
  await page.route('**/api/chat/config', (route) =>
    route.fulfill(
      json({
        enabled: true,
        name: 'Vị Ơi',
        suggestions: [],
      }),
    ),
  );
  await page.route('**/api/chat', (route) => {
    sent = true;
    return route.fulfill(json({ available: true, reply: 'Đã nhận' }));
  });
  await page.goto('/san-pham');
  await page.getByRole('button', { name: 'Trò chuyện với Vị Ơi' }).click();
  const field = page.getByRole('textbox', { name: 'Câu hỏi cho Vị Ơi' });
  await enterText(page, field);
  await field.press('Shift+Enter');
  await expect(field).toHaveValue('Một hộp bánh\n');
  await page.keyboard.insertText('Hai túi trà');
  await expect(field).toHaveValue('Một hộp bánh\nHai túi trà');
  expect(sent).toBe(false);
});
