import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { expect, it } from 'vitest'
import { convertEditableProjectToV2, selectCompositionGeometry } from '@ledmap/core'
import { createRef001TestProject } from './project-fixtures.js'
import { addMediaOutputV2, addOutputMappingV2 } from '../src/renderer/v2-output-commands.js'
import { buildResolumeXml } from '../src/shared/media-output-adapters.js'
import { parseResolumeAdvancedOutput } from '../src/shared/resolume-import.js'
import { buildResolumeNativePreset } from '../src/shared/resolume-export.js'
import { planResolumeProjectExport } from '../src/shared/resolume-project.js'

it('measures fixture-scale Resolume preparation and parsing', () => {
  let project = addMediaOutputV2(convertEditableProjectToV2(createRef001TestProject().source), 800, 600, 'Benchmark')
  project = addOutputMappingV2(project, project.design.screens[0]!.id, project.content.mediaOutputs[0]!.id, { x: 0, y: 0 })
  const bounds = selectCompositionGeometry(project).bounds!
  const frame = { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height }
  const preset = readFileSync(new URL('./fixtures/resolume/arena-preset.xml', import.meta.url), 'utf8')
  const reference = () => buildResolumeXml(project)
  const native = () => buildResolumeNativePreset(planResolumeProjectExport(project, frame).document!)
  const parser = () => parseResolumeAdvancedOutput(preset)
  const timed = (operation: () => unknown) => {
    const start = performance.now()
    operation()
    return performance.now() - start
  }
  for (let i = 0; i < 10; i += 1) { reference(); native(); parser() }
  const before: number[] = []
  const after: number[] = []
  const parsing: number[] = []
  for (let i = 0; i < 100; i += 1) {
    if (i % 2 === 0) { before.push(timed(reference)); after.push(timed(native)) }
    else { after.push(timed(native)); before.push(timed(reference)) }
    parsing.push(timed(parser))
  }
  const stats = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b)
    return { p50: Number(sorted[49]!.toFixed(3)), p95: Number(sorted[94]!.toFixed(3)) }
  }
  const doc = parser()
  expect(doc.screens[0]!.slices).toHaveLength(3)
  expect(parseResolumeAdvancedOutput(native()).screens[0]!.slices).toHaveLength(1)
  console.log(JSON.stringify({ node: process.version, reference: stats(before), native: stats(after), parsing: stats(parsing),
    referenceBytes: Buffer.byteLength(reference()), nativeBytes: Buffer.byteLength(native()), fixtureBytes: Buffer.byteLength(preset) }))
})
