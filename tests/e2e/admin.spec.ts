import { test, expect } from '@playwright/test';
import content from '../../content/site.json';
const json = (value: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(value),
});
const admin = {
  id: 'admin-test',
  name: 'Quản trị',
  email: 'admin@example.com',
  phone: '0901234567',
  role: 'admin',
};
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill(json({})));
  await page.route('**/api/content', (route) => route.fulfill(json(content)));
  await page.route('**/api/admin/content', (route) => route.fulfill(json(content)));
  await page.route('**/api/admin/ingredients', (route) => route.fulfill(json({ ingredients: [] })));
  await page.route('**/api/auth/me', (route) => route.fulfill(json({ user: admin })));
  await page.route('**/api/notifications*', (route) =>
    route.fulfill(json({ notifications: [], unread: 0, total: 0, page: 1, limit: 1 })),
  );
  await page.route('**/api/admin/statistics*', (route) =>
    route.fulfill(
      json({
        orders: 3,
        totalCollected: 158000,
        delivered: 2,
        pending: 1,
        customers: 5,
        products: 5,
        byStatus: [{ status: 'delivered', count: 2 }],
        topProducts: [
          {
            productId: content.products[0].id,
            name: content.products[0].name,
            quantity: 2,
            revenue: 158000,
          },
        ],
      }),
    ),
  );
});
test('admin creates with uploaded image, reads detail, edits and confirms deletion', async ({
  page,
}) => {
  let products = [...content.products];
  let created = false;
  let patched = false;
  let deleted = false;
  const url = '/uploads/12345678-1234-1234-1234-123456789012.webp';
  await page.route('**/api/admin/uploads', (route) => {
    expect(route.request().headers()['content-type']).toBe('image/png');
    return route.fulfill(json({ url, width: 1, height: 1 }, 201));
  });
  await page.route('**/api/admin/products**', (route) => {
    if (route.request().method() === 'POST') {
      const value = route.request().postDataJSON();
      expect(value.id).toBe('qua-moi');
      expect(value.slug).toBe('qua-moi');
      expect(value.image).toBe(url);
      created = true;
      products.push(value);
      return route.fulfill(json(value, 201));
    }
    return route.fulfill(json({ products, total: products.length, page: 1, limit: 25 }));
  });
  await page.route('**/api/admin/products/qua-moi', (route) => {
    const found = products.find((product) => product.id === 'qua-moi');
    if (route.request().method() === 'PATCH') {
      const value = route.request().postDataJSON();
      patched = true;
      products = products.map((product) => (product.id === value.id ? value : product));
      return route.fulfill(json(value));
    }
    if (route.request().method() === 'DELETE') {
      deleted = true;
      products = products.filter((product) => product.id !== 'qua-moi');
      return route.fulfill({ status: 204 });
    }
    return route.fulfill(json(found));
  });
  await page.goto('/admin');
  await page
    .getByRole('navigation', { name: 'Điều hướng nghiệp vụ' })
    .getByRole('link', { name: 'Sản phẩm', exact: true })
    .click();
  await page.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click();
  await page.getByLabel(/^Mã sản phẩm/).fill('qua-moi');
  await page.getByLabel(/^Đường dẫn sản phẩm/).fill('qua-moi');
  await page.getByLabel('Tên sản phẩm', { exact: true }).fill('Thức quà mới');
  await page.getByLabel('Mô tả', { exact: true }).fill('Một thức quà mới thơm ngon');
  await page.getByLabel('Quy cách', { exact: true }).fill('350g');
  await page.getByLabel('Hương vị', { exact: true }).fill('Lá chanh');
  await page.getByLabel(/^Tải ảnh sản phẩm/).setInputFiles({
    name: 'tiny.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYp0AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByAltText('Xem trước ảnh sản phẩm')).toHaveAttribute('src', url);
  await page.getByRole('button', { name: 'Tạo sản phẩm', exact: true }).click();
  await expect(page.locator('.admin-feedback[role="status"]')).toContainText('Đã thêm sản phẩm');
  expect(created).toBe(true);
  const productRow = () => page.getByRole('row').filter({ hasText: 'Thức quà mới' });
  await productRow().getByRole('button', { name: 'Xem / sửa', exact: true }).click();
  await expect(page.getByLabel(/^Mã sản phẩm/)).toHaveAttribute('readonly', '');
  await expect(page.getByLabel(/^Đường dẫn sản phẩm/)).toHaveAttribute('readonly', '');
  await page.getByLabel('Thành phần chính thức', { exact: true }).fill('Bột mì, lá chanh');
  await page
    .getByLabel('Trong pack có gì? (mỗi dòng một món và số lượng)', { exact: true })
    .fill('1 túi bánh 350g');
  await page.getByRole('button', { name: 'Lưu sản phẩm', exact: true }).click();
  await expect(page.locator('.admin-feedback[role="status"]')).toContainText('Đã lưu sản phẩm');
  expect(patched).toBe(true);
  await productRow().getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Thức quà mới');
  expect(deleted).toBe(false);
  await page.getByRole('button', { name: 'Giữ sản phẩm' }).click();
  expect(deleted).toBe(false);
  await productRow().getByRole('button', { name: 'Xóa', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa sản phẩm' }).click();
  await expect(page.locator('.admin-feedback[role="status"]')).toContainText('Đã xóa sản phẩm');
  expect(deleted).toBe(true);
  await expect(productRow()).toHaveCount(0);
});
for (const create of [true, false]) {
  test(`package contents preserves typing and normalizes only on ${create ? 'create' : 'edit'}`, async ({
    page,
  }) => {
    let product = { ...content.products[0], ingredientIds: [], packageContents: ['Món cũ'] };
    let rejectSave = true;
    const payloads: unknown[] = [];
    await page.route('**/api/admin/products**', (route) => {
      const method = route.request().method();
      if (method === 'POST' || method === 'PATCH') {
        const body = route.request().postDataJSON();
        payloads.push(body.packageContents);
        if (rejectSave) return route.fulfill(json({ message: 'Chưa lưu được. Thử lại.' }, 503));
        product = body;
        return route.fulfill(json(product, method === 'POST' ? 201 : 200));
      }
      if (new URL(route.request().url()).pathname.endsWith('/' + product.id))
        return route.fulfill(json(product));
      return route.fulfill(json({ products: [product], total: 1, page: 1, limit: 25 }));
    });
    await page.goto('/admin?tab=products');
    if (create) {
      await page.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click();
      await page.getByLabel(/^Mã sản phẩm/).fill('pack-moi');
      await page.getByLabel(/^Đường dẫn sản phẩm/).fill('pack-moi');
      await page.getByLabel('Tên sản phẩm', { exact: true }).fill('Pack mới');
      await page.getByLabel('Mô tả', { exact: true }).fill('Pack bánh thử nghiệm');
      await page.getByLabel('Quy cách', { exact: true }).fill('300g');
      await page.getByLabel('Hương vị', { exact: true }).fill('Matcha');
      await page.getByLabel('Đường dẫn ảnh sản phẩm', { exact: true }).fill(product.image);
    } else {
      await page.getByRole('button', { name: 'Xem / sửa', exact: true }).click();
    }
    const field = page.getByRole('textbox', { name: /^Trong pack có gì\?/ });
    await expect(field).toHaveValue(create ? '' : 'Món cũ');
    await field.fill('');
    await field.pressSequentially('1');
    await field.press('Space');
    await expect(field).toHaveValue('1 ');
    await field.pressSequentially('hop 300g');
    await field.press('Enter');
    await expect(field).toHaveValue('1 hop 300g\n');
    await field.press('Enter');
    await page.keyboard.insertText('  2 túi bánh – Vị Matcha Trứng Muối  ');
    const draft = '1 hop 300g\n\n  2 túi bánh – Vị Matcha Trứng Muối  ';
    await expect(field).toHaveValue(draft);
    // An unrelated field change must not rebuild the textarea from a normalized array.
    await page.getByLabel('Thông tin dị ứng', { exact: true }).fill('Có bột mì');
    await expect(field).toHaveValue(draft);
    const save = () =>
      page.getByRole('button', { name: create ? 'Tạo sản phẩm' : 'Lưu sản phẩm', exact: true });
    await save().click();
    await expect(page.getByRole('alert')).toContainText('Chưa lưu được');
    await expect(field).toHaveValue(draft);
    expect(payloads).toEqual([['1 hop 300g', '2 túi bánh – Vị Matcha Trứng Muối']]);
    rejectSave = false;
    await save().click();
    await expect(page.locator('.admin-feedback[role="status"]')).toContainText(
      create ? 'Đã thêm sản phẩm' : 'Đã lưu sản phẩm',
    );
    await page.getByRole('button', { name: 'Xem / sửa', exact: true }).click();
    await expect(field).toHaveValue('1 hop 300g\n2 túi bánh – Vị Matcha Trứng Muối');
    // Paste with Windows line endings, and whitespace-only content to clear an optional list.
    await field.fill('  1 hộp bánh  \r\n\r\n  2 túi trà  \r\n');
    await page.getByRole('button', { name: 'Lưu sản phẩm', exact: true }).click();
    await expect(page.locator('.admin-feedback[role="status"]')).toContainText('Đã lưu sản phẩm');
    expect(payloads.at(-1)).toEqual(['1 hộp bánh', '2 túi trà']);
    await page.getByRole('button', { name: 'Xem / sửa', exact: true }).click();
    await expect(field).toHaveValue('1 hộp bánh\n2 túi trà');
    await field.fill(' \n  \n');
    await page.getByRole('button', { name: 'Lưu sản phẩm', exact: true }).click();
    await expect(page.locator('.admin-feedback[role="status"]')).toContainText('Đã lưu sản phẩm');
    expect(payloads.at(-1)).toEqual([]);
    await page.getByRole('button', { name: 'Xem / sửa', exact: true }).click();
    await expect(field).toHaveValue('');
  });
}

test('admin statistics applies date filters and reports failures without stale totals', async ({
  page,
}) => {
  await page.route('**/api/admin/products', (route) =>
    route.fulfill(json({ products: content.products })),
  );
  await page.route('**/api/admin/statistics*', (route) => {
    const filters = new URL(route.request().url()).searchParams;
    if (filters.get('from') === '2026-10-01') {
      expect(filters.get('to')).toBe('2026-10-04');
      return route.fulfill(json({ message: 'Chưa tải được thống kê.' }, 503));
    }
    return route.fulfill(
      json({
        orders: 3,
        totalCollected: 158000,
        delivered: 2,
        pending: 1,
        customers: 5,
        products: 5,
        byStatus: [{ status: 'delivered', count: 2 }],
        topProducts: [
          {
            productId: content.products[0].id,
            name: content.products[0].name,
            quantity: 2,
            revenue: 158000,
          },
        ],
      }),
    );
  });
  await page.goto('/admin');
  await page.getByRole('link', { name: 'Báo cáo', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\?tab=stats$/);
  await expect(
    page.getByRole('heading', { name: 'Báo cáo theo khoảng thời gian', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.admin-stat-cards')).toContainText('158.000');
  await expect(page.locator('.admin-chart-products')).toContainText('Vị Truyền');
  await page.getByLabel('Từ ngày', { exact: true }).fill('2026-10-01');
  await page.getByLabel('Đến ngày', { exact: true }).fill('2026-10-04');
  await expect(page.getByLabel('Từ ngày', { exact: true })).toHaveValue('2026-10-01');
  await expect(page.getByLabel('Đến ngày', { exact: true })).toHaveValue('2026-10-04');
  await page.getByRole('button', { name: 'Cập nhật' }).click();
  await expect(page).toHaveURL(/\/loi\/503$/);
  await expect(page.getByText('503', { exact: true })).toBeVisible();
  await expect(page.locator('.admin-stat-cards')).toHaveCount(0);
});
test('non-admin cannot open product controls', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill(json({ user: { ...admin, role: 'customer' } })),
  );
  await page.goto('/admin');
  await expect(page.getByText('Tài khoản này chưa có quyền quản trị nội dung.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thêm sản phẩm', exact: true })).toHaveCount(0);
});
