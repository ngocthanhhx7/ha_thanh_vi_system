import { test, expect } from '@playwright/test';
import content from '../../content/site.json';

test.use({ hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      status: path === '/api/auth/me' ? 401 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        path === '/api/content'
          ? content
          : path.includes('/reviews')
            ? { reviews: [] }
            : path === '/api/chat/config'
              ? { enabled: false }
              : {},
      ),
    });
  });
});

test('product uses selected ingredients and enlarges the clicked ingredient with core flavor', async ({
  page,
}) => {
  await page.goto('/san-pham/banh-cha-truyen-thong');
  await expect(page.getByRole('heading', { name: 'Trong pack có gì?' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Thành phần & thông tin trên nhãn' })).toHaveCount(
    0,
  );
  const strip = page.getByRole('region', { name: 'Thành phần tạo nên hương vị' });
  await strip.scrollIntoViewIfNeeded();
  await expect(
    strip.getByRole('button', { name: 'Xem thành phần BỘT MÌ', exact: true }),
  ).toHaveCount(1);
  await expect(
    strip.getByRole('button', { name: 'Xem thành phần BỘT CACAO', exact: true }),
  ).toHaveCount(0);
  await strip.getByRole('button', { name: 'Dừng chuyển động' }).click();
  const ingredient = strip.getByRole('button', { name: 'Xem thành phần BỘT MÌ', exact: true });
  await ingredient.click();
  const dialog = page.getByRole('dialog', { name: 'BỘT MÌ', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('HƯƠNG VỊ CỐT LÕI');
  await expect(dialog).toContainText('Tạo phần vỏ giòn, thơm và kết cấu đặc trưng của bánh.');
  await expect(dialog.getByRole('img', { name: 'BỘT MÌ', exact: true })).toHaveJSProperty(
    'naturalWidth',
    480,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(ingredient).toBeFocused();
  const art = await page.locator('.public-detail-hero > .product-art').boundingBox();
  expect(art).not.toBeNull();
  expect(Math.abs(art!.width - art!.height)).toBeLessThan(2);
  expect(art!.width).toBeGreaterThan(test.info().project.name === 'mobile' ? 300 : 550);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('ingredient strip moves left, pauses and stays still with reduced motion', async ({
  page,
}) => {
  await page.goto('/san-pham/banh-cha-matcha');
  const strip = page.locator('.product-ingredients');
  await strip.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  const track = strip.locator('.ingredient-track');
  const x = () =>
    track.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41);
  const before = await x();
  await expect.poll(x).toBeLessThan(before - 3);
  await strip.getByRole('button', { name: 'Dừng chuyển động' }).click();
  await expect(strip).toHaveClass(/is-static/);
  expect(await x()).toBe(0);
  await strip.getByRole('button', { name: 'Tiếp tục chuyển động' }).click();
  await page.mouse.move(0, 0);
  await expect.poll(x).toBeLessThan(-3);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(strip).toHaveClass(/is-static/);
  expect(await x()).toBe(0);
  const matcha = strip.getByRole('button', { name: 'Xem thành phần BỘT MATCHA', exact: true });
  await matcha.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'BỘT MATCHA', exact: true })).toBeVisible();
});

test('small viewports keep ingredient dialog and square product image inside the screen', async ({
  page,
}) => {
  for (const width of [320, 360, 768]) {
    await page.setViewportSize({ width, height: 740 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/san-pham/banh-cha-socola');
    const button = page.getByRole('button', { name: 'Xem thành phần BỘT CACAO', exact: true });
    await button.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'BỘT CACAO', exact: true });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.keyboard.press('Escape');
  }
});

test('clicking a card after the strip has moved opens that same ingredient', async ({ page }) => {
  await page.goto('/san-pham/banh-cha-truyen-thong');
  const strip = page.locator('.product-ingredients');
  await strip.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await expect
    .poll(
      () =>
        strip
          .locator('.ingredient-track')
          .evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41),
      { timeout: 10000 },
    )
    .toBeLessThan(-140);
  const card = strip.getByRole('button', { name: 'Xem thành phần MỠ LỢN', exact: true });
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  // Use real coordinates: locator.click waits for stability before moving the pointer,
  // while a continuously moving strip pauses only once the pointer enters it.
  if (test.info().project.name === 'mobile') {
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  } else {
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  }
  await expect(page.getByRole('dialog', { name: 'MỠ LỢN', exact: true })).toBeVisible();
});
