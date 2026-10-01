import { convertEditableProjectToV2 } from '@ledmap/core'
import { describe, expect, it } from 'vitest'
import { buildTestScene, buildTestWalkSpace, resolveTestWalkPixel, testScopeTargets, walkOrdinalForDataIndex } from '../src/renderer/test-project.js'
import { buildV2TestScene, buildV2TestWalkSpace, resolveV2TestWalkPixel, v2TestScopeTargets, v2WalkOrdinalForDataIndex } from '../src/renderer/v2-test-project.js'
import { createTestProject } from './project-fixtures.js'
import { compactReadyProject } from './v2-parity-fixtures.js'

describe('direct V2 Test reads', () => {
  it.each([createTestProject(), compactReadyProject()])('matches the legacy Test scene without a compatibility projection', legacy => {
    const project = convertEditableProjectToV2(legacy.source)
    const oldScene = buildTestScene(legacy)
    const scene = buildV2TestScene(project)
    expect(scene).toEqual(oldScene)
    for (const kind of ['composition', 'screen', 'cabinet', 'module', 'receiver', 'port'] as const) {
      expect(v2TestScopeTargets(scene, kind)).toEqual(testScopeTargets(oldScene, kind))
    }
  })

  it('matches Address Walk for every ordinal and preserves port-local dataIndex', () => {
    const legacy = compactReadyProject()
    const project = convertEditableProjectToV2(legacy.source)
    const oldScene = buildTestScene(legacy)
    const scene = buildV2TestScene(project)
    for (const scope of [
      { kind: 'composition' as const, target: null },
      { kind: 'receiver' as const, target: scene.cabinets[0]!.hardware!.receiver },
      { kind: 'port' as const, target: scene.cabinets[0]!.hardware!.port },
    ]) {
      const old = buildTestWalkSpace(legacy, oldScene, scope)
      const direct = buildV2TestWalkSpace(project, scene, scope)
      expect(direct).toEqual(old)
      for (let ordinal = 0; ordinal < direct.total; ordinal += 1) {
        const expected = resolveTestWalkPixel(legacy, old, ordinal)
        const actual = resolveV2TestWalkPixel(project, direct, ordinal)
        expect(actual).toEqual(expected)
        expect(v2WalkOrdinalForDataIndex(direct, actual!.dataIndex)).toBe(walkOrdinalForDataIndex(old, actual!.dataIndex))
      }
    }
  })
})
