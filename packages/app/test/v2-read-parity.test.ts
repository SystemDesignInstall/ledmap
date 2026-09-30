import { describe, expect, it } from 'vitest'
import { convertEditableProjectToV2, inspectProjectV2, inspectEditableProject } from '@ledmap/core'
import { preflightGenericMapping, serializeGenericMapping } from '../src/shared/export-engine.js'
import { buildPngExportPlan } from '../src/shared/png-export.js'
import { TEST_PATTERN_DEFINITIONS } from '../src/shared/test-engine.js'
import { resizeScreenGrid, setScreenPosition } from '../src/renderer/project.js'
import { buildTestScene, buildTestWalkSpace, resolveTestWalkPixel } from '../src/renderer/test-project.js'
import { projectV2WorkspaceReadModel } from '../src/renderer/v2-read-model.js'
import { createTestProject } from './project-fixtures.js'
import { compactReadyProject } from './v2-parity-fixtures.js'

describe('V2 compatibility read model parity with product workspaces', () => {
  it('matches ScreenView including order, layout, grid geometry, logical order and allocator state', () => {
    const old = setScreenPosition(resizeScreenGrid(createTestProject(), 'screen-2', 5, 3), 'screen-3', -240, 90)
    const canonical = convertEditableProjectToV2(old.source)
    const projected = projectV2WorkspaceReadModel(canonical)
    expect(projected).toEqual(old)
    expect(projected).not.toBe(old)
    expect(projected.source).not.toBe(old.source)
    expect(Object.isFrozen(projected)).toBe(true)
    expect(Object.isFrozen(projected.screens[0]?.cabinets)).toBe(true)
    expect(() => { (projected.screens as unknown[]).push({}) }).toThrow(TypeError)
    expect(projectV2WorkspaceReadModel(canonical)).toEqual(projected)
  })

  it('matches Mapping/Hardware projections, Test scene and every walk address', () => {
    const old = compactReadyProject()
    const canonical = convertEditableProjectToV2(old.source)
    const projected = projectV2WorkspaceReadModel(canonical)
    expect(projected).toEqual(old)
    expect(inspectEditableProject(old.source)).toEqual([])
    expect(inspectProjectV2(canonical)).toEqual([])

    const oldScene = buildTestScene(old)
    const newScene = buildTestScene(projected)
    expect(newScene).toEqual(oldScene)
    const scope = { kind: 'composition' as const, target: null }
    const oldSpace = buildTestWalkSpace(old, oldScene, scope)
    const newSpace = buildTestWalkSpace(projected, newScene, scope)
    expect(newSpace).toEqual(oldSpace)
    expect(oldSpace.total).toBe(8)
    for (let ordinal = 0; ordinal < oldSpace.total; ordinal += 1) {
      expect(resolveTestWalkPixel(projected, newSpace, ordinal)).toEqual(resolveTestWalkPixel(old, oldSpace, ordinal))
    }
  })

  it('matches Export preflight, deterministic JSON/CSV bytes and PNG plans for every pattern', () => {
    const old = compactReadyProject()
    const projected = projectV2WorkspaceReadModel(convertEditableProjectToV2(old.source))
    const scope = { kind: 'composition' as const }
    expect(preflightGenericMapping(projected.source, scope)).toEqual(preflightGenericMapping(old.source, scope))
    expect(preflightGenericMapping(old.source, scope).ready).toBe(true)

    for (const format of ['json', 'csv'] as const) {
      const expected = serializeGenericMapping(old.source, scope, format)
      expect(serializeGenericMapping(projected.source, scope, format)).toBe(expected)
      expect(serializeGenericMapping(projected.source, scope, format)).toBe(expected)
    }

    const oldScene = buildTestScene(old)
    const newScene = buildTestScene(projected)
    for (const definition of TEST_PATTERN_DEFINITIONS) {
      if (definition.id === 'address-walk') continue
      const config = {
        pattern: definition.id,
        currentScope: { kind: 'composition' as const, target: null },
        walkPixel: null,
        mode: 'composition' as const,
        screenId: null,
      }
      const oldPlan = buildPngExportPlan(oldScene, config)
      const newPlan = buildPngExportPlan(newScene, config)
      expect(newPlan).toEqual(oldPlan)
      expect(newPlan.jobs.map(job => job.bounds)).toEqual(oldPlan.jobs.map(job => job.bounds))
      expect(newPlan.jobs.map(job => job.frame.primitives)).toEqual(oldPlan.jobs.map(job => job.frame.primitives))
    }
  })
})
