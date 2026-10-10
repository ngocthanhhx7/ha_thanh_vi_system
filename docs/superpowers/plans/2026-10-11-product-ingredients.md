# Product ingredient catalog and account navigation

Implement the user's approved requirements in the existing content CMS. Keep legacy packaging, label, allergen and storage data; replace only the public pack/label panels with the ingredient experience. No environment file reads or destructive database reset.

- [x] Backend: add a validated ingredient catalog (id, name, image, description, coreFlavor) and product ingredientIds. Add admin-only CRUD with existing CSRF/auth protections and optimistic concurrency. Reject unknown references and deletion of ingredients used by products.
- [x] Seed: store the nine supplied descriptions/core flavors and existing game card images in content/site.json. Add non-destructive, idempotent startup migration for existing content; associate only known seed products according to traditional/chocolate/matcha variants, keeping explicit admin selections and edits.
- [x] Admin: add ingredient management navigation/editor, existing image uploader, and ingredient checkboxes in product editor. Preserve catalog when saving unrelated website content.
- [x] Product detail: replace the two panels with a seamless right-to-left GSAP ingredient strip and enlarged ingredient dialog. Pause controls, hover/focus/modal/offscreen pause, reduced-motion support, keyboard access, cleanup and responsive layout.
- [x] Account: customer login returns home; staff/admin login opens respective dashboard; all successful logouts return home. Include OTP and trusted-device login paths.
- [x] Verification: backend CRUD/reference/migration tests; public ingredient dialog/motion and admin selection E2E; role redirect tests; typecheck/lint/build/full relevant suites. Review implementation before commit.
- [ ] Release: commit and push, wait for GitHub CI, deploy API and web on the already authorized VPS with rollback images, verify health and public ingredient data without reading .env.

Execution uses the subagent-driven-development skill for scoped backend/admin/auth implementation and review, with the primary agent responsible for the public ingredient strip, integration and release.

Additional user requests implemented: large square product hero; scoped public image context-menu/drag suppression and iOS touch-callout suppression (a deterrent, not absolute download prevention).

Validation: full browser suite 198 passed before final review fixes; updated ingredient/admin cases passed after fixes, including real coordinate mouse/touch activation after the strip moves. Backend 141 tests, typecheck, lint and production build passed. Dedicated site-only patch prevents catalog lost updates. Independent review rechecked both fixes.
