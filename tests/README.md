# Choose the right regression tests

All commands below run from the repository root. `npm run verify` is the common
source gate; the table identifies extra coverage or a useful focused loop.

| Changed behavior | Focused checks | What to look for |
| --- | --- | --- |
| Orders, damage or economy | `node tests/demo.mjs`, `npm run test:ranked` | Same accepted commands produce the same browser/server result |
| Faction units, buildings or tech | `node tests/faction-gameplay.mjs`, `node tests/faction-tech.mjs` | Unlocks, costs, abilities and faction identity |
| Enemy tactics or balance | `node tests/enemy-ai.mjs`, `npm run test:enemy-balance` | Legal decisions across matchups; scripted wins alone do not prove fairness |
| Tutorial progression | `node tests/tutorial.mjs`, full-art browser checks | Reachable lessons, correct faction cues and useful feedback |
| Geometry or rendering | `node tests/faction-assets.mjs`, `node tests/draw-batches.mjs`, full-art browser checks | Structural correctness plus separate visual/frame-pacing review |
| Sign-up or account UI | `npm run test:accounts`, `npm run test:account-abuse`, `npm run test:browser` | Ownership, faction intent, persistence and actual navigation |
| Ranking rules | `npm run test:leaderboards` | Verified-only projection, ties and the approved contribution formula |
| Journals, workers or recovery | `npm run test:ranked`, `npm run test:verification-jobs`, `npm run test:operations`, `npm run test:history` | Acknowledged commands survive; retries never settle twice |
| Mail delivery | `npm run test:email` | Provider-contract fixtures, bounded retries and token/session behavior |
| Package contents or HTTP serving | `npm run build`, `npm run test:release` | Asset hashes, public allowlist, origin policy and portable replays |
| Contributor setup | `node tests/doctor.mjs`, `npm run test:browser` | Useful art-free startup; no dependence on private maintainer files |

## Background browser coverage

The source gate needs no art, account credentials or paid service. Browser setup
is documented in [the test guide](../docs/TESTING.md). The default browser run
uses one owned headless Chromium process and temporary accounts for all three
factions. It checks actual navigation and failed local resources at native zoom.

`HI_BROWSER_GAME=1 npm run test:browser` also opens the full-quality tutorial
for each faction using the included art; CI runs this extended mode. It is a
startup check, not a complete mission or FPS certificate. Packaging tests use
the same published files.

## Adding a regression

Reproduce the bug with an observable assertion, then show the fix passes. Prefer
the existing `node:assert/strict` scripts and deterministic fixtures. Bound waits,
close workers/browsers/servers in `finally`, and remove temporary data even after
failure. Do not depend on the normal Chrome app or a running preview instance.

Add a source-safe suite to [the runner](../scripts/test-source.mjs) and explicitly
allow its file in `.gitignore`. Keep captures, credentials, provider receipts and
large generated reports out of Git. The capacity soak is an explicit, lengthy
operator test; do not add it to routine PR CI by accident.
