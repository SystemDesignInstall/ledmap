import { createMediaOutputPixelResolver, inspectMediaOutputMapping, type LedMapProjectV2 } from '@ledmap/core'

export interface OutputMappingPreviewRaster {
  readonly status: 'ready' | 'blocked'
  readonly width: number
  readonly height: number
  readonly exact: boolean
  readonly pixels: Uint8ClampedArray | null
}

export function syntheticScreenPixel(screenId: string, x: number, y: number): readonly [number, number, number, number] {
  let hash = 2166136261
  for (let i = 0; i < screenId.length; i += 1) hash = Math.imul(hash ^ screenId.charCodeAt(i), 16777619)
  return [64 + (hash & 127), 64 + ((x * 17 + (hash >>> 8)) & 127),
    64 + ((y * 29 + (hash >>> 16)) & 127), 255]
}

export function outputMappingPreviewRaster(
  project: LedMapProjectV2, mediaOutputId: string, maxWidth = 512, maxHeight = 512,
): OutputMappingPreviewRaster {
  const inspection = inspectMediaOutputMapping(project, mediaOutputId)
  const scale = Math.min(1, maxWidth / inspection.resolution.width, maxHeight / inspection.resolution.height)
  const width = Math.max(1, Math.floor(inspection.resolution.width * scale))
  const height = Math.max(1, Math.floor(inspection.resolution.height * scale))
  const exact = width === inspection.resolution.width && height === inspection.resolution.height
  if (inspection.diagnostics.some(value => value.severity === 'error')) {
    return { status: 'blocked', width, height, exact, pixels: null }
  }
  const pixels = new Uint8ClampedArray(width * height * 4)
  const resolve = createMediaOutputPixelResolver(project, mediaOutputId)
  for (let y = 0; y < height; y += 1) {
    const mediaY = Math.floor((y + 0.5) * inspection.resolution.height / height)
    for (let x = 0; x < width; x += 1) {
      const mediaX = Math.floor((x + 0.5) * inspection.resolution.width / width)
      const mapped = resolve(mediaX, mediaY)
      const offset = (y * width + x) * 4
      const color = mapped.status === 'resolved'
        ? syntheticScreenPixel(mapped.screenId, mapped.screenX, mapped.screenY)
        : [12, 20, 30, 255]
      pixels.set(color, offset)
    }
  }
  return { status: 'ready', width, height, exact, pixels }
}
