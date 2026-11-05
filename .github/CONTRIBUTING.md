# Contributing to Hostile Inference

Human-written and LLM-assisted pull requests are welcome. A human GitHub account
owns each contribution and remains responsible for reviewing and testing it.
No particular assistant, paid API, editor, or agent service is required.

## Start here

1. Fork the repository, clone your fork, and create a topic branch from `main`.
2. Use Node 24 or 26 on Linux or macOS. Run `npm ci`, `npm run check`, and `npm test`.
3. Read [the architecture](../docs/ARCHITECTURE.md), [test guide](../docs/TESTING.md),
   and [agent instructions](../AGENTS.md). See [the roadmap](../docs/ROADMAP.md) for work.
4. Keep one concrete change per PR. Open a design issue first for major mechanics,
   ranking rules, data migrations, dependencies, or a visual direction change.
5. Include the problem, observable change, exact checks run, and known limits.
   For UI changes include before/after evidence without private player data.

The public repository contains code, procedural geometry and tests. External
generated art is excluded pending redistribution clearance. `npm test` works
without it. See [asset setup](../docs/ASSETS.md) before attempting the 3D demo.
Do not replace missing art with lower-quality assets and claim visual parity.

## LLM-assisted work

Provide the assistant the issue, relevant files, `AGENTS.md`, and acceptance
criteria. Keep the change scoped. Review the complete diff yourself. Describe
material AI assistance and what you personally verified in the PR; do not paste
private prompts or chat histories. A generated test report is not evidence that
a command ran. Never claim visual review, FPS, or human playtesting from a unit test.

## Compatibility and quality

- Keep simulation deterministic and browser/server replay semantics identical.
- Do not edit `rules-version.js` just to make a failing rules check pass. A rule
  change needs a documented rules/season transition and historical-result policy.
- Preserve verified-only scores and the approved faction contribution formula.
- Use isolated temporary data for tests, never an existing player's database.
- Graphics quality must stay intact. Report complete frame pacing, including
  hitches; 60 FPS remains a target, not an established guarantee.
- Browser automation stays headless by default and uses bundled Chromium or
  Chrome for Testing. Never launch the normal macOS Google Chrome app.
- Avoid unrelated formatting churn in the existing compact source.
- Never commit secrets, database files, backups, personal paths, captures,
  provider receipts, generated art without rights evidence, or `node_modules`.

By submitting a contribution, you confirm that you have the right to submit it
under the repository's MIT license. Retain existing third-party notices.
Security issues belong in [private vulnerability reporting](SECURITY.md).
Maintainer review is required; passing CI does not automatically merge a PR.
