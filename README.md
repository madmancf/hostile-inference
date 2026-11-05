<div align="center">

# HOSTILE INFERENCE

**Three laboratories. One compute war.**

A browser RTS about runaway models, corporate rivalry and keeping the servers alive.

[Contribute](.github/CONTRIBUTING.md) · [Agent guide](AGENTS.md) · [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md)

[![CI](https://github.com/madmancf/hostile-inference/actions/workflows/ci.yml/badge.svg)](https://github.com/madmancf/hostile-inference/actions/workflows/ci.yml)

</div>

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

## Start contributing

Human and LLM-assisted pull requests are welcome. No paid AI service is required.
Use **Node 24 or 26** on Linux or macOS; use WSL2 on Windows.

```sh
git clone https://github.com/madmancf/hostile-inference.git
cd hostile-inference
npm ci
npm test
```

Pick a focused task from the [roadmap](docs/ROADMAP.md), read the
[contribution guide](.github/CONTRIBUTING.md), and open a PR. Coding assistants
should start with [AGENTS.md](AGENTS.md). All contributions receive maintainer review.

**Source release:** the public clone runs simulation, server and account tests.
The external generated art pack is not included while redistribution rights are
being cleared, so the complete 3D game needs that pack. See [asset setup](docs/ASSETS.md).
There is no hosted playable demo yet.

For development setup, read [Running on your own computer](docs/LOCAL_DEVELOPMENT.md).


## Find your way around

| Directory | What's inside |
| --- | --- |
| `game/` | Browser interface, simulation, renderer and faction systems |
| `api/` | Accounts, command recording, verification and leaderboards |
| `tests/` | Gameplay, persistence, security and background browser checks |
| `release/` | Production server and runtime manifest |
| `scripts/` | Development, validation, packaging and operator commands |
| `docs/` | Architecture, setup, assets and operating guides |
| `.github/` | Contribution policies, issue/PR templates and CI |

## Development status

Three factions, their tutorials, operations, local accounts and verified standings
are implemented. Automated tests cover replay integrity and recovery. Wider
balance testing, independent newcomer playtests, art clearance and hosted setup
remain on the [roadmap](docs/ROADMAP.md).

Full graphics are retained. **60 FPS remains a target awaiting certification.**
The local server soak covered eight concurrent streams for 30 minutes; that is
not a hosted capacity guarantee. No automatic deployment is configured.

[Testing](docs/TESTING.md) · [Operations](docs/operations-0.20.md) · [Email setup](docs/email-setup-0.19.md) · [Report a vulnerability](.github/SECURITY.md)

Original source and documentation are [MIT licensed](LICENSE).
[Third-party notices](docs/THIRD_PARTY_NOTICES.md) retain dependency licenses;
the excluded art pack is not covered by MIT.
