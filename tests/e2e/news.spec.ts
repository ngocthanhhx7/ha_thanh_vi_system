import { test, expect } from '@playwright/test';

test('changing news categories preserves the reading position', async ({ page }) => {
  await page.goto('/tin-tuc');
  await expect(page.locator('.news-article')).toHaveCount(20);
  await page.locator('.news-filters').evaluate((element) =>
    window.scrollTo({
      top: element.getBoundingClientRect().top + window.scrollY - 180,
      behavior: 'instant',
    }),
  );
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(100);
  for (const category of ['Trà & cốm', 'Ẩm thực Hà Nội', 'Tất cả']) {
    const filter = page.getByRole('button', { name: category, exact: true });
    await expect(filter).toBeInViewport({ ratio: 1 });
    const bounds = await filter.boundingBox();
    expect(bounds).not.toBeNull();
    // Measure app scrolling without locator.click's automatic viewport scrolling.
    await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await expect(filter).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 5);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(before + 5);
  }
  await page.getByLabel('Tìm bài viết').fill('tra sen');
  await expect(page).toHaveURL(/q=tra\+sen/);
  await expect(page.getByLabel('Tìm bài viết')).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
});

test('news selection has 20 attributed articles and working filters', async ({ page }) => {
  await page.goto('/tin-tuc');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Hà Nội');
  await expect(page.locator('.news-article')).toHaveCount(20);
  const sources = page.locator('.news-article .news-source-link');
  await expect(sources).toHaveCount(20);
  const urls = await sources.evaluateAll((links) =>
    links.map((link) => (link as HTMLAnchorElement).href),
  );
  expect(new Set(urls).size).toBe(20);
  for (const url of urls) expect(url).toMatch(/^https:\/\//);
  await page.getByLabel('Tìm bài viết').fill('all');
  await expect(page.getByLabel('Tìm bài viết')).toHaveValue('all');
  await expect(page).toHaveURL(/[?&]q=all(?:&|$)/);
  await page.getByLabel('Tìm bài viết').fill('tra sen');
  await expect(page.locator('.news-article').first()).toBeVisible();
  await expect.poll(() => page.locator('.news-article').count()).toBeLessThan(20);
  await page.getByLabel('Tìm bài viết').fill('khong-co-bai-viet-xyz');
  await expect(page.getByRole('heading', { name: 'Chưa tìm thấy bài phù hợp' })).toBeVisible();
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await expect(page.locator('.news-article')).toHaveCount(20);
  await page.getByRole('button', { name: 'Trà & cốm', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Trà & cốm', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await page.locator('.news-article').count()).toBeGreaterThan(0);
  expect(await page.locator('.news-article').count()).toBeLessThan(20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('news is reachable from primary navigation', async ({ page }, testInfo) => {
  await page.goto('/');
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
    await page.locator('.mobile-nav').getByRole('link', { name: 'Tin tức', exact: true }).click();
  } else {
    await page
      .getByRole('navigation', { name: 'Điều hướng chính' })
      .getByRole('link', { name: 'Tin tức', exact: true })
      .click();
  }
  await expect(page).toHaveURL(/\/tin-tuc$/);
  await expect(page.locator('.news-article')).toHaveCount(20);
  await expect(page).toHaveTitle('Tin tức ẩm thực Hà Nội | Hà Thành Vị');
  await expect(page.locator('footer')).toContainText('Tin tức');
});

test('news metadata describes a sourced collection and is restored on navigation', async ({
  page,
}) => {
  await page.goto('/');
  const originalDescription = await page
    .locator('meta[name="description"]')
    .getAttribute('content');
  await page.goto('/tin-tuc');
  await expect(page.locator('.news-article')).toHaveCount(20);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /20 bài báo/);
  const data = JSON.parse(
    await page.locator('.news-page script[type="application/ld+json"]').innerText(),
  );
  expect(data['@type']).toBe('CollectionPage');
  expect(data.mainEntity.numberOfItems).toBe(20);
  expect(data.mainEntity.itemListElement).toHaveLength(20);
  await page.locator('.news-ending').getByRole('link', { name: 'Khám phá thức quà' }).click();
  await expect(page).toHaveURL(/\/san-pham$/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    originalDescription!,
  );
  await expect(page.locator('meta[property="og:type"]')).toHaveCount(0);
});
