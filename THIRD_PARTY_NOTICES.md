# Third-party notices — LedMAP

The pinned source register and scope of the review are in [External source audit](docs/licenses/external-source-audit.md). It records the historical dependency/license review and the P0-3 native Resolume adapter/fixture transfers.

## UnMapper and pixel-peeker

Engineering references:

- [stoatworks-labs/UnMapper](https://github.com/stoatworks-labs/UnMapper/tree/459e3319399a8570619af738e271d71a07c593c3), commit `459e3319399a8570619af738e271d71a07c593c3`.
- [stoatworks-labs/pixel-peeker](https://github.com/stoatworks-labs/pixel-peeker/tree/367373c2a6ce32fb61cf18b8e07bc92b9d8fc15d), commit `367373c2a6ce32fb61cf18b8e07bc92b9d8fc15d`.

Both license files contain the MIT License and Copyright (c) 2026 Stoatworks Labs. Their identical complete notice is retained in [stoatworks-labs-MIT.txt](docs/licenses/stoatworks-labs-MIT.txt). P0-3 adapts native schema/identity-Warper handling and transfers the actual Arena, generated pixel-peeker and synthetic warp fixtures listed in [fixture provenance](packages/app/test/fixtures/resolume/README.md). No live Arena compatibility is claimed.

## XML parser

App dependency `@xmldom/xmldom` is pinned to 0.9.12; it has no runtime dependencies. Source release: [xmldom/xmldom](https://github.com/xmldom/xmldom/tree/0af8cf829d8a92bbac612903422c6947f5458f06), commit `0af8cf829d8a92bbac612903422c6947f5458f06`. Complete [MIT notice](docs/licenses/xmldom-MIT.txt) retains the Christopher J. Brody/contributor and @jindw/contributor copyright statements. The license gate verifies this notice against source blob `b95f5698c645e44ecf09ee09a0a44ee6437e23a1`.

## B.L.I.N.K

[glab-dev/B.L.I.N.K](https://github.com/glab-dev/B.L.I.N.K/tree/a0b060e7aebb4631d334d924ed9659f571930ae8), commit `a0b060e7aebb4631d334d924ed9659f571930ae8`, has proprietary [LICENSE](https://github.com/glab-dev/B.L.I.N.K/blob/a0b060e7aebb4631d334d924ed9659f571930ae8/LICENSE) and separate [commercial terms](https://github.com/glab-dev/B.L.I.N.K/blob/a0b060e7aebb4631d334d924ed9659f571930ae8/LICENSE-COMMERCIAL.txt).

This stage uses those terms for the license gate and adds no B.L.I.N.K source, assets, datasets or UI text. Independently specified product requirements remain possible; a code or asset transfer requires applicable written permission.

## Package dependencies

Dependency licenses remain associated with their installed packages and the lockfile. This register covers the three engineering reference repositories; it is not an exhaustive notice bundle for Electron, npm packages or optional future SDKs.
