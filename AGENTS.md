# Agent contributor instructions

Read `README.md`, `CONTRIBUTING.md` and `docs/ARCHITECTURE.md` before editing.
These instructions apply to Codex, Claude, Gemini and other coding assistants.

## Scope and source of truth

- Work on the assigned issue in a topic branch. Do not deploy, publish packages,
  send email, change repository settings or alter live player data unless the
  human explicitly requests that action.
- The game is a solo RTS against faction AI with asynchronous faction standings;
  do not describe it as live multiplayer. Sessions are bounded to 15 minutes.
- Public art rights are unresolved. See `docs/ASSETS.md`. The renderer and
  procedural faction geometry are source code; excluded external art is not MIT.
- Do not reduce shadows, textures, geometry, animation or other quality settings
  to meet performance targets. 60 FPS certification is still deferred.

## Where to work

- Simulation, faction rules, tech, AI: `design-preview/demo/`.
- Three.js rendering, articulated units, territory geometry: `design-preview/servers/`.
- Accounts, replay workers, results and operations: `api/`.
- Entry/account/standings UI: `design-preview/entry/`, `account/`, `leaderboards/`.
- Packaging: `release/` and `scripts/build-release.mjs`.
- Tests: `checks/`. New public files must pass the explicit `.gitignore` allowlist.

## Verification

Run `npm run check`, `npm test`, and `npm run check:public` for a PR. Add targeted
coverage for changed behavior. UI changes also need `npm run test:browser`;
full-game browser checks require the rights-cleared art pack. Use temporary
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
