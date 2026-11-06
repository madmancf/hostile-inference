# Development and operator commands

Run these commands from the repository root. The scripts use the public source
layout; no maintainer-only directory aliases are required.

| Command | What it does | Side effects |
| --- | --- | --- |
| `npm run doctor` | Checks Node, SQLite, Git, dependencies and optional art presence | Read-only; no server, database or network requests |
| `npm run doctor -- --json` | Same preflight in a structured form for tools | A nonzero exit means source prerequisites are missing; absent art alone is not a failure |
| `npm run verify` | Syntax, public-tree scan and source regressions | Tests use disposable data and write ignored reports |
| `npm run dev:server` | Starts the contributor/game development server | Creates local private state under `.runtime/` |
| `npm start` | Checks exact art fingerprints, then starts development | Same state as `dev:server`; missing art stops startup |
| `npm run test:browser` | Runs background contributor/account UI checks | Own browser, temporary accounts and ignored reports |
| `npm run test:fps` | Measures complete operations for all three factions with full graphics and real time | One owned background hardware-rendered browser; up to 45 minutes; private reports |
| `npm run build` | Builds a full-art immutable runtime | Writes `dist/` and changes `dist/current.json` |
| `npm run start:release` | Starts the currently selected package | Requires explicit runtime storage and origin settings |

The doctor checks asset sizes, not hashes. Use `npm run check:assets` for exact
fingerprints. A passing preflight means prerequisites are present; it does not
mean tests passed, art rights are cleared, or the game meets its FPS target.

`npm run check:public` scans the Git index, so stage intended public files first.
It cannot prove that arbitrary untracked files are safe to publish. Inspect the
staged diff and keep the explicit `.gitignore` allowlist narrow.

## Private operator access

```sh
npm run ops -- status --data /absolute/private-data
```

The data directory contains the running instance's `accounts.sqlite`. Status is
read-only; commands such as drain, restore and moderation change state. Read
[the operations guide](../docs/operations-0.20.md) and use the running release's
CLI before attempting those changes. Never aim a regression test at player data.

`preview:managed` and `preview:stop` control the macOS launchd development job.
They are optional maintainer tools, not required for portable contributor setup.
For normal development, use the foreground server and stop it with Ctrl+C.
