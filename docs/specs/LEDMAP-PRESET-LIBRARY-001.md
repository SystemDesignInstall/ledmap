# LedMAP preset library

Status: implemented in the Composition preview on 2026-10-08.

## Concepts

- **Saved LED** records one named cabinet's module columns, module rows, module pixel width, and module pixel height. Cabinet pixel resolution is derived. Screen grid columns and rows, position, name, hardware assignments, and Mapping are not part of this preset.
- **Drawing preset** records one named Screen drawing style: pattern, colors, Cabinet lines and their color, labels, text, graphic guides, information block, and logo. Applying it never changes geometry.
- A project keeps an applied copy of both sets of values. Later edits or deletion of library entries do not modify existing Screens.

## Persistence

The application stores a versioned `library.json` below Electron `userData/preset-library/v1`, with separate `cabinets` and `drawings` arrays. Drawing logos are stored as SHA-256-named PNG files in `assets`. Reads validate the library and asset checksum. Writes use a staged atomic replacement, a revision check, and the app's main-process IPC boundary.

On first load, valid legacy `ledmap.screenPresets.v1` entries from localStorage are split into one Saved LED and one Drawing preset each. Original localStorage data remains untouched. Legacy grid columns and rows survive as informational migration metadata on the Saved LED; they are never applied as cabinet geometry.

## Entry points

- **Add Screen** offers independent Saved LED and Drawing preset selectors. Grid columns and rows remain separate inputs, and the canvas previews the combined result.
- A selected Screen's inspector offers Save new, Apply, Update, Rename, and two-step Delete for both categories. Saved LED is directly after Cabinet Grid; Drawing preset follows the drawing controls.
- Applying Saved LED to an existing Screen uses one cabinet-configuration transaction and displays the resulting resolution before Apply. Applying Drawing preset uses one chart-settings transaction.

## Verification

The preset-library tests cover legacy migration, validation, persistence, logo assets, and revision conflicts. Electron smoke covers independent selection, save, load, apply, update, rename, and delete alongside the Composition and Export gates.
