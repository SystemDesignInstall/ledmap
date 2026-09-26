# Spatial mapping architecture

## Domain boundary

The data path for the implemented Phase 0–3 slice is:

```text
InputCanvas pixel
  -> MappingRegion inputRect
  -> inputRotation
  -> canonical CabinetGrid pixel space
  -> flipX / flipY
  -> Cabinet / Module
  -> Receiver / Processor / Port
  -> PixelAddress
```

The display projection is derived independently:

```text
canonical CabinetGrid pixel
  -> screenRotation
  -> MappingRegion screenRect
  -> absolute Screen pixel
```

`Screen` remains the logical/physical LED screen. It is not a media-server output surface. `MappingRegion` is a logical Input-to-Screen relationship and is not a Cabinet.

## MappingRegion

```ts
interface MappingRegion {
  readonly id: MappingRegionId
  readonly inputCanvas: InputCanvasId
  readonly screen: ScreenId
  readonly grid: CabinetGridId
  readonly inputRect: PixelRect
  readonly screenRect: PixelRect
  readonly transform: MappingTransform
}
```

`inputRect` uses absolute InputCanvas coordinates. `screenRect` uses absolute Screen coordinates. Polygon mask points are input-local pixel-edge coordinates. Inclusion is tested at pixel centers, with boundary points treated as included.

There is no scaling in this phase. After `inputRotation`, `inputRect` dimensions must equal the complete referenced Grid pixel dimensions. After `screenRotation`, Grid dimensions must equal `screenRect` dimensions. The Screen itself may be larger than the destination rectangle, and its membership lists may contain other regions and grids.

## Independent transforms

The transform order is fixed:

```text
input-local
  -> inputRotation
  -> flipX / flipY in canonical Grid space
  -> physical Grid coordinate
  -> screenRotation
  -> screen-local
```

`inputRotation` and `screenRotation` are independent quarter turns (`0 | 90 | 180 | 270`). Flips are self-inverse and operate only in canonical Grid space. Snake and numbering never participate in spatial coordinate conversion.

## Forward and reverse APIs

`mapInputPixel()` validates InputCanvas ownership and input bounds/mask, derives the physical Grid and Cabinet coordinates, and delegates address construction to `addressPixel()`.

`unmapHardwarePixel()` delegates hardware lookup to `locatePixel()`, reconstructs the physical Grid coordinate, then applies the exact inverse spatial transform. A hardware pixel excluded by an enabled mask is not owned by that MappingRegion and cannot be reverse-mapped through it.

For every valid, mask-owned input pixel `P`:

```text
unmapHardwarePixel(mapInputPixel(P).address key).inputCoordinate == P
```

Resolved mappings remain compact: they contain Grid cells and Hardware spans, not one object per pixel.
