# Slice domain boundary

Phase 0–3 introduces contracts only. Slice generation is not implemented yet.

`OutputSurface` is a media/output target and is deliberately separate from the LedMAP `Screen` entity. `GeneratedSlice` is output geometry with source/target rectangles, transforms, optional mask, and provenance back to Screen, MappingRegion, Processor/Port, Receivers, and Cabinets.

The future pipeline is:

```text
FinalRemap -> Slice Engine -> SlicePlan -> external format adapter
```

The following identities are invalid and must not be introduced:

```text
LedMAP Screen == OutputSurface
Cabinet == GeneratedSlice
MappingRegion == GeneratedSlice
```

`SlicePlan` is derived and must be recomputed rather than persisted as the primary mapping source. The planned first grouping policy is per Processor Port with compact run/rectangle decomposition.
