# Project documentation

Start with the guide that matches what you are trying to do. Setup addresses
refer to the reader's own computer; this project has no hosted playable demo.

| Goal | Guide |
| --- | --- |
| Understand what is actually released and verified | [Release status and audit](STATUS.md) |
| Play the full game locally or run the contributor workspace | [Local development](LOCAL_DEVELOPMENT.md) |
| Understand the included art, provenance and reuse license | [Assets and rights](ASSETS.md) |
| Follow simulation, server and result ownership | [Architecture](ARCHITECTURE.md) |
| Run checks and understand their limits | [Testing](TESTING.md) |
| Find focused contribution opportunities | [Roadmap](ROADMAP.md) |
| Back up, restore or update an installation | [Operations](operations-0.20.md) |
| Configure verification and recovery email | [Resend setup](email-setup-0.19.md) |
| Review third-party licensing | [Notices](THIRD_PARTY_NOTICES.md) |

For implementation details, read the component guides:
[game](../game/README.md), [API](../api/README.md),
[test selection](../tests/README.md), [development commands](../scripts/README.md)
and [runtime packaging](../release/README.md).

## Keep evidence separate from plans

When updating a guide, identify the version or commit and the commands actually
run. State whether evidence came from an art-free clone, a full-art local
installation, or a hosted environment. A proposal, a passing test and a human
playtest are different evidence. Do not turn the 60 FPS target into a guarantee
or describe historical capacity measurements as a current hosting limit.

Keep private logs, account fixtures and provider receipts outside Git. Publish
only concise findings with safe reproduction steps. Update the relevant guide
when behavior changes; avoid copying the same operational instructions into
several files that can drift apart.
