import { convertEditableProjectToV2 } from '@ledmap/core'
import { renderPngJob } from '../src/renderer/export-image.js'
import { buildPngExportPlan } from '../src/shared/png-export.js'
import type { TestPatternId } from '../src/shared/test-engine.js'
import { buildTestScene, buildTestWalkSpace, resolveTestWalkPixel } from '../src/renderer/test-project.js'
import { buildV2TestScene, buildV2TestWalkSpace, resolveV2TestWalkPixel } from '../src/renderer/v2-test-project.js'
import { compactReadyProject } from './v2-parity-fixtures.js'

function equalBytes(left: Uint8Array | Uint8ClampedArray, right: Uint8Array | Uint8ClampedArray): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

async function decodedPixels(bytes: Uint8Array): Promise<{ width: number; height: number; pixels: Uint8ClampedArray }> {
  const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('PNG parity Canvas context unavailable')
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, image.width, image.height).data
  image.close()
  return { width: canvas.width, height: canvas.height, pixels }
}

export async function runV2PngParity(): Promise<readonly { pattern: TestPatternId; width: number; height: number; pixels: number }[]> {
  const old = compactReadyProject()
  const next = convertEditableProjectToV2(old.source)
  const oldScene = buildTestScene(old)
  const nextScene = buildV2TestScene(next)
  const scope = { kind: 'composition' as const, target: null }
  const oldSpace = buildTestWalkSpace(old, oldScene, scope)
  const nextSpace = buildV2TestWalkSpace(next, nextScene, scope)
  if (oldSpace.total !== 8 || nextSpace.total !== oldSpace.total) throw new Error('Unexpected Address Walk coverage')
  const patterns: readonly TestPatternId[] = [
    'checkerboard', 'horizontal-gradient', 'cabinet-order', 'receiver-labels', 'signal-flow', 'address-walk',
  ]
  const results: { pattern: TestPatternId; width: number; height: number; pixels: number }[] = []
  for (const pattern of patterns) {
    const walkPixel = pattern === 'address-walk' ? resolveTestWalkPixel(old, oldSpace, 7) : null
    const nextWalkPixel = pattern === 'address-walk' ? resolveV2TestWalkPixel(next, nextSpace, 7) : null
    const config = {
      pattern,
      currentScope: scope,
      mode: 'composition' as const,
      screenId: null,
    }
    const oldPlan = buildPngExportPlan(oldScene, { ...config, walkPixel })
    const nextPlan = buildPngExportPlan(nextScene, { ...config, walkPixel: nextWalkPixel })
    if (!oldPlan.ready || !nextPlan.ready || oldPlan.jobs.length !== 1 || nextPlan.jobs.length !== 1) {
      throw new Error(`${pattern} PNG plan is not ready`)
    }
    const oldBytes = await renderPngJob(oldPlan.jobs[0]!)
    const nextBytes = await renderPngJob(nextPlan.jobs[0]!)
    const repeatBytes = await renderPngJob(nextPlan.jobs[0]!)
    if (!equalBytes(oldBytes, nextBytes) || !equalBytes(nextBytes, repeatBytes)) {
      throw new Error(`${pattern} PNG encoded bytes differ`)
    }
    const oldImage = await decodedPixels(oldBytes)
    const nextImage = await decodedPixels(nextBytes)
    if (oldImage.width !== oldPlan.jobs[0]!.bounds.width || oldImage.height !== oldPlan.jobs[0]!.bounds.height ||
        oldImage.width !== nextImage.width || oldImage.height !== nextImage.height ||
        !equalBytes(oldImage.pixels, nextImage.pixels)) {
      throw new Error(`${pattern} PNG dimensions or pixels differ`)
    }
    results.push({ pattern, width: nextImage.width, height: nextImage.height, pixels: nextImage.pixels.length / 4 })
  }
  return results
}
