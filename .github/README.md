# Pull requests and project checks

Human-written and LLM-assisted contributions follow the same review path.
Start with [CONTRIBUTING.md](CONTRIBUTING.md), use a topic branch, and keep the
change small enough for a reviewer to understand without the author's chat.

## What CI establishes

| Required job | Coverage |
| --- | --- |
| Source / Node 24 | Syntax, staged public-tree checks and source regressions |
| Source / Node 26 | The same source checks on the other supported runtime |
| Background account flow | Art-free entry, navigation, faction sign-up, sessions and standings in headless Chromium |

The workflow has no private art, player data or mail credentials and does not
deploy. A green run does not certify the full game's appearance, FPS, human
enjoyment, hosted capacity or asset rights. State any additional local evidence
and its limits in the PR.

## Make review reproducible

- Give a concrete trigger and the expected result. A reviewer should be able to
  reproduce a bug without a private account or access to the maintainer's Mac.
- Name the changed component and use the [test map](../tests/README.md) to choose
  coverage. Report commands and outcomes, including checks not run.
- Use a focused commit subject such as `Keep faction selection after login`.
  Put longer rationale and test evidence in the PR body. Do not create empty
  commits or edit unrelated files to change GitHub's folder labels.
- For visual changes, include safe before/after evidence, viewport and zoom.
  Identify the asset pack and browser mode used. Avoid private player names,
  recovery links and provider receipts in captures.

External contributor workflows may wait for maintainer approval before running.
Use the [bug template](ISSUE_TEMPLATE/bug_report.yml) for a reproducible fault or
the [feature template](ISSUE_TEMPLATE/feature.yml) for a proposed design.
Vulnerabilities belong in [private reporting](SECURITY.md), not public issues.
