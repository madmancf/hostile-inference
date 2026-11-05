# Contribution roadmap

This source release opens development. It does not launch a hosted game or
claim production readiness. Current work is a solo RTS with three factions,
tutorials, verified operations, local accounts and asynchronous leaderboards.

## Good starting work

- Improve contributor docs and add reproducible troubleshooting notes.
- Expand deterministic strategy coverage across all six faction matchups,
  including early pressure, economy investment and defensive counters.
- Add keyboard/focus and native-zoom regression coverage for account and game UI.
- Improve error messages for interrupted commands or full admission queues.
- Profile full-quality animation and frame pacing with reproducible workloads.

## Before a hosted player launch

- Clear external art redistribution rights or produce a fully licensed pack.
- Broaden current balance/scoring-abuse tests without changing the approved
  contribution formula or rewriting historical verified results.
- Automate verified backup rotation, readiness, disk/queue monitoring and
  recovery drills. No unattended jobs are installed by this repository.
- Conduct independent newcomer playtests for each faction.
- Certify 60 FPS on representative hardware at full graphics. Background browser
  tests and past local averages do not establish this.
- Configure and test real email, owned domain, hosting/TLS, proxy trust,
  off-host backups, support and player-facing policies.

The v0.20 local server evidence covered 30 minutes, eight admitted command
streams and 10,000 synthetic historical matches. It included active-play and
verification-worker crashes, restored acknowledged commands and rankings, and
completed 24 real replay-verified victories. This historical local measurement
is not a hosted capacity guarantee. The reproducible harness is
`npm run test:capacity-soak`; it is not part of routine PR CI.

Larger maps/campaigns, more factions and live PvP need separate designs. Start
with an issue and explicit acceptance criteria instead of a broad rewrite.
