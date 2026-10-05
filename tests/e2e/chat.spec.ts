import { test, expect } from '@playwright/test';
import content from '../../content/site.json';
const json = (value: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(value),
});
test.beforeEach(async ({ page }) => {
  await page.route('**/api/content', (route) => route.fulfill(json(content)));
  await page.route('**/api/chat/config', (route) =>
    route.fulfill(json({ enabled: true, name: 'Vị Ơi', suggestions: ['Chọn quà giúp mình'] })),
  );
});
test('chat renders safe rich text and curated catalog cards with accessible close', async ({
  page,
}) => {
  await page.route('**/api/chat', (route) => {
    expect(route.request().postDataJSON()).toEqual({ message: 'Chọn quà giúp mình', history: [] });
    return route.fulfill(
      json({
        available: true,
        reply:
          '**Bánh ngon** và *trà thơm* 🌿\n\n- Một chút Hà Nội\n- Một món quà\n\n[Không an toàn](javascript:alert(1)) [Ngoài cửa hàng](https://evil.example) ![ảnh](https://evil.example/image.png)\n<script>alert(1)</script>',
        products: [content.products[0], { id: 'fake', slug: 'fake', name: 'Fake', price: 1 }],
        sources: [],
        handoff: false,
      }),
    );
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Trò chuyện với Vị Ơi' }).click();
  const dialog = page.getByRole('dialog', { name: 'Vị Ơi', exact: true });
  await expect(page.getByLabel('Câu hỏi cho Vị Ơi')).toBeFocused();
  await dialog.getByRole('button', { name: 'Chọn quà giúp mình' }).click();
  await expect(dialog.locator('strong').first()).toHaveText('Bánh ngon');
  await expect(dialog.locator('em')).toHaveText('trà thơm');
  await expect(dialog.locator('li')).toHaveCount(2);
  await expect(dialog.locator('a[href*="evil"],a[href^="javascript"],script')).toHaveCount(0);
  await expect(dialog.locator('.vi-chat-message img')).toHaveCount(0);
  await expect(
    dialog.getByRole('link', { name: new RegExp(content.products[0].name) }),
  ).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Fake/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Trò chuyện với Vị Ơi' })).toBeFocused();
});
test('unavailable provider gives honest contact fallback and retry retains original question', async ({
  page,
}) => {
  let attempts = 0;
  await page.route('**/api/chat', (route) => {
    const body = route.request().postDataJSON();
    expect(body.message).toBe('Bánh có vị gì?');
    expect(body.history).toEqual([]);
    return route.fulfill(
      ++attempts === 1
        ? json(
            {
              available: false,
              reply: 'Vị Ơi đang tạm nghỉ.',
              handoff: true,
              products: [],
              sources: [],
            },
            503,
          )
        : json({
            available: true,
            reply: 'Bạn xem danh mục bánh nhé.',
            handoff: false,
            products: [],
            sources: [],
          }),
    );
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Trò chuyện với Vị Ơi' }).click();
  await page.getByLabel('Câu hỏi cho Vị Ơi').fill('Bánh có vị gì?');
  await page.getByRole('button', { name: 'Gửi câu hỏi' }).click();
  await expect(page.getByRole('alert')).toContainText('tạm nghỉ');
  await expect(page.getByRole('link', { name: 'Nhắn cửa hàng qua Zalo' })).toBeVisible();
  await page.getByRole('button', { name: 'Thử lại câu hỏi' }).click();
  await expect(page.locator('.vi-chat-assistant')).toContainText('Bạn xem danh mục');
  await expect(page.locator('.vi-chat-user')).toHaveCount(1);
});

test('offline assistant keeps the composer usable without offering an unconfirmed staff handoff', async ({
  page,
}) => {
  const handoff = {
    id: 'handoff-1',
    status: 'waiting',
    customerType: 'guest',
    assignedStaffName: null,
    assignedStaffId: null,
    createdAt: '2026-10-04T10:00:00.000Z',
    updatedAt: '2026-10-04T10:00:00.000Z',
    lastMessageAt: '2026-10-04T10:00:00.000Z',
    lastMessagePreview: 'Bánh chả có vị gì?',
    staffUnreadCount: 1,
    customerUnreadCount: 0,
    messages: [
      {
        id: 'message-1',
        sender: 'customer',
        content: 'Bánh chả có vị gì?',
        authorName: null,
        createdAt: '2026-10-04T10:00:00.000Z',
      },
      {
        id: 'message-system',
        sender: 'system',
        content: 'Khách muốn được nhân viên tư vấn trực tiếp.',
        authorName: 'Hệ thống',
        createdAt: '2026-10-04T10:00:00.000Z',
      },
    ],
  };
  await page.route('**/api/chat/config', (route) =>
    route.fulfill(json({ enabled: false, name: 'Vị Ơi', suggestions: [] })),
  );
  await page.route('**/api/chat', (route) =>
    route.fulfill(
      json(
        {
          available: false,
          reply: 'Vị Ơi đang tạm nghỉ.',
          handoff: true,
          products: [],
          sources: [],
        },
        503,
      ),
    ),
  );
  await page.route('**/api/chat/handoffs', async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['x-chat-token']).toMatch(/^[\w-]{40,60}$/);
    expect(route.request().postDataJSON()).toEqual({
      transcript: [{ role: 'user', content: 'Bánh chả có vị gì?' }],
    });
    return route.fulfill(json({ handoff }, 201));
  });
  await page.route('**/api/chat/handoffs/handoff-1', (route) => route.fulfill(json({ handoff })));

  await page.goto('/');
  await page.getByRole('button', { name: 'Trò chuyện với Vị Ơi' }).click();
  const input = page.getByLabel('Câu hỏi cho Vị Ơi');
  await expect(input).toBeEnabled();
  await input.fill('Bánh chả có vị gì?');
  await page.getByRole('button', { name: 'Gửi câu hỏi' }).click();
  await expect(page.getByRole('alert')).toContainText('tạm nghỉ');
  await expect(input).toBeEnabled();
  await expect(page.locator('.vi-chat-escalate')).toHaveCount(0);
  await expect(page.locator('.vi-chat-handoff-status')).toHaveCount(0);
  await expect(page.locator('.vi-chat-assistant')).toHaveCount(0);
  await expect(page.locator('.vi-chat-user')).toContainText('Bánh chả có vị gì?');
});
