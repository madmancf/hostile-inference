# Historical First Light saves

`historical-saves.json` contains 84 synthetic serialized records captured before
First Light v3 changed the runtime. Each raw string has a SHA-256 checksum.
The records include all 17 v2 lesson positions and all 10 supported unversioned
positions for each faction, plus three paid construction cases. They contain no
player accounts or private saves. The unversioned metadata was reconstructed
from the supported legacy schema, using the original game state serializer.

`sourceCommit` identifies the original source revision. `tutorial-v2.mjs` and
`local-archive-v2.mjs` preserve that revision's implementations, with only
relative import paths adjusted to this fixture directory. They let tests run the
old reader/writer against the new isolated save slot. Do not update them to make
new migration tests pass. These source fixtures retain the repository MIT license.

Run `node tests/tutorial.mjs` from the repository root. It checks fixture hashes,
paid state, repeated migration, the old/new/old/new storage sequence, and all 108
legal faction/rival/opening/support/final technology paths through actual actions.
Generated current-state browser fixtures live under ignored `output/playwright/`.
