import type { PixelRect, Size } from '@ledmap/core'

export interface ResolumePoint { readonly x: number; readonly y: number }
export type ResolumeQuad = readonly [ResolumePoint, ResolumePoint, ResolumePoint, ResolumePoint]
export interface ResolumeDiagnostic {
  readonly code: string
  readonly path: string
  readonly message: string
  readonly blocking: boolean
}
export interface ResolumeWarp {
  readonly columns: number
  readonly rows: number
  readonly points: readonly ResolumePoint[]
  readonly mode: string
  readonly flip: number
  readonly source: ResolumeQuad | null
  readonly destination: ResolumeQuad | null
}
export interface ResolumeNativeSlice {
  readonly id: string
  readonly name: string
  readonly enabled: boolean
  readonly inputOrientation: number
  readonly outputOrientation: number
  readonly inputSource: string
  readonly flip: number
  readonly input: ResolumeQuad
  readonly output: ResolumeQuad
  readonly warp: ResolumeWarp | null
}
export interface ResolumeNativeScreen {
  readonly id: string
  readonly name: string
  readonly enabled: boolean
  readonly raster: Size | null
  readonly deviceKind: string | null
  readonly slices: readonly ResolumeNativeSlice[]
}
export interface ResolumeVersion {
  readonly name: string
  readonly major: number
  readonly minor: number
  readonly micro: number
  readonly revision: number
}
export interface ResolumeNativeDocument {
  readonly name: string
  readonly composition: Size | null
  readonly version: ResolumeVersion | null
  readonly screens: readonly ResolumeNativeScreen[]
  readonly diagnostics: readonly ResolumeDiagnostic[]
}
export const RESOLUME_SAMPLE_VERSION: ResolumeVersion = Object.freeze({
  name: 'Resolume Arena', major: 7, minor: 27, micro: 0, revision: 14395,
})
export const RESOLUME_COMPATIBILITY = 'Arena 7.27.0 sample schema · export loading in Arena has not been verified.'

export function freezeResolume<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeResolume(child)
    Object.freeze(value)
  }
  return value
}

export function rectQuad(rect: PixelRect): ResolumeQuad {
  return [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height }]
}

export function integerRect(quad: ResolumeQuad): PixelRect | null {
  const [tl, tr, br, bl] = quad
  if (!quad.every(point => Number.isSafeInteger(point.x) && Number.isSafeInteger(point.y)) ||
      tl.y !== tr.y || tr.x !== br.x || br.y !== bl.y || bl.x !== tl.x || tr.x <= tl.x || bl.y <= tl.y) return null
  return { x: tl.x, y: tl.y, width: tr.x - tl.x, height: bl.y - tl.y }
}

export function resolumeWarpChanges(warp: ResolumeWarp, output: ResolumeQuad) {
  const same = (left: ResolumePoint, right: ResolumePoint) =>
    Math.abs(left.x - right.x) <= 0.000001 && Math.abs(left.y - right.y) <= 0.000001
  const lattice = warp.points.some((point, index) => {
    const u = (index % warp.columns) / (warp.columns - 1)
    const v = Math.floor(index / warp.columns) / (warp.rows - 1)
    return !same(point, {
      x: (1 - v) * ((1 - u) * output[0].x + u * output[1].x) + v * ((1 - u) * output[3].x + u * output[2].x),
      y: (1 - v) * ((1 - u) * output[0].y + u * output[1].y) + v * ((1 - u) * output[3].y + u * output[2].y),
    })
  })
  const homography = warp.source !== null && warp.destination !== null &&
    warp.source.some((point, index) => !same(point, warp.destination![index]!))
  return { lattice, homography }
}
