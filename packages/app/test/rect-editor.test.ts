import { describe, expect, it } from 'vitest'
import {
  containsPoint, fitCamera, hitResizeHandle, resizeRect, snapMove, snapResize, worldFromScreen, zoomAt,
} from '../src/renderer/rect-editor.js'

describe('rect editor camera and hit testing', () => {
  it('fits, zooms at cursor and converts coordinates', () => {
    const camera = fitCamera(248, 248, 200, 100)
    expect(camera.scale).toBeCloseTo(1, 5)
    const world = worldFromScreen(camera, { x: camera.x + 50 * camera.scale, y: camera.y + 25 * camera.scale })
    expect(world).toMatchObject({ x: 50, y: 25 })
    const zoomed = zoomAt(camera, { x: 100, y: 100 }, 2)
    expect(zoomed.scale).toBeCloseTo(camera.scale * 2, 6)
  })

  it('hits eight handles within 6px and misses farther', () => {
    const camera = { x: 0, y: 0, scale: 1 }
    const rect = { x: 10, y: 10, width: 20, height: 20 }
    expect(hitResizeHandle(rect, { x: 10, y: 10 }, camera)).toBe('nw')
    expect(hitResizeHandle(rect, { x: 30, y: 30 }, camera)).toBe('se')
    expect(hitResizeHandle(rect, { x: 100, y: 100 }, camera)).toBeNull()
    expect(containsPoint(rect, { x: 15, y: 15 })).toBe(true)
    expect(containsPoint(rect, { x: 30, y: 30 })).toBe(false)
  })

  it('resizes with aspect lock on corners', () => {
    const rect = { x: 0, y: 0, width: 8, height: 4 }
    const grown = resizeRect(rect, 'se', 4, 0, { aspectLock: true })
    expect(grown.width / grown.height).toBeCloseTo(2, 5)
    const moved = resizeRect(rect, 'w', 2, 0)
    expect(moved).toMatchObject({ x: 2, width: 6 })
  })

  it('snaps movement to bounds and sibling edges within 6 screen px', () => {
    const camera = { x: 0, y: 0, scale: 1 }
    const bounds = { x: 0, y: 0, width: 100, height: 100 }
    const rect = { x: 20, y: 20, width: 10, height: 10 }
    const sibling = { x: 50, y: 20, width: 10, height: 10 }
    expect(snapMove(rect, 18, 0, [sibling], bounds, camera)).toMatchObject({ x: 40 })
    expect(snapMove(rect, -19, 0, [], bounds, camera)).toMatchObject({ x: 0 })
    expect(snapResize(rect, 'e', 19, 0, [sibling], bounds, camera)).toMatchObject({ width: 30 })
  })
})
