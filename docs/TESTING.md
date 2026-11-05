# Tests and contributor setup

Use Node 24 or 26 with `node:sqlite`, npm and Git on Linux or macOS. Windows is
not certified; use WSL2 for the Unix-domain operator socket tests. No model API
or account credential is needed. `npm ci` installs the lockfile's dependencies.

| Command | Scope |
| --- | --- |
| `npm run check` | Syntax checks for tracked JavaScript, excluding vendored code |
| `npm test` | Deterministic gameplay, faction tech/AI, renderer geometry, account/replay/leaderboard, mail fixture and recovery regressions |
| `npm run check:public` | Tracked file/secret/privacy scan and local Markdown links |
| `npm run test:browser` | Contributor home, missing-art game links, account signup/login/allegiance/history/leaderboard UI for all three factions; fails on page errors and failed local resources |
| `HI_BROWSER_GAME=1 npm run test:browser` | Adds full-graphics tutorial startup for all factions using the included assets |
| `npm run check:assets` | Exact full-quality runtime file fingerprints; missing art is an explicit failure |
| `npm run test:enemy-balance` | Existing wider balance matrix; one policy, not comprehensive fairness evidence |
| `npm run test:history` | Archived journal heap growth and indexed private history/retry integrity |
| `npm run test:capacity-soak` | 30-minute eight-stream API/worker load, forced restarts and backup/restore; several GiB temporary disk |

Browser setup (one time): `npx playwright install chromium`.
Linux may also need `npx playwright install --with-deps chromium`.
The runner uses one headless bundled Chromium process with isolated contexts and
temporary server state. `HI_BROWSER_EXECUTABLE` can select an existing Chrome
for Testing binary. The normal macOS Google Chrome application is forbidden.
All owned processes, contexts and temporary account data close on completion.

Chromium sandboxing stays enabled. On disposable Ubuntu CI runners, the workflow
installs an AppArmor user-namespace profile for the exact bundled browser binary,
following [Chromium's guidance](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/security/apparmor-userns-restrictions.md).
It does not disable the host-wide restriction or modify a contributor's machine.

`npm run dev:server` starts the loopback development server without requiring
art; account and leaderboard pages work. Without art, entry and game routes show
an explicit contributor workspace. The default browser check forces that mode
even on a complete checkout so the missing-art fallback remains covered.
`npm start` checks assets before starting that same server. Use
`HOSTILE_PREVIEW_PORT` for a different port. Never reuse another player's data
directory for testing. The optional `npm run preview:managed` is macOS-only.

Tests create ignored reports in `output/` and disposable state in OS temporary
directories. Do not upload raw reports containing credentials. A short soak is
available with `HI_SOAK_SECONDS=60 HI_SOAK_HISTORY=100 npm run test:capacity-soak`,
but is only a smoke check and does not establish the full soak acceptance.

CI runs source tests on Linux with Node 24 and 26, and background browser account
checks plus full-graphics tutorial startup on Node 24 using the published art.
CI has no production secrets. It does not finish entire tutorials, certify frame
rate, validate rights or judge enjoyment.
New engine behavior must have replay/determinism coverage; a rules-changing PR
needs an explicit compatibility/season plan.
