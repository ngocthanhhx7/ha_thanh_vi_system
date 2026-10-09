# Backend latency investigation — 2026-10-09

## Read-only production measurements

Measured from the current developer workstation and inside the running API container. Each request series contains six samples; public requests used Node `fetch`, consumed the response body, and sent no account cookie. No production game, payment, customer message, or account mutation was performed. No `.env` file, credential, database URI, or customer content was printed/read from a configuration file. The database diagnostic inherited the existing container runtime connection setting and queried only safe projections.

| Measurement                                               | Observed milliseconds        |
| --------------------------------------------------------- | ---------------------------- |
| VPS → MongoDB ping, six samples                           | 225, 222, 223, 222, 222, 222 |
| API loopback health, after the first request              | 5, 3, 3, 7, 3                |
| API loopback `/api/content`, six samples                  | 224, 220, 224, 221, 219, 219 |
| Existing session lookup then account lookup, sequential   | 443, 440, 440, 448, 441, 440 |
| Same session/account resolved with one aggregation lookup | 221, 220, 220, 220, 220, 220 |
| Workstation → public health, warm samples                 | 318, 309, 321, 300           |
| Workstation → public content                              | 542, 534, 535, 542, 802, 624 |
| Workstation → public homepage                             | 319, 342, 551, 482, 323, 346 |

The first public health request took 1173 ms including establishing a connection; this is not the warmed API handler time. A fresh database connection took 2139 ms; the existing API normally uses its established pool, so this is not charged to every request.

MongoDB `hello` reported AWS region `AP_SOUTHEAST_1` (Singapore). The current EC2 server is in `us-east-1` (Virginia). The approximately 222 ms database round trip is therefore an inter-region network cost. Public health has no database query for an anonymous caller and still takes roughly 300 ms from this workstation, while loopback health takes 3–7 ms. These are separate network legs.

At the diagnostic snapshot, the server had 381 MiB available RAM of 910 MiB, API RSS/container memory about 105 MiB, web container about 27 MiB, and both containers had zero restarts. Five seconds of `vmstat` showed 99–100% idle CPU, no ongoing swap-in/out and no I/O wait. Existing swap use of 196 MiB is historical residency, not evidence of current thrashing. This snapshot does not certify peak traffic capacity or available EC2 CPU credits.

## Application change

`CustomerRepository.sessionUser` resolves the session and current user with one indexed `$match` plus `$lookup` command, replacing two sequential database commands. The lookup projects only fields needed for the session view and permission checks. Every request still validates expiry, verification status, suspension and the current account `authVersion`; no account/session authorization cache was introduced.

The read-only production query comparison saved about 220 ms per session lookup under the current cross-region placement. This is a query benchmark, not a claim that every page or game turn is 220 ms faster: actual requests have additional work and network variability.

Before this change, a normal game flip resolves the session and user separately, then executes five model operations in a transaction plus its commit. Serial database network costs compound. We did not mutate a real player's game to measure a complete production flip. The server's mismatch deadline begins before these database operations complete; the frontend must therefore provide a visible viewing interval starting when the second card is actually shown, and must not interpret an already-elapsed server deadline as permission to hide a card before it has been seen.

## Infrastructure recommendation

If moving the VPS, Singapore is the first region to benchmark because the existing database is already there and the customers are primarily in Vietnam. Prefer colocating API and database rather than merely increasing CPU/RAM in Virginia. This requires a real comparison from the proposed server before claiming a new response-time target. Preserve HTTPS, uploads, deployment environment, database restrictions, DNS and Socket.IO proxy behavior during any migration.

Keeping the current VPS and migrating the database cluster to AWS `us-east-1` is also a valid way to remove the cross-region database leg. Creating another database inside the existing Singapore cluster does not relocate it. A new cluster requires a verified transfer of existing accounts, orders, vouchers and game state before changing the application connection. The Vietnam-to-Virginia user network leg remains. No cluster migration or connection change was performed as part of this patch. See [MongoDB deployment guidance](https://www.mongodb.com/docs/atlas/architecture/current/deployment-paradigms/multi-region/).

## Verification

The session optimization passed backend typecheck and 24 local database-backed tests covering account/auth APIs, chat handoffs and the new lookup regressions. New regressions assert one database command, immediate changes of role/name, suspension, account-version revocation, unverified accounts, expiry, deleted sessions and deleted users. Local tests use an isolated MongoDB memory replica set, not production customer data.
