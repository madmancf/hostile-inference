# Third-party software and asset scope

Original project source and documentation are licensed under [MIT](../LICENSE).
This does not override third-party licenses or grant rights in excluded assets,
provider brands or trademarks.

| Component | License and retained notice | Use |
| --- | --- | --- |
| Three.js 0.186.1 | [MIT](../game/vendor/three/LICENSE) | Vendored runtime renderer and addons, with local import paths |
| meshoptimizer | [MIT](../game/vendor/meshoptimizer-LICENSE.md) | Vendored decoder and development asset tooling |

The lockfile records additional npm development dependencies and their licenses.
Their notices remain in the installed packages. Generated production packages
include Three.js and meshoptimizer notices. Playwright is development-only and
is not shipped to players.

The fictional factions are satire. This is an independent project with no
affiliation with or endorsement from any real AI laboratory. No commercial game
art from Command & Conquer, Red Alert or KKND is included.

External generated models, textures, concept images and portraits are excluded
from this source release. See [asset provenance and clearance](ASSETS.md).
