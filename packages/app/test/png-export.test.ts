import { describe, expect, it } from 'vitest'
import { buildPngExportPlan } from '../src/shared/png-export.js'
import { buildTestScene } from '../src/renderer/test-project.js'
import { createTestProject } from './project-fixtures.js'

describe('PNG TestFrame export planning', () => {
  it('keeps geometry-only PNG available without Mapping or Hardware', () => {
    const scene = buildTestScene(createTestProject())
    const plan = buildPngExportPlan(scene, {
      pattern: 'checkerboard',
      currentScope: { kind: 'composition', target: null },
      walkPixel: null,
      mode: 'composition',
      screenId: null,
    })
    expect(plan.ready).toBe(true)
    expect(plan.jobs).toHaveLength(1)
    expect(plan.jobs[0]?.bounds).toEqual(scene.bounds)
    expect(plan.jobs[0]?.frame.pattern).toBe('checkerboard')
  })

  it('blocks only Hardware-dependent patterns when Hardware is incomplete', () => {
    const scene = buildTestScene(createTestProject())
    const plan = buildPngExportPlan(scene, {
      pattern: 'receiver-labels',
      currentScope: { kind: 'composition', target: null },
      walkPixel: null,
      mode: 'composition',
      screenId: null,
    })
    expect(plan.ready).toBe(false)
    expect(plan.diagnostics.join(' ')).toMatch(/Hardware|assign|topology/i)
  })

  it('creates deterministic actual-pixel jobs for selected and per-Screen exports', () => {
    const scene = buildTestScene(createTestProject())
    const selected = buildPngExportPlan(scene, {
      pattern: 'borders',
      currentScope: { kind: 'screen', target: 'screen-2' },
      walkPixel: null,
      mode: 'screen',
      screenId: 'screen-2',
    })
    expect(selected.jobs[0]).toMatchObject({ name: 'test-borders-Screen-2-screen-2.png', bounds: scene.screens[1]?.bounds })
    const batch = buildPngExportPlan(scene, {
      pattern: 'borders',
      currentScope: { kind: 'composition', target: null },
      walkPixel: null,
      mode: 'batch-screens',
      screenId: null,
    })
    expect(batch.ready).toBe(true)
    expect(batch.jobs.map(job => job.bounds)).toEqual(scene.screens.map(screen => screen.bounds))
  })
})
