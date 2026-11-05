# Architecture

Hostile Inference is a browser RTS with three fictional laboratories. Rendering
uses locally vendored Three.js. A Node server provides accounts and server-owned
match tickets. The same deterministic simulation runs in the browser and in
isolated replay workers. SQLite stores private accounts, journals and results.

## Main paths

| Path | Responsibility |
| --- | --- |
| `game/demo/engine.js`, `operation.js` | Unit orders, economy, combat, mission lifecycle |
| `demo/faction-rules.js`, `building-catalog.js`, `faction-tech.js` | Asymmetry, buildings and research |
| `demo/enemy-ai.js`, `tutorial.js` | Opponent decisions and faction tutorials |
| `demo/ranked-protocol.js`, `ranked-client.js` | Serializable commands and server session protocol |
| `servers/live-world.js`, `faction-assets.js`, `research-buildings.js` | Renderer, articulated machines and faction facilities |
| `api/ranked-service.mjs`, `replay-worker.mjs`, `ranked-rules.mjs` | Admission, durable verification and frozen rules |
| `api/accounts.mjs`, `account-safety.mjs`, `mail-delivery.mjs` | Identity, recovery, moderation and mail adapter |
| `api/leaderboards.mjs` | Verified-only player/faction projection |
| `api/operations.mjs`, `storage-lock.mjs` | Private operator socket, backup, restore, updates |
| `release/server.mjs`, `scripts/build-release.mjs` | Immutable runtime packaging and HTTP allowlist |

Paths abbreviated as `demo/` or `servers/` are under `game/`.
The older `v2/` and `server-demo/` pages are design history, not the current game.

## Verified play

1. A signed-in player selects their faction. Starting a verified run commits
   allegiance for the local season.
2. The server issues a private, expiring ticket, then starts its 15-minute clock.
3. The browser submits ordered command batches. Acknowledged batches are durable
   and retries are idempotent. The browser cannot submit an authoritative score.
4. A durable job replays accepted commands under the ticket's frozen rules.
5. Only a successful server verification produces a committed leaderboard result.
   Accounts can reconnect and read their private history after restarting.

Each player's contribution averages their best verified score against each rival.
The faction counts its top 20 players, divides by 20, and treats empty slots as
zero. Repeated runs can improve a best result but cannot stack extra points.

Active command state is bounded by admission (default eight runs). Historical
journals stay in indexed SQLite storage and load only on explicit private reads.
History is not deleted to make memory smaller. Verification retries and recovery
retain the original commands and prevent duplicate settlement.

## Constraints

Keep client/server determinism, frozen rule IDs, ownership checks, journal
idempotency, full graphics and save compatibility. Use a new rule/season policy
for balance changes affecting verification. Live peer-to-peer or real-time PvP
is not implemented. AI assistance and automation are not proof of human play.

Operator commands use a private local socket, never a public admin endpoint.
Read [the runbook](operations-0.20.md) before touching persistent state.
