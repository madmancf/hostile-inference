# Full-quality FPS qualification

## Measured result — 6 November 2026

**The three-operation background gate passed** on game/API source
[`b4f232e`](https://github.com/madmancf/hostile-inference/commit/b4f232e8390e2e10c3f382a8e15408c5ffe6e93f).
This is a scoped measurement of the setup below, not a universal 60 FPS promise.

Hardware: Apple M4 Pro, 14 CPU cores, 64 GiB RAM. Browser: headless Chrome for
Testing 157.0.8103.38 using ANGLE Metal. Viewport: 2382×1383 CSS pixels at 100%
zoom and DPR 2; battlefield buffer: **4004×2038**. The full settings below were
asserted throughout. No game, API, art or renderer setting was changed for this run.

| Faction → rival | Outcome / active time | Average FPS | p99 upper bound | Largest frame interval | Lowest complete rolling second |
| --- | --- | ---: | ---: | ---: | ---: |
| Misanthropic → Closed AI | Victory / 407.20 s | 59.997 | 17 ms | 33.4 ms | 57 frames |
| Closed AI → Broke Labs | Victory / 430.45 s | 60.002 | 17 ms | 16.8 ms | 59 frames |
| Broke Labs → Misanthropic | Victory / 701.20 s | 60.002 | 17 ms | 16.8 ms | 59 frames |

Across **92,333 measured draw intervals and 25m 38.85s of active play**, all three
runs had zero gaps over 100 ms, zero observed long tasks, no visibility changes,
no page exceptions and no failed local resources. Source and harness fingerprints
were unchanged during the run. The 33.4 ms Misanthropic interval is retained;
the result does not mean every individual interval was exactly 16.7 ms.

| Faction | Deployments | Enemy eliminations | Transfers | One-second observations with visible firing | Maximum visible / total units |
| --- | ---: | ---: | ---: | ---: | ---: |
| Misanthropic | 10 | 13 | 2 | 72 | 12 / 22 |
| Closed AI | 13 | 10 | 3 | 49 | 16 / 24 |
| Broke Labs | 19 | 14 | 3 | 345 | 16 / 24 |

Each run exercised faction buildings/research, ordinary resource costs, home
defense, rival-campus combat and abilities through player controls. Firing is
sampled once per second; these counts are observations, not exact combat duration.
All predefined frame and coverage thresholds passed. Earlier short probes and an
aborted, insufficiently active commander workload are excluded from qualification.

The measurement ran from 22:11:59 to 22:37:49 UTC. Raw diagnostics stay outside
Git. Reproduce the gate below; independent foreground-display, other-hardware,
ranked-network and human-playtest acceptance remain separate work.

## Run the qualification

Run these commands from a complete source checkout after `npm ci`. The portable
runtime includes this guide for reference; the test scripts and Playwright live
in the source checkout. See [local setup](LOCAL_DEVELOPMENT.md).

`npm run test:fps` runs three complete, real-clock practice operations in one
isolated, headless Chrome for Testing process. It uses the actual player controls
for production, economy, transfers and combat. Normal autosaving remains enabled.
There is no virtual clock, autoplay director or injected game state.

Install the bundled browser with `npx playwright install chromium`. The runner
starts a disposable local server and database, uses fresh browser contexts, and
closes its processes in teardown. It never opens regular Chrome or changes an
existing player's data. On macOS it requests Metal hardware rendering. Software
rendering is rejected. Linux needs the browser sandbox prerequisites described in
[the testing guide](TESTING.md).

## Fixed workload and budget

- 2382×1383 CSS-pixel viewport, native zoom, device pixel ratio 2. The battlefield
  buffer must match its current CSS dimensions at full DPR, with no resolution scale.
- Original full graphics: 4096 shadows, 2048 reflections, 32 AO samples and 0.16
  bloom. The original art, geometry, materials and update rates are unchanged.
- Misanthropic → Closed AI, Closed AI → Broke Labs, Broke Labs → Misanthropic.
- Each session runs until its real victory, defeat or 15-minute timeout.
- The UI commander keeps home defenders, develops faction-specific buildings and
  research, trains mixed armies, captures the rival relay and uses unit abilities.
- Each session must include at least 10 deployments, 10 enemy eliminations, one
  transfer, both campuses viewed and 30 one-second observations of visible firing.
  These workload gates prevent a quiet siege from passing on frame cadence alone.
- Required for every complete session: average at least 59.5 FPS (allowing a
  59.94-Hz cadence), p95 at most 17.5 ms, p99 at most 25 ms, every complete rolling
  second at least 55 frames, maximum gap at most 100 ms and no gaps over 100 ms.

These thresholds are fixed before the run. Failed frames are not discarded.
Loading and intentional menu time are outside the active-game interval. Any
unintentional pause, hidden document, changed source, reduced quality or resource
failure invalidates the measurement. The clock must agree with elapsed wall time.

For a short diagnostic, use `HI_FPS_FACTION=closed HI_FPS_SECONDS=90 npm run test:fps`.
It reports `probe-complete`, never a full qualification. A full run can take up to
45 minutes. The harness prints progress every 15 simulated seconds and keeps a
bounded JSON report under ignored `output/playwright/fps-<timestamp>/`.

## Reading the result

The report records source identity, Chrome version, GPU, CPU, viewport, quality,
OS load, frame histogram summaries, the worst frames, long tasks and outcomes.
`qualified-background-60hz` means all three specified sessions met the budget on
that machine in headless Chrome for Testing. It is not a certificate for a
foreground display, ordinary Chrome profiles, other hardware or every scenario.
`frame-budget-failed` and `workload-coverage-failed` retain measurements and exit
nonzero. A complete single-faction run reports `single-faction-complete`; it cannot
claim three-faction qualification.

A real clock and hardware renderer distinguish this from the accelerated
functional tutorial tests. Frame cadence measures submitted gameplay draws;
headless testing does not independently prove physical display presentation.
Do not advertise universal 60 FPS from this result. Keep independent player
feedback and visual approval separate from frame-rate evidence.
