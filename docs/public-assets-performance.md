# Public assets and font loading

The homepage uses responsive pastry WebP images (640, 960 and 1280 pixels), a smaller repeated pattern, and a 96×144 card thumbnail for the game launcher. Original brand images remain available. Regenerate the derivatives with `node scripts/optimize-public-assets.mjs`.

The first font fallback used local Times/Arial fonts with adjusted widths. Windows passed the held-font test, but Ubuntu CI showed a 43.6-pixel hero shift because those local fonts were unavailable. Local font names therefore cannot provide dependable layout geometry across systems.

`home-critical-fonts.css` embeds three subsets of the existing brand fonts as homepage fallback faces: normal/italic Noto Serif and regular Archivo. They preserve glyph advances, kerning and shaping; outlines are retained, with hint instructions removed. Coverage includes ASCII, Latin-1, Vietnamese letters, combining marks and punctuation, independent of today's editable hero copy. They load from the CSS itself, while the original full network fonts continue to load. There is no dependency on an installed operating-system font.

For an initial visit to `/`, the application decodes those three inline faces before its first React mount. This waits for local CSS font data rather than the HTTP font requests, so the first hero layout already uses the correct geometry. Other initial routes mount immediately. Font-decode errors settle the startup promise so the application remains usable.

The tradeoff is about **45.5 KB of additional gzipped entry CSS** (14.8 KB + 15.8 KB + 14.4 KB WOFF2 subsets before base64 encoding). Home is currently an eager public route, so its CSS belongs to the entry bundle; the fallback families are used only by the home hero. The asset savings are larger: pattern 267,134 → 70,834 bytes, launcher card 65,214 → 5,208 bytes, and hero 253,154 → 55,044 bytes at 640 pixels or 97,396 bytes at 960 pixels. These are byte measurements, not a promised Lighthouse score.

To rebuild the checked-in fallback CSS, install build-only tooling with `python -m pip install 'fonttools[woff]'`, run `python scripts/build-home-fallback-fonts.py`, then run `npx prettier --write frontend/src/pages/home-critical-fonts.css`. No Python dependency is required at runtime or by the normal application build. Existing font timestamps are retained for deterministic output.

`tests/e2e/public-assets.spec.ts` holds every network WOFF2 request, verifies that the inline Vietnamese fallback faces are already usable, and requires the hero to move less than 3 pixels after the full fonts arrive. The typography test verifies that final rendered glyphs still use bundled Noto Serif. Both tests run at desktop and mobile sizes; deployment still requires the Linux CI checks to pass.
