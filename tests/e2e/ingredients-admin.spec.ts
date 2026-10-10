import { test, expect, type Page } from '@playwright/test';
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
const flour = {
  id: 'flour',
  name: 'BỘT MÌ',
  image: '/brand/game/cards/flour.webp',
  description: 'Tạo nên phần vỏ bánh.',
  coreFlavor: 'Tạo phần vỏ giòn, thơm.',
};
const lime = {
  id: 'lime-leaf',
  name: 'LÁ CHANH',
  image: '/brand/game/cards/lime-leaf.webp',
  description: 'Hương lá chanh đặc trưng.',
  coreFlavor: 'Hương thơm thanh.',
};

async function mockSession(page: Page) {
  await page.route('**/api/**', (route) => route.fulfill(json({})));
  await page.route('**/api/content', (route) => route.fulfill(json(content)));
  await page.route('**/api/auth/me', (route) => route.fulfill(json({ user: admin })));
  await page.route('**/api/admin/ingredients', (route) => route.fulfill(json({ ingredients: [] })));
  await page.route('**/api/notifications*', (route) =>
    route.fulfill(json({ notifications: [], unread: 0, total: 0, page: 1, limit: 1 })),
  );
}

test.beforeEach(async ({ page }) => mockSession(page));

test('admin creates and edits ingredient with upload, blocks referenced deletion and confirms unused deletion', async ({
  page,
}) => {
  let ingredients = [flour];
  let referenced = true;
  let deleted = false;
  const uploaded = '/uploads/12345678-1234-4234-8234-123456789012.webp';
  await page.route('**/api/admin/uploads', (route) => {
    expect(route.request().headers()['content-type']).toBe('image/png');
    return route.fulfill(json({ url: uploaded, width: 1, height: 1 }, 201));
  });
  await page.route('**/api/admin/ingredients', (route) => {
    if (route.request().method() === 'POST') {
      const value = route.request().postDataJSON();
      expect(value).toMatchObject({
        id: 'lime-leaf',
        name: 'LÁ CHANH',
        image: uploaded,
        coreFlavor: 'Hương thơm thanh.',
      });
      ingredients.push(value);
      return route.fulfill(json(value, 201));
    }
    return route.fulfill(json({ ingredients }));
  });
  await page.route('**/api/admin/ingredients/lime-leaf', (route) => {
    if (route.request().method() === 'PATCH') {
      const value = route.request().postDataJSON();
      expect(value.coreFlavor).toBe('Hương thơm đặc trưng Hà Nội.');
      ingredients = ingredients.map((ingredient) =>
        ingredient.id === value.id ? value : ingredient,
      );
      return route.fulfill(json(value));
    }
    if (referenced)
      return route.fulfill(json({ message: 'Thành phần đang được dùng trong sản phẩm.' }, 409));
    deleted = true;
    ingredients = ingredients.filter((ingredient) => ingredient.id !== 'lime-leaf');
    return route.fulfill({ status: 204 });
  });
  await page.goto('/admin?tab=ingredients');
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Thành phần', exact: true }),
  ).toHaveAttribute('href', '/admin?tab=ingredients');
  await page.getByRole('button', { name: 'Thêm thành phần', exact: true }).click();
  await page.getByLabel(/^Mã thành phần/).fill('lime-leaf');
  await page.getByLabel('Tên thành phần', { exact: true }).fill('LÁ CHANH');
  await page.getByLabel('Mô tả thành phần', { exact: true }).fill(lime.description);
  await page.getByLabel('Hương vị cốt lõi', { exact: true }).fill(lime.coreFlavor);
  await page.getByLabel(/^Tải ảnh thành phần/).setInputFiles({
    name: 'tiny.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYp0AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByAltText('Xem trước ảnh thành phần')).toHaveAttribute('src', uploaded);
  await page.getByRole('button', { name: 'Tạo thành phần', exact: true }).click();
  await expect(page.getByText('Đã thêm thành phần.', { exact: true })).toBeVisible();
  const row = () => page.locator('.admin-ingredient-row').filter({ hasText: 'LÁ CHANH' });
  await row().getByRole('button', { name: 'Sửa thành phần' }).click();
  await expect(page.getByLabel(/^Mã thành phần/)).toHaveAttribute('readonly', '');
  await page.getByLabel(/^Hương vị cốt lõi/).fill('Hương thơm đặc trưng Hà Nội.');
  await page.getByRole('button', { name: 'Lưu thành phần', exact: true }).click();
  await expect(row()).toContainText('Hương thơm đặc trưng Hà Nội.');
  await row().getByRole('button', { name: 'Xóa', exact: true }).click();
  expect(deleted).toBe(false);
  await page.getByRole('button', { name: 'Giữ thành phần' }).click();
  await row().getByRole('button', { name: 'Xóa', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa thành phần' }).click();
  await expect(page.getByRole('alert')).toContainText('Thành phần đang được dùng');
  expect(deleted).toBe(false);
  referenced = false;
  await page.getByRole('button', { name: 'Xác nhận xóa thành phần' }).click();
  await expect(row()).toHaveCount(0);
  expect(deleted).toBe(true);
});

test('product selection preserves legacy metadata and site save sends only site changes', async ({
  page,
}) => {
  const product = {
    ...content.products[0],
    ingredientIds: ['flour'],
    ingredientImage: '/brand/legacy.webp',
  };
  let current = { ...content, products: [product], ingredients: [flour, lime] };
  let savedProduct = false;
  let savedSite = false;
  await page.route('**/api/admin/ingredients', (route) =>
    route.fulfill(json({ ingredients: current.ingredients })),
  );
  await page.route('**/api/admin/products**', (route) => {
    if (route.request().method() === 'PATCH') {
      const value = route.request().postDataJSON();
      expect(value.ingredientIds).toEqual(['flour', 'lime-leaf']);
      expect(value.ingredientImage).toBe('/brand/legacy.webp');
      expect(value.packageContents).toEqual(product.packageContents);
      savedProduct = true;
      current = { ...current, products: [value] };
      return route.fulfill(json(value));
    }
    if (new URL(route.request().url()).pathname.endsWith('/' + product.id))
      return route.fulfill(json(current.products[0]));
    return route.fulfill(json({ products: current.products, total: 1, page: 1, limit: 25 }));
  });
  await page.route('**/api/admin/content', (route) => {
    return route.fulfill(json(current));
  });
  await page.route('**/api/admin/site', (route) => {
    expect(route.request().method()).toBe('PATCH');
    const value = route.request().postDataJSON();
    expect(value).not.toHaveProperty('products');
    expect(value).not.toHaveProperty('ingredients');
    expect(value.tagline).toBe('Thông điệp vừa cập nhật');
    current = { ...current, site: value };
    savedSite = true;
    return route.fulfill(json(current));
  });
  await page.goto('/admin?tab=products');
  await page.getByRole('button', { name: 'Xem / sửa', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'BỘT MÌ', exact: true })).toBeChecked();
  await expect(page.getByLabel('Tải ảnh bảng thành phần')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'LÁ CHANH', exact: true }).check();
  await page.getByRole('button', { name: 'Lưu sản phẩm', exact: true }).click();
  await expect(page.getByText('Đã lưu sản phẩm.', { exact: true })).toBeVisible();
  expect(savedProduct).toBe(true);
  await page.getByRole('link', { name: 'Nội dung website', exact: true }).click();
  await page.getByLabel('Thông điệp thương hiệu').fill('Thông điệp vừa cập nhật');
  current = { ...current, ingredients: [{ ...flour, coreFlavor: 'Giòn thơm mới.' }, lime] };
  await page.getByRole('button', { name: 'Lưu nội dung thương hiệu' }).click();
  await expect(page.getByText('Đã lưu nội dung thương hiệu.', { exact: true })).toBeVisible();
  expect(savedSite).toBe(true);
  expect(current.ingredients[0].coreFlavor).toBe('Giòn thơm mới.');
  expect(current.products[0].ingredientIds).toEqual(['flour', 'lime-leaf']);
});

test('product editor prevents saving while ingredient catalog fails and allows retry', async ({
  page,
}) => {
  let failing = true;
  let patched = false;
  await page.route('**/api/admin/ingredients', (route) =>
    route.fulfill(
      failing
        ? json({ message: 'Chưa tải được thành phần.' }, 400)
        : json({ ingredients: [flour] }),
    ),
  );
  await page.route('**/api/admin/products**', (route) => {
    const product = { ...content.products[0], ingredientIds: ['flour'] };
    if (route.request().method() === 'PATCH') {
      patched = true;
      return route.fulfill(json(product));
    }
    return route.fulfill(
      json(
        new URL(route.request().url()).pathname.endsWith('/' + product.id)
          ? product
          : { products: [product], total: 1, page: 1, limit: 25 },
      ),
    );
  });
  await page.goto('/admin?tab=products');
  await page.getByRole('button', { name: 'Xem / sửa', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Chưa tải được thành phần.');
  await expect(page.getByRole('button', { name: 'Lưu sản phẩm', exact: true })).toBeDisabled();
  expect(patched).toBe(false);
  failing = false;
  await page.getByRole('button', { name: 'Tải lại thành phần' }).click();
  await expect(page.getByRole('checkbox', { name: 'BỘT MÌ', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Lưu sản phẩm', exact: true })).toBeEnabled();
});

test('ingredient controls are unavailable for staff and failed workspace logout stays visible before successful home redirect', async ({
  page,
}) => {
  let logoutFails = true;
  await page.route('**/api/auth/logout', (route) =>
    route.fulfill(logoutFails ? json({ message: 'Chưa thể đăng xuất.' }, 400) : json({ ok: true })),
  );
  await page.goto('/admin?tab=ingredients');
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Chưa thể đăng xuất.');
  await expect(page).toHaveURL(/\/admin\?tab=ingredients$/);
  logoutFails = false;
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.route('**/api/auth/me', (route) =>
    route.fulfill(json({ user: { ...admin, role: 'staff' } })),
  );
  await page.goto('/admin?tab=ingredients');
  await expect(page.getByText('Tài khoản này chưa có quyền quản trị nội dung.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thêm thành phần', exact: true })).toHaveCount(0);
});
