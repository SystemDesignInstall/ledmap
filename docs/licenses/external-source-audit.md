# External source audit — LedMAP

Checked: 2026-10-06. LedMAP baseline: `d27cad89ef615b70022dc1a4ace30f3e4813c561` (Composition PR [#15](https://github.com/SystemDesignInstall/ledmap/pull/15)). Scope: canonical tracked code at that baseline and the dependency/license stage. The uncommitted source worktree at `C:\Code\LedMap` is outside the integration scope.

## Pinned sources inspected

A reference commit identifies the source inspected. It does not establish that an existing LedMAP file was copied from that source.

| Repository | Source at pinned commit | File blob SHA | LedMAP path reviewed | Disposition and evidence |
|---|---|---|---|---|
| UnMapper | [geom.rs](https://github.com/stoatworks-labs/UnMapper/blob/459e3319399a8570619af738e271d71a07c593c3/crates/unmapper-core/src/geom.rs) | `dc3ad8c61b7fc30fef1d152d4bc9a59dedb0d476` | `packages/core/src/project-model/composition.ts`, `packages/core/src/model/coordinates.ts` | Geometry reference. LedMAP uses integer Cabinet Grid placements and domain diagnostics; upstream uses floating-point Rect/Quad and warp primitives. No substantial translated implementation was identified in this comparison. |
| UnMapper | [show.rs](https://github.com/stoatworks-labs/UnMapper/blob/459e3319399a8570619af738e271d71a07c593c3/crates/unmapper-core/src/show.rs) | `1585f11ff984a23cc2a238cdf82355f3410a386c` | `packages/app/src/renderer/screen-authoring.ts` | Layout idea reference. Both leave a 64-pixel gap; LedMAP computes the next position from existing Cabinet Grid extents. A shared numeric default does not establish a code port. |
| pixel-peeker | [snapping.ts](https://github.com/stoatworks-labs/pixel-peeker/blob/367373c2a6ce32fb61cf18b8e07bc92b9d8fc15d/src/domain/snapping.ts) | `acb9bb222a32549cc7119c34ebffac87a5f99f4b` | `packages/app/src/renderer/layout-interaction.ts` | Geometry reference. LedMAP resolves integer translation, grid snapping and explicit project guides; upstream resolves millimetre Rect positions with different candidate ordering and guide extents. No substantial copied block was identified in this comparison. |
| pixel-peeker | [resolume.ts](https://github.com/stoatworks-labs/pixel-peeker/blob/367373c2a6ce32fb61cf18b8e07bc92b9d8fc15d/src/export/resolume.ts) | `3e63f9fe78c468d4e4617ed8e68d582d0a8590d0` | `packages/app/src/shared/media-output-adapters.ts` | Format research reference. The ordinary XML escape replacement sequence matches; this alone does not establish provenance. LedMAP writes its own `LedMapResolume` slice reference, not upstream's Arena structure. Native compatibility remains unverified. |
| UnMapper and pixel-peeker | [UnMapper LICENSE](https://github.com/stoatworks-labs/UnMapper/blob/459e3319399a8570619af738e271d71a07c593c3/LICENSE), [pixel-peeker LICENSE](https://github.com/stoatworks-labs/pixel-peeker/blob/367373c2a6ce32fb61cf18b8e07bc92b9d8fc15d/LICENSE) | Both `2854af553a2f331bbb806636494ff4a5921db848` | `docs/licenses/stoatworks-labs-MIT.txt` | TAKE license text verbatim. Both sources contain the same MIT notice, copyright 2026 Stoatworks Labs. The complete notice is retained for these references. |
| B.L.I.N.K | [LICENSE](https://github.com/glab-dev/B.L.I.N.K/blob/a0b060e7aebb4631d334d924ed9659f571930ae8/LICENSE) | `a9d40d6bbd34ec1d267009aecc953d517e6ebf78` | License gate only | Proprietary. DO NOT TAKE source, assets, datasets or UI expression. This stage inspected license terms and introduced none of those materials. |
| B.L.I.N.K | [LICENSE-COMMERCIAL.txt](https://github.com/glab-dev/B.L.I.N.K/blob/a0b060e7aebb4631d334d924ed9659f571930ae8/LICENSE-COMMERCIAL.txt) | `9bca599e1a26f4dfdd598752f84f2b5d9c582363` | License gate only | Commercial use depends on fees and a separate agreement. No applicable signed agreement was supplied for this stage; copying remains excluded. |

## Evidence and limits

The tracked baseline was searched for repository names, author names and explicit port/adaptation markers, and Git history was searched for the three upstream names. The relevant LedMAP geometry, authoring, snapping and slice-export paths were read and compared with the pinned MIT sources above. The search found an internal P0A adaptation reference in `LEDMAP-PROJECT-MODEL-V2-C1.md`; that refers to a LedMAP commit, not an upstream repository.

This stage changes dependency metadata and documentation only. It adds no application/core source, third-party algorithm, fixture, hardware database or product asset. The only copied upstream text is the MIT notice recorded above.

These checks are a scoped engineering review, not proof of the original authorship of every historical line. No blanket clean-room claim is made for the existing repository or the uncommitted WIP. The original draft audit's planned ADAPT/TAKE rows do not become completed imports merely by appearing in a table.

The candidate `core/coordinates`, `capacity`, `wiring`, `diagnostics`, `resolume`, `power`, catalog and planning modules remain outside canonical `master`. Before integration, their actual origins and any adapted test fixtures must be reviewed and recorded with source and destination paths. Reference snapshots above must not be substituted for missing adaptation evidence.

## Gate for later imports

For each code or fixture adaptation, record the repository, full commit SHA, file/blob SHA, source path, destination path, transfer method, modifications and relevant tests. Retain the applicable complete license and copyright notices. Record whether a source was used as an idea, translated implementation, copied code or copied fixture.

B.L.I.N.K requirements may inform independently written specifications. Its implementation, comments, UI text, assets, fonts and datasets stay excluded unless the applicable written permission is recorded. This stage does not inspect its implementation.

Hardware data must cite primary manufacturer documents with model/revision, document date, checked date and derivation details. Unknown values stay unknown. NDI and vendor formats require their own runtime/SDK and interoperability contracts.

LedMAP has no root project LICENSE at the audited baseline. The upstream notices describe their sources; they do not choose a distribution license for LedMAP.
