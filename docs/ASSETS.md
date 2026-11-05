# Runtime art, provenance and reuse

The repository includes all **39 full-quality runtime art files**, totaling
78,125,137 bytes. A normal clone includes the art; there is no separate download,
paid provider account, API key or generation step. Run `npm ci`, then `npm start`.
See [local development](LOCAL_DEVELOPMENT.md) for the address on your own computer.

Code is MIT. The art uses the separate [runtime art license](ASSET_LICENSE.md),
which permits copying, modifying and distributing the game and its art with
attribution and the stated provider conditions. Do not label the art MIT or CC0.

## What was generated

Paths below are relative to `game/`. Exact filenames, sizes and SHA-256 values
are in [runtime-assets.json](runtime-assets.json).

| Runtime files | Count | Origin and derivation |
| --- | ---: | --- |
| `servers/assets/*-server-v1.png` | 3 | Original fictional server landscapes generated with OpenAI's built-in image generation on 11 October 2026 |
| `entry/assets/*.webp` | 3 | Locally produced responsive derivatives of those PNGs |
| `servers/assets/*-hq-web-v1.glb` | 3 | Text-generated headquarters through Magnific, using Tripo H3.1 (`v3.1-20260211`); local runtime packaging |
| `servers/assets/{agent,researcher}-{walk-web,field}-v1.glb` | 4 | Original text-generated characters through Magnific/Meshy 7.1; rigging, walking animation and existing runtime derivatives |
| `servers/assets/{agent,researcher}-idle-clip-v1.glb` | 2 | Meshy idle animations extracted locally for those characters; distribute with their models |
| `servers/assets/portraits/*-v06.jpg` | 24 | Local captures of the game's live faction workshop, combining procedural geometry and the generated characters |

The 3D generation records date from 10 October 2026 at 23:59 UTC through
11 October at 00:16 UTC. Text prompts describe original fictional buildings and
characters; the recorded generation requests did not upload third-party pictures.
Portrait captures were made on 11 October. The private creation records, original
master hashes and derivative receipts have been retained by the maintainer.
Provider account IDs, signed download URLs, account receipts and personal paths
are deliberately not published.

Credits: Hostile Inference contributors; imagery generated using OpenAI;
headquarters generated using Magnific / Tripo; characters, rigs and animations
generated using Magnific / Meshy. Local renderer, cropping, packaging and runtime
optimization by Hostile Inference contributors. These credits imply no endorsement.

## Provider review — 5 November 2026

The earlier blanket exclusion reflected an unfinished review, not a provider
finding that redistribution was prohibited. This release is based on the
maintainer's paid Magnific generation, retained creation records, current paid
account check and the following official terms:

- [OpenAI Europe terms, Content](https://openai.com/policies/eu-terms-of-use/)
  assign OpenAI's rights, if any, in generated output to the user. The
  [rest-of-world terms](https://openai.com/policies/row-terms-of-use/) contain
  the same output-ownership provision. This covers the generated landscape
  originals and their local entry derivatives.
- [Magnific AI Products terms, sections 3, 6 and 7](https://www.magnific.com/legal/ai-products)
  distinguish subscriber output from stock content and free-account output.
  They assign Magnific's output rights to subscribers active at generation,
  incorporate provider terms, prohibit model-training uses and misleading
  claims of human authorship. The [API terms, section 3.2](https://www.magnific.com/legal/api-services)
  refer output ownership back to these AI terms.
- [Tripo terms, section 5.2.2](https://www.tripo3d.ai/terms) permit paid users
  to distribute and license their output. Tripo's
  [commercial-use guide](https://www.tripo3d.ai/help/privacy-policy/how-to-use-tripo-models-commercially)
  explicitly includes games and asset packs. These headquarters were generated
  through the paid Magnific integration, not downloaded from a community gallery.
- [Meshy terms, sections 2.3–2.6 and 3.1–3.2](https://www.meshy.ai/terms-of-use)
  distinguish generated output from service assets such as rigs and animations.
  The service-asset grant allows distribution as incorporated into and necessary
  to exploit the output. Accordingly, this pack licenses the motion data only
  with the generated characters, not as a standalone animation library.

This is the project's documented distribution basis, not a promise of exclusive
copyright or a legal opinion about every downstream use. Provider terms and
third-party rights remain relevant. The asset license deliberately retains the
identified restrictions instead of claiming unrestricted open-art rights.

## Integrity and future contributions

`npm run check:assets` checks every runtime file against its published fingerprint.
The public-tree check permits only these listed binaries and rejects missing,
changed or unlisted art. The release builder carries the art license and credits.
The published bytes are identical to the existing full-quality runtime; no
textures, geometry, animation or graphics settings were reduced for publication.

Original generation masters, unused design explorations and private account data
are not runtime dependencies and remain outside Git. New or replacement art needs
documented authorship/provider, input rights, applicable terms, rig compatibility,
updated cache hashes and visual review of all three factions. Do not submit
provider receipts, credentials, signed URLs or unrelated media.
