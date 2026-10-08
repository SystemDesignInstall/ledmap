# Legacy work snapshots from 2026-10-06

These gzip-compressed patches preserve unpublished work while LedMAP continues on the canonical `master` branch. They are historical source snapshots, not part of the application build or a claim that their prototype calculations are ready for production.

| File | Source | Base | SHA-256 |
| --- | --- | --- | --- |
| `composition-calculation-staged.patch.gz` | The 90 staged files in `feat/composition-calculation` on 2026-10-08 | `21946babfe404036d28041d59121b2ac2ff6c6dd` | `304bdbb7ab52be3df1c43b01119c9ff4bf13c7cfc8ef81aae0485f7730ff0c0b` |
| `composition-chart-stage1.patch.gz` | Commit `d926c86d89df544d11db18b6e1c2b14dc283e0a3` | `23e80248738b321c53eafc7702fcd8b59bdd2480` | `c061d277f77df2117ddf1359451f1ce3205bc1568f48e74d797262cce00136d6` |

The staged snapshot predates merged PRs #15–21. Twenty-five of its files match the current `master` version exactly; other files overlap newer Composition, hardware, capacity, and Resolume work. Its data-planning and wiring prototypes do not calculate from all actual project assignments, as documented in `docs/reviews/LEDMAP-UPSTREAM-INVENTORY-2026-10-06.md` inside the patch. Applying the patch directly to current `master` would roll back merged features. The chart stage 1 patch is an earlier working snapshot of the Composition chart work.

To inspect either snapshot, decompress the patch, create an isolated checkout at its listed base commit, and apply it there. Reuse individual ideas only after reviewing them against the current project model and stage approval rules.
