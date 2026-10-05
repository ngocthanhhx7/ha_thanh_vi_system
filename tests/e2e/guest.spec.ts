import { test, expect } from '@playwright/test';
test('guest can browse, filter and add products to cart', async ({ page }) => {
  await page.goto('/san-pham');
  await expect(page.getByRole('heading', { name: 'Một chút Hà Nội, gửi đến bạn.' })).toBeVisible();
  await page.getByRole('button', { name: 'Quà tặng', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Thêm vào giỏ Nhã Sắc Hà Thành', exact: true }).click();
  await page.getByRole('button', { name: /Mở giỏ hàng/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Nhã Sắc Hà Thành');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Mở giỏ hàng/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Nhã Sắc Hà Thành');
});
test('all guest routes have content and no horizontal overflow', async ({ page }) => {
  for (const route of ['/', '/cau-chuyen', '/san-pham', '/ve-chung-toi', '/lien-he']) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    await expect(page.locator('footer')).toContainText('0973 607 163');
  }
});
test('contact service failure is never shown as a successful submission', async ({ page }) => {
  await page.route('**/api/contact', (r) =>
    r.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Chưa thể gửi yêu cầu. Vui lòng liên hệ trực tiếp.' }),
    }),
  );
  await page.goto('/lien-he');
  await page.getByLabel('Họ và tên').fill('Khách xem thử');
  await page.getByLabel('Email', { exact: true }).fill('demo@example.com');
  await page.getByLabel('Số điện thoại', { exact: true }).fill('0901234567');
  await page
    .getByRole('textbox', { name: 'Lời nhắn', exact: true })
    .fill('Tôi muốn tìm hiểu set quà Hà Nội.');
  await page.getByLabel(/Tôi đồng ý/).check();
  await page.getByRole('button', { name: 'Gửi lời nhắn', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Chưa thể gửi');
});
