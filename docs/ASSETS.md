# Assets and public source scope

The public repository includes the full renderer and authored procedural unit,
building and terrain code. It does **not** include external generated art files.
Consequently, a fresh public clone can run simulation/server tests and account
pages, but cannot render the complete 3D game until those files are supplied.

The development game uses original generated headquarters from Magnific/Tripo,
rigged characters and animation from Magnific/Meshy, and generated concept and
portrait imagery. Retained generation receipts establish provenance, not a
standalone redistribution or open-source license. Those rights have not been
cleared for this publication. The MIT license does not apply to excluded files.
Commercial-use permission alone must not be treated as an asset sublicensing
decision. No download URL, API key or paid generation step is provided here.

## Existing authorized asset pack

If you already have permission to use the original files, copy them to the paths
listed in [runtime-assets.json](runtime-assets.json), relative to the repository.
The manifest contains only paths, byte counts and SHA-256 fingerprints. It is
not a download link or a license grant. Never commit these files without a
reviewed redistribution license and updated attribution records.

```sh
npm run check:assets
npm start
```

The check validates the exact full-quality runtime bytes. It fails explicitly
on missing or changed files. There is no silent low-quality substitute. A local
installation that already has the art keeps the same graphics and animations.
`npm run build` also requires this check to pass.

## Contributing original replacement assets

Propose replacements in an issue before generating a large pack. Include your
authorship/provider, applicable license, source references, animation/rig details
and redistribution evidence. Use a rights-cleared asset pack, compatible model
names/rigs, reviewed new cache hashes, and full-quality visual checks for all
three factions. Do not attach account receipts, expiring provider URLs or keys.
The preferred end state is an independently redistributable complete art pack.

The original development assets and masters remain outside Git; they have not
been deleted, modified or downsampled by the open-source preparation.
