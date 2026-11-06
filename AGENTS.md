# Agent contributor instructions

Read `README.md`, `.github/CONTRIBUTING.md` and `docs/ARCHITECTURE.md` before editing.
These instructions apply to Codex, Claude, Gemini and other coding assistants.

## Scope and source of truth

- Work on the assigned issue in a topic branch. Do not deploy, publish packages,
  send email, change repository settings or alter live player data unless the
  human explicitly requests that action.
- The game is a solo RTS against faction AI with asynchronous faction standings;
  do not describe it as live multiplayer. Sessions are bounded to 15 minutes.
- The 39 runtime art files are public under `docs/ASSET_LICENSE.md`; see
  `docs/ASSETS.md` for provenance. Source/procedural geometry remain MIT. New art
  needs its own provenance and distribution review; never add private masters.
- Do not reduce shadows, textures, geometry, animation or other quality settings
  to meet performance targets. 60 FPS remains the target; certify it separately with real-clock measurements.

## Where to work

- Simulation, faction rules, tech, AI: `game/demo/`.
- Three.js rendering, articulated units, territory geometry: `game/servers/`.
- Accounts, replay workers, results and operations: `api/`.
- Entry/account/standings UI: `game/entry/`, `account/`, `leaderboards/`.
- Packaging: `release/` and `scripts/build-release.mjs`.
- Tests: `tests/`. New public files must pass the explicit `.gitignore` allowlist.

## Verification

Run `npm run check`, `npm test`, and `npm run check:public` for a PR. Add targeted
coverage for changed behavior. UI changes also need `npm run test:browser`;
full-game browser checks use the included runtime art pack. Use temporary
directories and guaranteed cleanup. Never target another running preview.

Keep browser testing in the background. Use one owned bundled Chromium or
Chrome for Testing process per task, with teardown. Do not open the normal
macOS Google Chrome application or bring windows to the foreground.

Preserve command acceptance, replay determinism, idempotency, private ownership,
durable jobs and prior verified records. Simulation changes affect frozen rules;
explain the transition instead of silently changing the hash. Keep DB migrations
recoverable. Report tests actually run, failures, and untested areas separately.

Keep logs and binary evidence outside Git. Do not embed credentials, browser
state or private chat history in issues, PRs or agent handoffs. Passing technical
checks does not constitute human gameplay or artistic approval.

Use concise commit subjects that describe the change. Put verification details
in the PR description; omit agent narration and implementation status from titles.

## Starting and handing off a task

1. Run `git status --short` and read the README in the component you will change:
   [game](game/README.md), [API](api/README.md), [tests](tests/README.md),
   [scripts](scripts/README.md), or [release](release/README.md).
2. State the observable acceptance condition. For a bug, capture a failing case
   before editing. Use `npm run doctor` to check a new checkout without starting
   services or reading private account data.
3. Keep each commit focused on one behavior or documentation area. Name that
   change concretely. Folder-row labels on GitHub are last-commit subjects, not
   custom descriptions; never add empty commits or meaningless edits for labels.
4. Inspect `git diff --cached` before committing. A new public file may need an
   explicit `.gitignore` exception; use `git check-ignore -v PATH` to diagnose it.
   Preserve unrelated working changes and never force-add private output.
5. Hand off the changed paths, the acceptance condition, commands actually run,
   results, and remaining limitations. Label a proposal as a proposal. Link to
   the commit and concise evidence; leave raw test accounts and reports private.

`npm run verify` runs source syntax, public-tree checks and the source suite.
See [the test map](tests/README.md) for additional checks required by your change.
