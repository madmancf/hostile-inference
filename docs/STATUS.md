# Release status and contributor audit

Reviewed 5 November 2026. **The source is public; the complete game is not yet a
self-contained public download, and no hosted player service has launched.**

## What a new contributor can do

| Available from a public clone | Still unavailable or unverified |
| --- | --- |
| Read and change the simulation, renderer and server source | Render the complete game without the excluded external art |
| Run the source tests without credentials or private art | Download an authorized public art pack |
| Develop local accounts and standings through the contributor workspace | Join a hosted public season or receive real recovery email from this project |
| Submit human-written or LLM-assisted pull requests | Treat passing CI as visual approval, full-mission acceptance or a 60 FPS certificate |

The complete maintainer installation retains the original graphics. The missing
art is a distribution limitation, not a reason to substitute lower-quality
graphics. [Asset scope](ASSETS.md) explains the unresolved rights boundary.

## Findings and corrections

The earlier repository report accurately recorded passing technical checks, but
did not establish a complete newcomer experience. It should not have been
presented as sufficient evidence that publication was finished.

| Finding reproduced in the published source | Correction |
| --- | --- |
| Local server URLs were presented as clickable links in the public overview | The overview has no loopback URLs. Local addresses are explicitly documented as belonging to the reader's own computer. |
| The art-free clone served a landing page with missing images and an unusable game route | The development server detects absent art and shows a contributor workspace. Tutorial/practice/operation links explain the limitation and retain the selected faction on return to accounts. |
| The browser test checked game link strings without following them, and ignored failed resource requests | It now visits the home page, follows all three account-to-game links for every faction, and fails on local resource errors and page exceptions. CI exercises automatic art detection in a public clone. |
| The email guide assumed private configuration files already existed and used a package-only startup command without establishing that context | It now explains file creation, permissions, source-preview startup and the separate portable-package settings. |
| Public operator docs referred to excluded private receipts as though contributors had them | The docs identify those measurements as historical/private and direct contributors to reproducible tests. |
| UI status text named an old version and said nothing had been published | It now distinguishes a development build from a hosted service. |
| CI actions used a deprecated Node runtime; portable-package metadata advertised a broader Node range than the supported source setup | Actions now use pinned Node 24 revisions. Package engines follow the source's Node 24/26 range. |

## Verification scope

The audit used a fresh clone of public commit `064ec9d`, then applied the fixes.
It reproduced the missing-image responses and lack of a missing-art notice
before the changes. Afterward, automatic detection worked without private art
or the maintainer's compatibility symlinks. The README's `npm ci` command ran;
full-game start/build commands failed clearly with asset instructions, as
expected without art.

All 21 source suites passed in that clone. A background bundled Chromium run
covered three faction account flows in contributor mode and three with the
full art installed: entry, signup, faction preservation, reload/login, history,
standings and layout overflow at 390/1366 CSS pixels and native zoom. The
art-installed paths additionally reached tutorial startup and checked the
existing graphics settings. No page exceptions or failed local resource
requests were recorded. All 39 original runtime asset fingerprints matched.

A temporary full-art package also passed its release checks: all six replay
matchups, account/session persistence after restart, verified-email admission,
asset hashes, HTTP caching and the public-file allowlist. That package remained
local and was not distributed.

These are automated functional checks, not an independent visual review or
complete human playthrough. The 30-minute capacity test was not repeated for
this documentation/navigation change. Current hosted source/browser CI results
are visible in [Actions](https://github.com/madmancf/hostile-inference/actions/workflows/ci.yml).
Dependency advisory and credential-pattern scans are limited checks, not a
security certification.

## Remaining release work

1. Resolve art redistribution and provide a complete authorized pack. A new
   contributor must be able to obtain it and play without maintainer-only files.
2. Have independent newcomers finish tutorials and operations for each faction;
   review clarity, presentation, balance and accessibility.
3. Certify full-quality 60 FPS and frame pacing on representative hardware.
4. Before a hosted launch, verify real email, support contacts, domain/TLS,
   hosting capacity, abuse controls, monitored backups and restore procedures.

No deployment, real email sending or player-data migration was performed by this
audit. See the [roadmap](ROADMAP.md) and [test guide](TESTING.md) for scope and
reproduction commands.
