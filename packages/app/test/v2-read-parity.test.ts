import { convertEditableProjectToV2, inspectProjectV2, inspectEditableProject } from '@ledmap/core'
import { describe, expect, it } from 'vitest'
import { buildPngExportPlan } from '../src/shared/png-export.js'
import { TEST_PATTERN_DEFINITIONS } from '../src/shared/test-engine.js'
import { preflightV2GenericMapping, selectGenericMappingExportInput, serializeV2GenericMapping } from '../src/shared/v2-export-engine.js'
import { preflightGenericMapping, serializeGenericMapping } from '../src/shared/export-engine.js'
import { resizeScreenGrid, setScreenPosition, type ScreenView as LegacyScreenView } from '../src/renderer/project.js'
import { buildTestScene, buildTestWalkSpace, resolveTestWalkPixel } from '../src/renderer/test-project.js'
import { buildV2TestScene, buildV2TestWalkSpace, resolveV2TestWalkPixel } from '../src/renderer/v2-test-project.js'
import { projectV2WorkspaceReadModel } from '../src/renderer/v2-read-model.js'
import type { ScreenView as V2ScreenView } from '../src/renderer/v2-view-model.js'
import { createTestProject } from './project-fixtures.js'
import { compactReadyProject } from './v2-parity-fixtures.js'

function screenSnapshot(view: LegacyScreenView | V2ScreenView) {
  return {
    screen: { id: view.screen.id, name: view.screen.name, resolution: view.screen.resolution },
    grid: { id: view.grid.id, columns: view.grid.columns, rows: view.grid.rows,
      cabinetWidth: view.grid.cabinetWidth, cabinetHeight: view.grid.cabinetHeight, ordering: view.grid.ordering },
    config: view.config, x: view.x, y: view.y, cabinets: view.cabinets,
    nextCabinetSerial: view.nextCabinetSerial, path: view.path, modulesPerCabinet: view.modulesPerCabinet,
    totalModules: view.totalModules, pixelCount: view.pixelCount,
  }
}

describe('direct V2 renderer read model parity', () => {
  it('matches ScreenView order, geometry, logical order and allocator state without legacy projection', () => {
    const old = setScreenPosition(resizeScreenGrid(createTestProject(), 'screen-2', 5, 3), 'screen-3', -240, 90)
    const canonical = convertEditableProjectToV2(old.source)
    const projected = projectV2WorkspaceReadModel(canonical)
    expect(projected.model).toBe(canonical)
    expect(projected.screens.map(screenSnapshot)).toEqual(old.screens.map(screenSnapshot))
    expect(Object.isFrozen(projected)).toBe(true)
    expect(Object.isFrozen(projected.screens[0]?.cabinets)).toBe(true)
    expect(() => { (projected.screens as unknown[]).push({}) }).toThrow(TypeError)
    expect(projectV2WorkspaceReadModel(canonical)).toEqual(projected)
  })

  it('matches Test scene and every Address Walk pixel', () => {
    const old = compactReadyProject()
    const canonical = convertEditableProjectToV2(old.source)
    expect(inspectEditableProject(old.source)).toEqual([])
    expect(inspectProjectV2(canonical)).toEqual([])
    const oldScene = buildTestScene(old)
    const scene = buildV2TestScene(canonical)
    expect(scene).toEqual(oldScene)
    const scope = { kind: 'composition' as const, target: null }
    const oldSpace = buildTestWalkSpace(old, oldScene, scope)
    const space = buildV2TestWalkSpace(canonical, scene, scope)
    expect(space).toEqual(oldSpace)
    for (let ordinal = 0; ordinal < space.total; ordinal += 1) {
      expect(resolveV2TestWalkPixel(canonical, space, ordinal)).toEqual(resolveTestWalkPixel(old, oldSpace, ordinal))
    }
  })

  it('matches Export preflight, JSON/CSV bytes and PNG plans for every pattern', () => {
    const old = compactReadyProject()
    const canonical = convertEditableProjectToV2(old.source)
    const input = selectGenericMappingExportInput(canonical)
    const scope = { kind: 'composition' as const }
    expect(preflightV2GenericMapping(input, scope)).toEqual(preflightGenericMapping(old.source, scope))
    for (const format of ['json', 'csv'] as const) {
      expect(serializeV2GenericMapping(input, scope, format)).toBe(serializeGenericMapping(old.source, scope, format))
    }
    const oldScene = buildTestScene(old)
    const scene = buildV2TestScene(canonical)
    for (const definition of TEST_PATTERN_DEFINITIONS) {
      if (definition.id === 'address-walk') continue
      const config = { pattern: definition.id, currentScope: { kind: 'composition' as const, target: null },
        walkPixel: null, mode: 'composition' as const, screenId: null }
      expect(buildPngExportPlan(scene, config)).toEqual(buildPngExportPlan(oldScene, config))
    }
  })
})
