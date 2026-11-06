# Running on your own computer

A public clone includes the full-quality game and all runtime art. These commands
start a server on **your own computer**. The loopback addresses below do not
connect to the maintainer's machine. There is no hosted playable demo yet.

## Play the game

Use Node 24 or 26, npm and Git on Linux or macOS. On Windows, use WSL2.

```sh
git clone https://github.com/madmancf/hostile-inference.git
cd hostile-inference
npm ci
npm start
```

Wait for the terminal to report that the server is ready, then open:

```text
http://127.0.0.1:4178/
```

Choose a faction and start First Light. Training and practice need no account.
Local sign-ups retain verified operations and faction contributions. Recovery
mail stays in a private local outbox unless an operator configures real email.
No paid AI provider account or separate asset download is required.

The server binds to loopback and keeps private data under `.runtime/`. It does
not publish a service to the internet. Stop it with Ctrl+C. Set
`HOSTILE_PREVIEW_PORT` to use another port if 4178 is already occupied.

## Troubleshooting assets

`npm start` verifies all 39 files against the published fingerprints. Run
`npm run check:assets` separately to list missing or altered files. Compare your
checkout with Git before restoring anything: preserve intentional art changes.
For an accidentally missing, unmodified tracked file, restore that exact path
with `git restore -- PATH`, then rerun the check. Do not download replacement
art from an unknown source. See [provenance and license](ASSETS.md).

## Account and server development

`npm run dev:server` starts the development server without the fingerprint
preflight. If art is incomplete, it shows a contributor workspace instead of
an incomplete game; accounts and standings still work at:

```text
http://127.0.0.1:4178/account/index.html
http://127.0.0.1:4178/leaderboards/index.html
```

To test that fallback deliberately, use
`HI_PREVIEW_SOURCE_ONLY=1 npm run dev:server`. Restart without that variable to
return to normal gameplay after restoring missing art.

## Testing and data

Run `npm run doctor` for prerequisites and `npm run verify` for source checks.
See [the test guide](TESTING.md) for isolated background browser coverage.
Keep `.runtime/`, backups, credentials and test reports out of commits. Never
point a test harness at an existing player's database.

## First Light diagnostics

First Light saves to `hostile-inference.tutorial-save.v3`. The older
`hostile-inference.local-save.v1` slot remains available for ordinary operations
and migration. Do not erase either key to repair a failed migration. When both
contain independent progress, choose the intended mission in the menu. Resume
and named retries open paused. Starting training again requires confirmation;
Cancel preserves the existing progress.

The Mission panel shows the current order and its blocker. The save status is a
separate persistent message. A named retry restores that checkpoint's units,
wallet, research, cooldowns and chapter progress; later actions are undone only
after confirmation. A defeated tutorial retains recovery across reloads.

| Code | Meaning and safe next action |
| --- | --- |
| `HI_STORAGE_UNAVAILABLE` | Storage denied or quota exhausted. Keep this tab for session-only recovery; retry saving from Save & menu after fixing browser storage. |
| `HI_SAVE_TOO_LARGE` | The complete envelope exceeds 600,000 JavaScript characters. Earlier saved bytes remain intact. Keep this session or use its earlier checkpoint. |
| `HI_SAVE_INVALID` | Damaged or unsupported save. Preserve the bytes; choose another valid save or explicitly start again. |
| `HI_SAVE_CHOICE` | Two independent missions exist. Select one in the menu. |
| `HI_SAVE_CHANGED` | Another session changed the save revision. Reload the current saved mission or explicitly replace it. |
| `HI_SAVE_BUSY` | Another tab owns tutorial saving. Continue unsaved or close that tab and reload this one. |
| `HI_LOCK_UNAVAILABLE` | Safe cross-tab saving is unavailable in this browser. Training remains session-only. |
| `HI_MIGRATION_INVALID_STATE` | Post-migration validation failed. Original bytes are intact; do not edit them to bypass validation. |
| `HI_CHECKPOINT_PREPARE` | A transient snapshot failure. Contact has not been released; one explicit preparation retry is available. |
| `HI_CHECKPOINT_INVALID` | Invalid, recursive, unaffordable or mismatched recovery state. Keep the earlier valid checkpoint; do not retry unchanged invalid data. |
| `HI_CHECKPOINT_RESTORE` | Recovery failed before the live-state swap. The live mission is unchanged. |
| `HI_ORDER_BLOCKED` | A prerequisite is missing. Follow the visible order, use Systems to cancel/refund paid work, or restore a named checkpoint. |
| `HI_ENCOUNTER_FAILED` | A required unit or demonstration was lost. Use the named training retry; Next never silently passes it. |
| `HI_ACCOUNT_UNAVAILABLE` | Account lookup failed. Practice remains available. Reopen the menu to retry. |
| `HI_VERIFY_UNAVAILABLE` | Verification transport failed. Reconnect to recover acknowledged orders; pending results award no points. |
| `HI_RESPONSE_INVALID` | A service response is malformed or mismatched. Reload/retry; no inferred score is substituted. |
| `HI_STANDINGS_UNAVAILABLE` | Current contribution is unavailable. Retry standings; the verified result itself is unchanged. |
| `HI_TRANSITION` | Unexpected local transition/serialization failure. Pause and retain the session for diagnosis. |

A rules/build mismatch gives a reload instruction before admitting a verified
start. Verification rejection stays rejected and cannot be forced successful.
Known zero contribution is different from unavailable standings; a null rank
cannot establish why a result is not counted.

Local diagnostic retention is bounded to 20 records. Error messages never copy
raw server text, credentials, saves or nested exception causes. Unexpected local
errors retain at most five sanitized module/line hints. There is no automatic
upload. The development build exposes read-only diagnostics through
`hostileDemo.diagnostics()`; the packaged runtime removes that capture global.

The synthetic [migration example](../tests/fixtures/first-light/migration-example.json)
contains the complete original and migrated records. To reproduce a rejection
safely, use disposable storage in Node instead of altering a player's browser:

```js
import {LocalArchive, TUTORIAL_SAVE_KEY} from './game/demo/local-archive.js';
const bytes = new Map([[TUTORIAL_SAVE_KEY, '{damaged']]);
const archive = new LocalArchive({
  getItem: key => bytes.get(key) ?? null,
  setItem: (key, value) => bytes.set(key, value)
});
console.assert(archive.load() === null);
console.assert(archive.errorCode === 'HI_SAVE_INVALID');
console.assert(bytes.get(TUTORIAL_SAVE_KEY) === '{damaged');
```
