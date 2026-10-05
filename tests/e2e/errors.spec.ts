import { test, expect } from '@playwright/test';
import content from '../../content/site.json';

const json = (value: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(value),
});

test('unknown client routes render a reusable 404 page', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill(json({})));
  await page.route('**/api/content', (route) => route.fulfill(json(content)));
  await page.goto('/missing-client-route');

  await expect(page).toHaveURL(/\/missing-client-route$/);
  await expect(page.getByText('404', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Trang này chưa được tìm thấy.' })).toBeVisible();
});

test('HTTP protocol failures route to their matching error page', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill(json({})));
  await page.route('**/api/content', (route) =>
    route.fulfill(json({ message: 'Protocol is not supported.' }, 505)),
  );
  await page.goto('/');

  await expect(page).toHaveURL(/\/loi\/505$/);
  await expect(page.getByText('505', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Phiên bản giao thức chưa được hỗ trợ.' }),
  ).toBeVisible();
});
