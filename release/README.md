# Immutable runtime packages

[manifest.mjs](manifest.mjs) declares the pages, scripts, styles, factions and
server modules that may enter a package. The builder follows static JavaScript
imports and explicitly names dynamic art. It does not copy the repository.
[server.mjs](server.mjs) serves only manifest-listed public files.

## Build and inspect locally

From the source root, with an authorized complete art pack:

```sh
npm run check:assets
npm run build
npm run test:release
```

The build writes `dist/hostile-inference-VERSION-ID/` and updates
`dist/current.json`; the next `npm run start:release` uses that pointer. It does
not restart an existing service or move player data. Use a disposable checkout
when testing package generation without changing your normal release pointer.

| Package content | Purpose |
| --- | --- |
| `manifest.json` | Rules identity, public routes, source/asset hashes and storage schema |
| `public/` and `pages/` | Versioned assets and canonical HTML entry routes |
| `api/`, private rule trees and `server.mjs` | Server execution; never public static files |
| `RUN.md`, `OPERATIONS.md`, `EMAIL-SETUP.md` | Package-specific setup and recovery instructions |
| `LICENSE`, `THIRD_PARTY_NOTICES.txt` | Code license and dependency/asset scope |

## Runtime settings

Use Node 24 or 26. `HI_DATA_DIR` must be an absolute private directory outside
the immutable release. `HI_PUBLIC_ORIGIN` is the exact public HTTPS origin.
`HOST` defaults to loopback and `PORT` to 4180. A local rehearsal requires
`HI_LOCAL_REHEARSAL=1` and its matching loopback HTTP origin. Production refuses
plain HTTP configuration and requires verified email for ranked admission.

Read the generated `RUN.md` before starting a package. Never expose the package
directory through a generic static server. Credentials, accounts, journals and
backups belong outside the package; source-preview environment variables are
not a substitute for the runtime settings above.

## Updating safely

Drain admission, wait for accepted work, verify a fresh backup, and run the
running release's `update-check` against the candidate before switching processes. Keep the previous
compatible package. Cross-schema rollback requires a pre-migration restore,
not an older binary pointed at migrated storage. Follow the complete
[operations guide](../docs/operations-0.20.md), including explicit resume.

A successful local package test is not permission to distribute the external
art or deploy a service. [Release status](../docs/STATUS.md) lists the remaining
rights, email, hosting, playtesting and performance gates.
