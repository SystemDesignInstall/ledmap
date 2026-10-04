import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  asCabinetGridId,
  asCabinetId,
  asInputCanvasId,
  asHardwareAssignmentId,
  asMediaOutputCanvasId,
  asMappingRegionId,
  asModuleId,
  asOutputMappingId,
  asPortId,
  asProcessorId,
  asReceiverId,
  asScreenId,
  asSignalRouteId,
  createEmptyProjectV2,
  createProjectV2,
  type LedMapProjectV2,
  type MediaOutputCanvasId,
  type OutputMappingId,
  type ProjectScreen,
} from '../../src/index.js'

function expectDetachedAndFrozen(source: unknown, result: unknown): void {
  if (source === null || typeof source !== 'object') return
  expect(result).not.toBe(source)
  expect(Object.isFrozen(result)).toBe(true)
  for (const key of Object.keys(source)) {
    expectDetachedAndFrozen(
      (source as Record<string, unknown>)[key],
      (result as Record<string, unknown>)[key],
    )
  }
}

function withScreens(screens: readonly ProjectScreen[]): LedMapProjectV2 {
  const empty = createEmptyProjectV2()
  return {
    ...empty,
    design: {
      ...empty.design,
      screens,
      composition: {
        placements: screens.map((screen, index) => ({
          screenId: screen.id,
          x: index === 0 ? -120 : 700,
          y: index === 0 ? -80 : 120,
          locked: false,
        })),
      },
    },
  }
}

describe('project model v2 foundation', () => {
  it('creates the normalized empty project', () => {
    expect(createEmptyProjectV2()).toEqual({
      metadata: {},
      design: {
        screens: [],
        cabinetGrids: [],
        cabinets: [],
        modules: [],
        composition: { placements: [] },
      },
      content: {
        inputCanvases: [],
        mappingRegions: [],
        mediaOutputs: [],
        outputMappings: [],
      },
      hardware: {
        processors: [],
        ports: [],
        receivers: [],
        assignments: [],
        processorOrder: [],
        receiverOrder: [],
      },
      operations: {
        signalRoutes: [],
        backupRoutes: [],
        liveOutputTargets: [],
      },
      remap: { rules: [] },
    })
  })

  it('allows multiple screens and negative composition coordinates', () => {
    const input = withScreens([
      { id: asScreenId('screen-1'), name: 'Screen 1', resolution: { width: 512, height: 384 }, cabinetGridOrder: [], mappingRegionOrder: [] },
      { id: asScreenId('screen-2'), name: 'Screen 2', resolution: { width: 384, height: 256 }, cabinetGridOrder: [], mappingRegionOrder: [] },
    ])
    const project = createProjectV2(input)
    expect(project.design.screens).toHaveLength(2)
    expect(project.design.composition.placements[0]).toMatchObject({ x: -120, y: -80 })
  })

  it('rejects more than one composition placement for the same screen', () => {
    const input = withScreens([
      { id: asScreenId('screen-1'), name: 'Screen 1', resolution: { width: 512, height: 384 }, cabinetGridOrder: [], mappingRegionOrder: [] },
    ])
    expect(() => createProjectV2({
      ...input,
      design: {
        ...input.design,
        composition: {
          placements: [
            ...input.design.composition.placements,
            { screenId: asScreenId('screen-1'), x: 10, y: 20, locked: false },
          ],
        },
      },
    })).toThrowError(/PROJECT_DUPLICATE_COMPOSITION_PLACEMENT/)
  })

  it('keeps new identifiers opaque and separated by type', () => {
    const canvasId = asMediaOutputCanvasId('screen-1/cabinet/C01')
    const mappingId = asOutputMappingId('mapping-1')
    expect(canvasId).toBe('screen-1/cabinet/C01')
    expect(mappingId).toBe('mapping-1')
    expectTypeOf(canvasId).toEqualTypeOf<MediaOutputCanvasId>()
    expectTypeOf(mappingId).toEqualTypeOf<OutputMappingId>()
    expectTypeOf(canvasId).not.toEqualTypeOf<OutputMappingId>()
  })

  it('contains no derived pixel-sized or signal-order state', () => {
    const project = createEmptyProjectV2()
    expect(project).not.toHaveProperty('pixelMap')
    expect(project.design).not.toHaveProperty('path')
    expect(project.design.cabinets).toEqual([])
    expect(project.remap).toEqual({ rules: [] })
  })

  it('accepts empty future sections as runtime values', () => {
    const project = createEmptyProjectV2()
    expect(project.design).not.toHaveProperty('stage')
    expect(project.content.mediaOutputs).toEqual([])
    expect(project.content.outputMappings).toEqual([])
    expect(project.operations).toEqual({
      signalRoutes: [],
      backupRoutes: [],
      liveOutputTargets: [],
    })
  })

  it('deeply freezes the project without mutating or retaining caller-owned data', () => {
    const empty = createEmptyProjectV2()
    const screenId = asScreenId('screen-1')
    const gridId = asCabinetGridId('grid-1')
    const cabinetId = asCabinetId('cabinet-1')
    const inputCanvasId = asInputCanvasId('input-1')
    const processorId = asProcessorId('processor-1')
    const portId = asPortId('port-1')
    const receiverId = asReceiverId('receiver-1')
    const screen = {
      id: screenId,
      name: 'Screen 1',
      resolution: { width: 512, height: 384 },
      cabinetGridOrder: [gridId],
      mappingRegionOrder: [asMappingRegionId('region-1')],
    }
    const ordering = { numbering: 'row', startCorner: 'top-left', direction: 'left-to-right', snake: true } as const
    const maskPoint = { x: 0, y: 0 }
    const stagePositionMm = { x: 0, y: 0, z: 0 }
    const routeCabinetIds = [cabinetId]
    const orderedReceiverIds = [receiverId]
    const input: LedMapProjectV2 = {
      metadata: { name: 'Demo' },
      design: {
        screens: [screen],
        cabinetGrids: [{
          id: gridId, screenId, name: 'Grid', columns: 4, rows: 3,
          cabinetWidth: 128, cabinetHeight: 128, ordering,
        }],
        cabinets: [{
          id: cabinetId, gridId, label: 'C01', column: 0, row: 0,
          origin: { x: 0, y: 0 }, width: 128, height: 128,
          pixelWidth: 128, pixelHeight: 128, moduleColumns: 4, moduleRows: 4,
          rotation: 0, flipH: false, flipV: false,
        }],
        modules: [{
          id: asModuleId('module-1'), cabinetId, column: 0, row: 0,
          width: 32, height: 32, pixelWidth: 32, pixelHeight: 32,
        }],
        composition: { placements: [{ screenId, x: -120, y: -80, locked: false }] },
        stage: { placements: [{ screenId, positionMm: stagePositionMm }] },
      },
      content: {
        inputCanvases: [{ id: inputCanvasId, resolution: { width: 1920, height: 1080 } }],
        mappingRegions: [{
          id: asMappingRegionId('region-1'), inputCanvasId, screenId, gridId,
          position: { x: 100, y: 50 }, size: { width: 512, height: 384 },
        }],
        mediaOutputs: [{
          id: asMediaOutputCanvasId('output-1'), name: 'Output', resolution: { width: 1920, height: 1080 },
          mappingOrder: [asOutputMappingId('output-mapping-1')],
        }],
        outputMappings: [{
          id: asOutputMappingId('output-mapping-1'), name: 'output-mapping-1', enabled: true, screenId,
          mediaOutputId: asMediaOutputCanvasId('output-1'),
          screenRect: { x: 0, y: 0, width: 512, height: 384 },
          outputRect: { x: 0, y: 0, width: 512, height: 384 },
          inputRotation: 0, outputRotation: 0, flipX: false, flipY: false,
          mask: { enabled: true, points: [maskPoint, { x: 512, y: 0 }, { x: 0, y: 384 }] },
        }],
      },
      hardware: {
        processors: [{ id: processorId, name: 'Processor', portCount: 1 }],
        ports: [{ id: portId, processorId, index: 0, receiverCapacity: 1 }],
        receivers: [{ id: receiverId, processorId, portId, legacyIndex: 0 }],
        assignments: [{
          id: asHardwareAssignmentId('assignment-1'), target: { kind: 'cabinet', cabinetId },
          receiverId, locked: true, origin: 'manual',
        }],
        processorOrder: [processorId],
        receiverOrder: [{ portId, receiverIds: orderedReceiverIds }],
      },
      operations: {
        ...empty.operations,
        signalRoutes: [{ id: asSignalRouteId('route-1'), receiverId, orderedCabinetIds: routeCabinetIds }],
      },
      remap: { rules: [{ id: 'rule-1', version: '1', type: 'identity' }] },
    }
    const project = createProjectV2(input)

    expectDetachedAndFrozen(input, project)
    expect(Object.isFrozen(screen)).toBe(false)
    expect(Object.isFrozen(maskPoint)).toBe(false)
    expect(Object.isFrozen(stagePositionMm)).toBe(false)
    expect(Object.isFrozen(routeCabinetIds)).toBe(false)

    screen.name = 'Changed'
    screen.resolution.width = 1
    maskPoint.x = 99
    stagePositionMm.x = 99
    routeCabinetIds.length = 0
    orderedReceiverIds.length = 0

    expect(project.design.screens).toEqual([
      { id: 'screen-1', name: 'Screen 1', resolution: { width: 512, height: 384 }, cabinetGridOrder: [gridId], mappingRegionOrder: [asMappingRegionId('region-1')] },
    ])
    expect(project.content.outputMappings[0]?.mask?.points[0]?.x).toBe(0)
    expect(project.design.stage?.placements[0]?.positionMm.x).toBe(0)
    expect(project.hardware.assignments[0]?.target.cabinetId).toBe(cabinetId)
    expect(project.operations.signalRoutes[0]?.orderedCabinetIds).toEqual([cabinetId])
    expect(project.hardware.receiverOrder[0]?.receiverIds).toEqual([receiverId])
  })
})
