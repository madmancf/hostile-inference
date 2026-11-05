# Hostile Inference

A browser strategy game about fictional AI laboratories competing for compute,
energy, cooling and control. Command escaped models, researchers, containment
systems and infiltrating agents in short operations against faction AI.

**Open-source code · MIT · Contributions from humans and coding agents welcome.**
This is a development release, not a hosted public game. The external generated
art pack is excluded pending redistribution clearance. A fresh clone runs the
simulation, server and account tests; the complete 3D game requires that pack.
See [assets](docs/ASSETS.md). No graphics have been downgraded to make this release.

## Three laboratories

| Faction | Identity | Approach |
| --- | --- | --- |
| Misanthropic | Containment, resilient research and protected models | Hold a formation, absorb pressure, advance together |
| Closed AI | Connected infrastructure and coordinated models | Build the network, mark targets, concentrate attacks |
| Broke Labs | Overclocking, swarms and cooling | Strike in bursts, manage heat, recover quickly |

Each faction has distinct procedural units and facilities, abilities, research
choices and enemy tactics. First Light teaches the systems; Blackout Protocol
is a solo operation with a 15-minute limit. Server-verified runs feed player and
faction standings. This is asynchronous faction competition, not live PvP.

## Get started

Requires Node 24 or 26, npm and Git on Linux or macOS (Windows: use WSL2).

```sh
git clone https://github.com/madmancf/hostile-inference.git
cd hostile-inference
npm ci
npm run check
npm test
```

No AI subscription, model API key or game account is needed to contribute.
The tests include all three factions, legal replay victories, accounts,
leaderboards, durable verification, recovery and historical journal memory.

To work on accounts or the server without the art pack:

```sh
npm run dev:server
```

Open <http://127.0.0.1:4178/account/index.html> or
<http://127.0.0.1:4178/leaderboards/index.html>. The server binds to loopback.
To run the full game after providing authorized assets:

```sh
npm run check:assets
npm start
```

Open <http://127.0.0.1:4178/>. Learn to play or practice without an account;
sign up and choose a faction for verified operations. Local email uses a private
outbox; no external mail provider is required. Keep `.runtime/` private.

## Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md), then pick a task from
[the roadmap](docs/ROADMAP.md) or propose an [issue](https://github.com/madmancf/hostile-inference/issues).
Fork, make a focused branch, run the relevant checks, and submit a PR.
[AGENTS.md](AGENTS.md) gives coding assistants the architecture, constraints and
test commands. AI-assisted contributions receive the same review as other code.

- [Architecture](docs/ARCHITECTURE.md)
- [Tests and background browser setup](docs/TESTING.md)
- [Art scope and rights](docs/ASSETS.md)
- [Operator backup/recovery guide](docs/operations-0.20.md)
- [Email configuration](docs/email-setup-0.19.md)
- [Security reporting](SECURITY.md)

## Current limits

Full graphics and a 60 FPS target are retained; **60 FPS is not yet certified**.
Automated victories establish solvability and replay integrity, not competitive
fairness or human enjoyment. The server's historical local soak covered eight
concurrent streams for 30 minutes; hosted capacity still needs validation.
Real mail/domain setup, hosting, independent player testing and asset clearance
remain launch work. Nothing in this repository deploys a service automatically.

The full-quality runtime can be packaged with `npm run build` once authorized
assets are present. The immutable output goes under ignored `dist/`; do not
publish that bundle until its external asset rights are cleared.

## License

Original source and documentation: [MIT](LICENSE). Vendored dependencies retain
their [own notices](THIRD_PARTY_NOTICES.md). Excluded art is not covered by MIT.
The factions are fictional satire; the project is unaffiliated with real AI labs.
