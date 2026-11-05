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
