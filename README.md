<div align="center">

# HOSTILE INFERENCE

**Three laboratories. One compute war.**

A browser RTS about runaway models, corporate rivalry and keeping the servers alive.

[Contribute](.github/CONTRIBUTING.md) · [Agent guide](AGENTS.md) · [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md)

[![CI](https://github.com/madmancf/hostile-inference/actions/workflows/ci.yml/badge.svg)](https://github.com/madmancf/hostile-inference/actions/workflows/ci.yml)

</div>

**Play locally or contribute.** This repository includes the game and all 39
full-quality runtime art files. No paid AI account or separate asset download is
required. There is no hosted player service yet. Code is MIT; the art has a
[separate redistribution license](docs/ASSET_LICENSE.md).

## Choose your laboratory

| Misanthropic | Closed AI | Broke Labs |
| --- | --- | --- |
| **Contain. Protect. Endure.** | **Connect. Coordinate. Control.** | **Overclock. Swarm. Recover.** |
| Resilient research, protected models and patient advances. | Linked infrastructure, marked targets and concentrated attacks. | Fast pressure, burst damage and a constant fight against heat. |

Build a campus, keep energy and cooling flowing, develop your faction's technology,
then send a team into a rival server-continent. Researchers, escaped models,
containment units and infiltrators each have a role.

- **Learn:** First Light teaches your faction's economy, buildings and counters.
- **Fight:** Blackout Protocol is a solo operation against faction AI, capped at 15 minutes.
- **Compete:** Server-verified results contribute to player and faction standings.

The factions are fictional satire. This is an independent project, unaffiliated
with real AI laboratories. Competition is asynchronous; live PvP is not implemented.

## Play on your computer

Use **Node 24 or 26** on Linux or macOS; use WSL2 on Windows.

```sh
git clone https://github.com/madmancf/hostile-inference.git
cd hostile-inference
npm ci
npm start
```

Open the local address printed in your terminal. Choose a laboratory and start
**First Light** to learn its buildings, economy and counters. Training and practice
need no account. Local sign-ups retain verified results and faction contributions.
See [local setup and troubleshooting](docs/LOCAL_DEVELOPMENT.md).

## Start contributing

Human and LLM-assisted pull requests are welcome. No paid AI service is required.
After the setup above, run:

```sh
npm run doctor
npm run verify
```

Pick a focused task from the [roadmap](docs/ROADMAP.md), read the
[contribution guide](.github/CONTRIBUTING.md), and open a PR. Coding assistants
should start with [AGENTS.md](AGENTS.md). All contributions receive maintainer review.

For development setup, read [Running on your own computer](docs/LOCAL_DEVELOPMENT.md).

The doctor checks prerequisites and art presence/size without starting services.
It does not verify asset fingerprints; `npm run check:assets` does. The source verification command needs no private art or credentials.
Choose additional checks from the [test map](tests/README.md) for your change.


## Find your way around

| Directory | What's inside |
| --- | --- |
| [game](game/README.md) | Browser interface, simulation, renderer and faction systems |
| [api](api/README.md) | Accounts, command recording, verification and leaderboards |
| [tests](tests/README.md) | Choose regression coverage for the behavior you change |
| [release](release/README.md) | Immutable packages, runtime settings and safe updates |
| [scripts](scripts/README.md) | Development, validation and private operator commands |
| [docs](docs/README.md) | Setup, architecture, asset scope and release status |
| [.github](.github/CONTRIBUTING.md) | Pull-request evidence, review expectations and CI |

## Development status

Read the [release status and contributor audit](docs/STATUS.md) for verified
coverage, corrected publication issues and the remaining blockers.

Three factions, their tutorials, operations, local accounts and verified standings
are implemented. Automated tests cover replay integrity and recovery. Wider
balance testing, independent newcomer playtests and hosted setup
remain on the [roadmap](docs/ROADMAP.md).

Full graphics are retained. **60 FPS remains a target awaiting certification.**
The local server soak covered eight concurrent streams for 30 minutes; that is
not a hosted capacity guarantee. No automatic deployment is configured.

[Testing](docs/TESTING.md) · [Operations](docs/operations-0.20.md) · [Email setup](docs/email-setup-0.19.md) · [Report a vulnerability](.github/SECURITY.md)

Original source and documentation are [MIT licensed](LICENSE).
[Third-party notices](docs/THIRD_PARTY_NOTICES.md) retain dependency licenses;
the included [runtime art](docs/ASSETS.md) uses its own license.
