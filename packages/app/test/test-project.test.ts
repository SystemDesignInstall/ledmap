import { describe, expect, it } from 'vitest'
import {
  addPort,
  addProcessor,
  addReceiver,
  applyHardwareAllocation,
  assignCabinets,
  hardwareCabinetOrder,
  previewHardwareAllocation,
} from '../src/renderer/hardware-project.js'
import { addMappingRegion, setInputCanvasResolution } from '../src/renderer/mapping-project.js'
import {
  buildTestScene,
  buildTestWalkSpace,
  resolveTestWalkPixel,
  testScopeTargets,
  walkOrdinalForDataIndex,
} from '../src/renderer/test-project.js'
import { createRef001TestProject, createTestProject } from './project-fixtures.js'

function readyProject() {
  let project = createRef001TestProject()
  project = setInputCanvasResolution(project, 1920, 1080)
  project = addMappingRegion(project, 'screen-1', { x: 40, y: 20 })
  project = addMappingRegion(project, 'screen-2', { x: 700, y: 100 })
  project = addMappingRegion(project, 'screen-3', { x: 300, y: 620 })
  project = addProcessor(project)
  for (let port = 0; port < 4; port += 1) {
    project = addPort(project, 'processor-1')
    project = addReceiver(project, `port-${port + 1}`)
    project = addReceiver(project, `port-${port + 1}`)
  }
  const order = hardwareCabinetOrder(project)
  project = assignCabinets(project, 'receiver-1', order.slice(0, 2))
  project = assignCabinets(project, 'receiver-2', order.slice(12, 14))
  return applyHardwareAllocation(project, previewHardwareAllocation(project))
}

describe('Test scene and Address Walk projection', () => {
  it('projects composition, module and Hardware identities without mutating source', () => {
    const project = readyProject()
    const source = project.source
    const scene = buildTestScene(project)
    expect(project.source).toBe(source)
    expect(scene.hardwareReady).toBe(true)
    expect(scene.mappingReady).toBe(true)
    expect(scene.screens).toHaveLength(3)
    expect(scene.cabinets).toHaveLength(26)
    expect(scene.modules.length).toBeGreaterThan(scene.cabinets.length)
    expect(testScopeTargets(scene, 'receiver')).toHaveLength(7)
    expect(testScopeTargets(scene, 'port')).toHaveLength(4)
  })

  it('walks the real shared-Port boundary without rebasing dataIndex', () => {
    const project = readyProject()
    const scene = buildTestScene(project)
    const space = buildTestWalkSpace(project, scene, { kind: 'port', target: 'port-1' })
    const beforeOrdinal = walkOrdinalForDataIndex(space, 65535)
    const afterOrdinal = walkOrdinalForDataIndex(space, 65536)
    expect(beforeOrdinal).not.toBeNull()
    expect(afterOrdinal).toBe((beforeOrdinal ?? 0) + 1)
    const before = resolveTestWalkPixel(project, space, beforeOrdinal!)
    const after = resolveTestWalkPixel(project, space, afterOrdinal!)
    expect(before).toMatchObject({ port: 'port-1', receiver: 'receiver-1', dataIndex: 65535, screen: 'screen-1' })
    expect(after).toMatchObject({ port: 'port-1', receiver: 'receiver-2', dataIndex: 65536, screen: 'screen-2' })
    expect(after?.input).not.toEqual(before?.input)
  })

  it('keeps Basic scene projection usable when Mapping and Hardware are incomplete', () => {
    const scene = buildTestScene(createTestProject())
    expect(scene.screens).toHaveLength(3)
    expect(scene.hardwareReady).toBe(false)
    expect(scene.mappingReady).toBe(false)
    expect(scene.hardwareReason).toBeTruthy()
    expect(buildTestWalkSpace(createTestProject(), scene, { kind: 'composition', target: null }).total).toBe(0)
  })
})
