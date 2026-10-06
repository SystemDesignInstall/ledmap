import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { expect, it } from 'vitest'
import { convertEditableProjectToV2 } from '@ledmap/core'
import { createRef001TestProject } from './project-fixtures.js'
import { parseResolumeAdvancedOutput } from '../src/shared/resolume-import.js'
import { applyResolumeOutputImport } from '../src/shared/resolume-project.js'
import { ResolumeImportSession } from '../src/shared/resolume-import-session.js'

it('measures existing adapter application versus preview and checked application', () => {
  const project = convertEditableProjectToV2(createRef001TestProject().source)
  const xml = readFileSync(new URL('./fixtures/resolume/ledmap-native-golden.xml', import.meta.url), 'utf8')
  const source = parseResolumeAdvancedOutput(xml)
  const settings = { frame: { x: -40, y: -20, width: 1200, height: 1000 }, rasterOverrides: {},
    bindings: source.screens[0]!.slices.map((slice, index) => ({ sourceSliceId: slice.id, screenId: String(project.design.screens[index]!.id) })) }
  const session = new ResolumeImportSession()
  session.inspect(xml)
  const stamp = { documentId: 'benchmark', revision: 0 }
  const before = () => applyResolumeOutputImport(project, source, settings.frame, settings.bindings)
  const after = () => { session.prepare(project, stamp, settings); return session.apply(project, stamp) }
  const timed = (operation: () => unknown) => { const start = performance.now(); operation(); return performance.now() - start }
  for (let i = 0; i < 10; i += 1) { before(); after() }
  const previous: number[] = []
  const current: number[] = []
  for (let i = 0; i < 100; i += 1) {
    if (i % 2 === 0) { previous.push(timed(before)); current.push(timed(after)) }
    else { current.push(timed(after)); previous.push(timed(before)) }
  }
  const stats = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b)
    return { p50: Number(sorted[49]!.toFixed(3)), p95: Number(sorted[94]!.toFixed(3)) }
  }
  expect(after()).toEqual(before())
  console.log(JSON.stringify({ node: process.version, adapterApply: stats(previous), previewAndApply: stats(current),
    sourceBytes: Buffer.byteLength(xml), screens: source.screens.length, slices: source.screens[0]!.slices.length }))
})
