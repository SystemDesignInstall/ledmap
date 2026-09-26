# `.ledmap` schema v1 to v2

Schema v2 replaces the v1 MappingRegion wire fields:

```text
position + size
```

with:

```text
inputRect + screenRect + transform
```

The loader accepts both schema versions. Parsing a v1 document performs a pure migration to the current v2 document:

- `inputRect.x/y` come from `position.x/y`;
- `inputRect.width/height` come from `size.width/height`;
- `screenRect` starts at `(0, 0)` and uses the v1 size;
- both rotations are `0`;
- both flips are `false`;
- no mask is created.

Saving always emits canonical schema v2. Resolved mappings, hardware addresses, PixelMaps, and SlicePlans remain derived and are not serialized.

This migration preserves the old full-Grid mapping behavior exactly while enabling spatial destination placement and transforms in new projects.
