# Standalone film and smaller memory rounds

User-approved scope: add `/story/video`, restore Story page launchers, increase memory rounds to 120 seconds and randomly choose five pairs per new round.

- [x] Remove the Story-only CSS hiding game/chat launchers. Keep inline film behavior.
- [x] Add a separate, lazy-loaded full-viewport player without public layout, shop requests or notification polling. Autoplay with sound when allowed, muted fallback, manual activation if both are blocked, sound control, native playback controls and retry. Redirect home with history replacement only on the real media ended event.
- [x] Shuffle the complete ten-type pool with cryptographic randomness, select five distinct types, duplicate them and shuffle the ten cards. Set server deadline to start + 120000 ms and validate/win against actual board length. Keep active legacy rounds consistent with their stored deadline and board; update an old idle preview to ten cards.
- [x] Update progress, timer, hints and rules. Use five columns/two rows on desktop and three columns/four rows on portrait phones, centering the final card. Preserve fullscreen and pair-view timing.
- [x] Add server invariants/random selection/deadline tests and browser autoplay/fallback/end/retry/launcher tests. Update existing game fixtures for 10 cards and 120 seconds.
- [ ] Finish browser checks, verify typecheck/lint/build/format, commit and push. Wait for CI; deploy API and web together using rollback images, then verify public video, launchers and the deployed game rules without touching stored points or inventory.
