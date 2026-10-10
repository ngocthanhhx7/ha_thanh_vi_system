import { expect, test } from '@playwright/test';
import content from '../../content/site.json';

const json = (value: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(value),
});
const user = {
  id: 'customer-1',
  name: 'Khách Hà Nội',
  phone: '0912345678',
  email: 'customer@example.com',
  role: 'customer',
};
const voucher = {
  id: 'points-voucher-1',
  name: 'Lật thẻ tích điểm',
  code: 'HTVPOINTS1',
  type: 'fixed',
  value: 100000,
  minOrder: 0,
  maxDiscount: 0,
  orderPercentCap: 10,
  startsAt: '2026-10-10T00:00:00Z',
  expiresAt: '2026-11-09T00:00:00Z',
  status: 'available',
};

for (const walletAvailable of [true, false]) {
  test(`point voucher explains cap and forfeiture with wallet metadata ${walletAvailable ? 'available' : 'unavailable'}`, async ({
    page,
  }) => {
    await page.route('**/api/content', (route) => route.fulfill(json(content)));
    await page.route('**/api/auth/me', (route) => route.fulfill(json({ user })));
    await page.route('**/api/notifications*', (route) =>
      route.fulfill(json({ notifications: [], unread: 0, total: 0, page: 1, limit: 10 })),
    );
    await page.route('**/api/account/vouchers', (route) =>
      route.fulfill(json({ vouchers: walletAvailable ? [voucher] : [] })),
    );
    await page.route('**/api/chat/config', (route) => route.fulfill(json({ enabled: false })));
    await page.route('**/api/games/products-presence', (route) => route.fulfill(json({})));
    await page.route('**/api/account/addresses', (route) => route.fulfill(json({ addresses: [] })));
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
    await page.route('**/api/account/vouchers/quote', (route) =>
      route.fulfill(
        json({
          code: voucher.code,
          discount: 7900,
          subtotal: 79000,
          orderPercentCap: 10,
          voucherValue: voucher.value,
        }),
      ),
    );
    if (walletAvailable) {
      await page.goto('/tai-khoan?section=vouchers');
      const walletCard = page.locator('.account-voucher').filter({ hasText: voucher.code });
      await expect(walletCard).toContainText('Giảm tối đa 10% giá trị hàng trong đơn');
      await expect(walletCard).toContainText('phần giá trị chưa dùng hết sẽ mất');
    }
    await page.goto('/san-pham');
    await page
      .getByRole('button', { name: 'Thêm vào giỏ Bánh Chả Hà Nội – Vị Truyền Thống', exact: true })
      .click();
    await page.goto('/thanh-toan');
    if (walletAvailable) await page.getByLabel('Chọn từ ví ưu đãi').selectOption(voucher.code);
    else await page.getByLabel('Mã ưu đãi', { exact: true }).fill(voucher.code);
    const voucherFields = page.locator('fieldset').filter({ hasText: '3. Ưu đãi của bạn' });
    if (walletAvailable) {
      await expect(voucherFields).toContainText('giảm tối đa 10%');
      await expect(voucherFields).toContainText('không gồm phí giao hàng');
      await expect(voucherFields).toContainText('phần giá trị chưa dùng hết sẽ mất');
    }
    await page.getByRole('button', { name: 'Áp dụng ưu đãi', exact: true }).click();
    await expect(voucherFields).toContainText('giảm tối đa 10%');
    await expect(voucherFields).toContainText('phần giá trị chưa dùng hết sẽ mất');
    await expect(voucherFields).toContainText('giảm 7.900');
    await expect(voucherFields).toContainText('Phần còn lại sẽ mất: 92.100');
  });
}
