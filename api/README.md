# Accounts, match verification and standings

This directory is server-only. Browser clients submit commands; they do not
submit authoritative scores. Do not import these modules into the web renderer.

## Find the right module

| Change | Start here | Preserve |
| --- | --- | --- |
| Sign-up, sessions, recovery, deletion | [accounts.mjs](accounts.mjs), [account-safety.mjs](account-safety.mjs) | Private ownership, password checks and session revocation |
| Match admission and command recording | [ranked-service.mjs](ranked-service.mjs) | Server clock, ordered batches and idempotent acknowledgements |
| Replay execution and rules identity | [replay-worker.mjs](replay-worker.mjs), [ranked-rules.mjs](ranked-rules.mjs) | Identical browser/server rules and bounded workers |
| Player rank and faction contribution | [leaderboards.mjs](leaderboards.mjs) | Only committed, eligible verified results count |
| Email jobs | [mail-delivery.mjs](mail-delivery.mjs) | Durable intent, bounded retries and exact idempotency keys |
| Backup, restore and updates | [operations.mjs](operations.mjs), [storage-lock.mjs](storage-lock.mjs) | One storage owner, drained updates and verified snapshots |
| Origin/proxy checks | [http-policy.mjs](http-policy.mjs), [client-source.mjs](client-source.mjs) | Explicit origins and trusted immediate proxies only |

Public route families are `/api/account/`, `/api/ranked/` and
`/api/leaderboards`. Operator commands use a private Unix socket. The entry
servers are [game/server.mjs](../game/server.mjs) for development and
[release/server.mjs](../release/server.mjs) for immutable packages.

## Follow a result

Ticket → activation → durable command batches → verification job → replay →
atomic result commit → standings. A server fault keeps the accepted journal
recoverable. It must not become a player rejection or award a second result.

A player's contribution averages their best score against each rival. The
faction counts its top 20 contributions, dividing by 20 with empty slots zero.
Repeated runs replace a best result; they do not accumulate extra contributions.

## Validate a change

Run commands from the repository root:

```sh
npm run test:accounts
npm run test:ranked
npm run test:leaderboards
```

Storage or job changes also need `npm run test:verification-jobs`,
`npm run test:operations` and `npm run test:history`. Mail changes need
`npm run test:email`; these use fixtures, not real recipients. Use disposable
data only. See [the test map](../tests/README.md) and
[operator procedures](../docs/operations-0.20.md) before touching persistence.
