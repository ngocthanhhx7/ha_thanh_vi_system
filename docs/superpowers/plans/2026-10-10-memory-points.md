# Memory points Implementation Plan

> **For agentic workers:** Execute tasks in the current session; use isolated file ownership for parallel work.

**Goal:** Replace memory missions with timed rounds, expiring points and personal capped vouchers.

**Architecture:** Keep the existing serialized MongoDB game transaction and receipt pattern. Put timed-round/point rules in a focused module; extend voucher calculation with an optional order cap. Preserve collection state and issued rewards.

**Tech Stack:** TypeScript, Express, Mongoose transactions, React, GSAP, Node test runner, Playwright.

## Tasks

- [x] Add failing rule tests for three starts/day, server deadlines, wins/bonus/day cap, exact expiry, migration preserving collection and receipt safety. Implement memory rules and integrate GameService/start/redeem/flip routes. Reject the old fixed reward endpoint.
- [x] Add voucher calculation tests for `min(value, floor(subtotal * 0.1))`, zero and rounding, and normal legacy vouchers. Add optional `orderPercentCap` to model/repository/customer DTO; show it in wallet and checkout before order confirmation.
- [x] Replace memory missions with score/redemption panel, start button, countdown, win/loss results. Maintain pair reveal timing and session guards. Update game API types and round-bound request payloads. Remove legacy visit grants; preserve products presence for collection bonus.
- [x] Test full timed-game UI and expiry with mocked APIs on desktop/mobile; test concurrent point redemption/retries/rollback against a temporary MongoDB replica set. Run typecheck, lint, backend tests, production builds and targeted Playwright; update user-facing rules and operational docs.

## Acceptance examples

```text
200 + 50, 200 + 50, 200 -> points grants 250, 250, 100 (daily total 600).
Redeem 3,200 active points -> 3,200đ voucher, points balance 0.
Apply that voucher to 20,000đ goods -> 2,000đ off; unused 1,200đ expires on use.
Two concurrent identical redemption UUIDs -> one voucher/wallet/notification and one debit.
At exactly the 60-second deadline -> no win or points; reload cannot extend it.
At exactly a point lot expiry -> omit its amount from redeemable balance.
```
