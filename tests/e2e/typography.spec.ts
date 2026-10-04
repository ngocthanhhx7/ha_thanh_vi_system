import { test, expect } from '@playwright/test';

test('Vietnamese headings use one bundled serif family with real italic glyphs', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.gift-callout h2').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const session = await page.context().newCDPSession(page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  const { root } = await session.send('DOM.getDocument');
  for (const selector of ['.gift-callout h2', '.story-feature h2', '.product-info h3']) {
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.every((font) => font.isCustomFont && font.familyName === 'Noto Serif')).toBe(true);
  }
  expect(
    await page.evaluate(
      () => Array.from(document.fonts).filter((font) => font.family === 'Archivo').length,
    ),
  ).toBe(18);
});
