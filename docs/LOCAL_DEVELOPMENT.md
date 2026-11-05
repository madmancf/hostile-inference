# Running on your own computer

These instructions are for contributors who have cloned this repository.
They start a server on **your own computer**. The addresses below are loopback
addresses; they do not connect to the project maintainer's machine or to a
public Hostile Inference service. There is currently no hosted playable demo.

## Prerequisites

Use Node 24 or 26, npm and Git on Linux or macOS. On Windows, use WSL2.
From the cloned repository, run `npm ci`.

## Account and server development

The public source includes the simulation and server. The external generated
art pack is excluded pending redistribution clearance. You can test account
and leaderboard features without that pack:

```sh
npm run dev:server
```

Once the terminal reports that the server is ready, enter either address in
your browser's address bar:

```text
http://127.0.0.1:4178/account/index.html
http://127.0.0.1:4178/leaderboards/index.html
```

The server binds to loopback and stores its private data under `.runtime/` in
this checkout. These commands do not publish or expose a service to the internet.
Stop the foreground server with Ctrl+C. Use `HOSTILE_PREVIEW_PORT` to choose a
different port when another local process already uses 4178.

## Full 3D game

First follow [asset setup](ASSETS.md). A fresh public clone does not contain the
art pack and cannot render the complete game without it.

```sh
npm run check:assets
npm start
```

When the server is ready, enter `http://127.0.0.1:4178/` in the same computer's
browser. Training and practice work without an account. Local sign-ups enable
verified operations; local email stays in a private outbox unless configured.

## Testing and data

See [the test guide](TESTING.md) for isolated background browser tests. Keep
`.runtime/`, backups, credentials and generated test reports out of commits.
Never point a test harness at an existing player's database.
