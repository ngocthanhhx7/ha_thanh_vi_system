import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import content from '../../content/site.json';

async function mockFontsSession(page: Page, admin = false) {
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/content', (route) => route.fulfill({ json: content }));
  await page.route('**/api/admin/content', (route) => route.fulfill({ json: content }));
  await page.route('**/api/admin/ingredients', (route) =>
    route.fulfill({ json: { ingredients: [] } }),
  );
  await page.route('**/api/auth/me', (route) =>
    route.fulfill(
      admin
        ? {
            json: {
              user: {
                id: 'font-test',
                name: 'Ngọc Thành',
                email: 'font@example.com',
                role: 'admin',
              },
            },
          }
        : { status: 401, json: { message: 'Chưa đăng nhập' } },
    ),
  );
  await page.route('**/api/games/**', (route) =>
    route.fulfill({ status: 401, json: { message: 'Đăng nhập để chơi' } }),
  );
  await page.route('**/api/notifications*', (route) =>
    route.fulfill({ json: { notifications: [], unread: 0, total: 0, page: 1, limit: 1 } }),
  );
}

async function expectBundledSerif(page: Page, selector: string) {
  await page.locator(selector).first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  const session = await page.context().newCDPSession(page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  const { root } = await session.send('DOM.getDocument');
  const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts.every((font) => font.isCustomFont && font.familyName === 'Noto Serif')).toBe(true);
  await session.detach();
}

test('Vietnamese headings use one bundled serif family with real italic glyphs', async ({
  page,
}) => {
  await mockFontsSession(page);
  await page.goto('/');
  for (const selector of ['.gift-callout h2', '.story-feature h2', '.product-info h3']) {
    await expectBundledSerif(page, selector);
  }
  expect(
    await page.evaluate(
      () => Array.from(document.fonts).filter((font) => font.family === 'Archivo').length,
    ),
  ).toBe(18);
});

test('ingredient catalog uses the bundled Vietnamese face on direct entry and navigation', async ({
  page,
}) => {
  await mockFontsSession(page, true);
  await page.goto('/admin?tab=ingredients');
  await expectBundledSerif(page, '.admin-catalog-heading h2');
  await expect(page.getByRole('button', { name: 'Thêm thành phần', exact: true })).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('ingredient-font.png'), fullPage: true });
  await page.locator('.workspace-brand:visible').first().click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expectBundledSerif(page, '.admin-catalog-heading h2');
});

for (const [path, selector] of [
  ['/tai-khoan', '.account-welcome h1'],
  ['/gio-hang', '.commerce-intro h1'],
  ['/tro-choi', '.games-guest h2'],
]) {
  test(`Vietnamese serif remains consistent at ${path}`, async ({ page }) => {
    await mockFontsSession(page);
    await page.goto(path);
    await expectBundledSerif(page, selector);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('report, order and workspace CSS preserve Vietnamese NFC and combining marks in one font', async ({
  page,
}) => {
  await mockFontsSession(page, true);
  await page.goto('/admin?tab=ingredients');
  await expectBundledSerif(page, '.admin-catalog-heading h2');
  for (const name of ['admin', 'staff', 'workspace']) {
    await page.addStyleTag({ content: readFileSync(`frontend/src/pages/${name}.css`, 'utf8') });
  }
  await page.evaluate(() => {
    const probe = document.createElement('section');
    probe.innerHTML =
      '<div class="admin-chart-heading"><h3 id="font-report">Đơn hàng và tiền đã thu</h3></div><div class="order-queue-detail"><div class="staff-order-heading"><h2 id="font-order">Đơn HTV-899409088</h2></div></div><div class="workspace-section-heading"><h2 id="font-workspace">Thành phần, tiền thưởng, ĐẶNG</h2></div>';
    document.body.append(probe);
  });
  for (const selector of ['#font-report', '#font-order', '#font-workspace']) {
    await expectBundledSerif(page, selector);
    await page.locator(selector).evaluate((node) => {
      node.textContent = node.textContent!.normalize('NFD');
    });
    await expectBundledSerif(page, selector);
  }
});

test('blocked fonts leave headings readable and account controls usable', async ({ page }) => {
  await mockFontsSession(page);
  await page.route('**/brand/fonts/**', (route) => route.abort());
  await page.goto('/tai-khoan');
  await expect(page.locator('.account-welcome h1')).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('font@example.com');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('font@example.com');
  await expect(
    page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true }),
  ).toBeEnabled();
});
