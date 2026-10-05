# Account entry layout implementation plan

> **For agentic workers:** Use subagent-driven-development for scoped implementation and review. Track the steps below; preserve all pre-existing working-tree changes. The initial layout request was local; the subsequent user request on 2026-10-05 authorizes commit, GitHub push and VPS deployment.

**Goal:** Make login and registration compact and give the surrounding empty space a purposeful Hà Thành Vị composition.

**Architecture:** Keep the existing single-column forms and authentication state machine. Add a presentation-only credentials modifier, scope its spacing rules to the account entry page, and align the welcome/form cards at the top. Use the existing local pastry photograph as a decorative welcome visual; no new dependency or remote asset.

**Tech Stack:** React, TypeScript, CSS, existing Playwright UI tests.

## Investigation and boundaries

- [x] Trace callers: AuthForm is rendered only by the unsigned Account view. AuthForm also contains OTP; auth.css is imported by recovery and its checkbox class is reused in Admin.
- [x] Measure the current page at 1440 × 1000: field bottom margin 20px plus grid gap 16px creates 36px between fields. Login card height 638px; registration card height 972px and its submit button ends below the viewport at 1008px.
- [x] Identify surrounding whitespace: shell minimum height/padding, 100px column gap, 48px form padding, and vertical centering that lowers the welcome card when registration becomes taller.
- [x] Compare approaches: compact spacing alone leaves a bare surrounding composition; a two-column registration form changes the reading pattern and complicates responsive behavior; compact single-column forms with top-aligned cards and an existing brand photograph address both concerns with limited functional risk.
- Do not read any .env file, change authentication handlers, submit real credentials, create customer records, or touch backend/API code.
- Do not change shared .field, .account-panel, .auth-remember, .auth-reset or global section rules. Preserve existing password recovery link changes and unrelated header/staff/workspace edits.

## Task 1 — credentials spacing

**Files:** frontend/src/components/AuthForm.tsx; frontend/src/components/auth.css.

- [x] Add auth-panel--credentials only while the OTP step is absent; do not change handlers, form keys, fields, attributes or focus order.
- [x] Scope field margin reset, 16px form gap, 8px label/input gap, heading/tabs separation and footer spacing to .account-auth > .auth-panel--credentials.
- [x] Keep input and button minimum heights and existing focus styling. Preserve OTP, recovery and admin checkbox rules.

## Task 2 — surrounding composition

**Files:** frontend/src/pages/Account.tsx; frontend/src/pages/account-public.css.

- [x] Align the two entry cards at the top and reduce the space between them and above them. Remove forced shell height for credentials; keep readable form width.
- [x] Compact the welcome copy and add a decorative aria-hidden visual using /brand/pastry.webp. Place it below the text so text always remains readable. No added control or navigation behavior.
- [x] Reduce credentials card padding on desktop; retain comfortable mobile padding. On smaller screens use one column, a shorter welcome block and omit the decorative photo so form access stays practical.
- [x] Verify mobile breakpoint and intermediate tablet widths; no horizontal overflow, clipped labels or undersized fields.

## Task 3 — verification and review

- [x] Capture before/after login and registration at 1440px and 390px; check 320px, 760px, 768px and 1024px. Check field geometry and submit position, long feedback and keyboard focus.
- [x] Run existing authentication/account tests (including invalid confirmation, OTP retry/resend, login errors and password recovery) and the remaining UI regression suite for shared flows.
- [x] Run frontend build, lint on touched TSX, formatter check and git diff --check. No new tests that merely copy CSS declarations.
- [x] Obtain an independent source review of selector isolation and behavior preservation; fix verified findings.
- [x] Record measured results and limitations here. Save local screenshot proof and report changes without committing or deploying.

## Results

- At 1440 × 1000, both registration cards start at y=177px and have height 818.4px. The registration submit button ends at y=873.8px (previously 1007.8px); login card height is 548px (previously 638px). Between-field spacing is 16px rather than 36px; input height remains 48px.
- The welcome photograph stretches into the desktop registration card's unused space; both card tops and bottoms align. Below the 760px breakpoint the photo is hidden and the compact welcome/form blocks stack. Hà Nội stays together when the headline wraps.
- Browser checks at 320, 390, 760, 768, 1024, 1440 and 1920px found no horizontal overflow. Keyboard Tab reaches the password field after email, with a visible focus outline. Mobile registration still scrolls naturally because five fields cannot fit in one short viewport.
- Existing full UI regression suite: 88/88 passed on desktop/mobile. Final targeted auth/guest rerun after headline wrapping cleanup: 18/18 passed. The suite covers registration validation and feedback, OTP retry/resend, pending accounts, rejection, recovery, checkout, account, staff/admin and news flows with mocked APIs.
- Frontend TypeScript/build, touched-TSX ESLint, Prettier and diff whitespace checks passed. The existing Vite bundle-size warning remains; no bundle optimization was part of this layout repair.
- Independent source review found no concrete regression. Credentials-only selectors do not match OTP/recovery/Admin forms. Their existing styles and authentication behavior are preserved; no live account or database was modified.
- Screenshot proof: .local/auth-login-before.jpg, .local/auth-register-before.jpg, .local/auth-login-after.jpg, .local/auth-register-after.jpg, .local/auth-login-mobile-after.jpg, .local/auth-register-mobile-after.jpg.
- At the layout handoff the work was local and uncommitted. The subsequent user request authorizes shipping the reviewed changes together with the header, staff/workspace and password-link changes. No .env file was inspected, and Claude CLI was not needed.
