import {
  locatePixel,
  projectEditableGeometryMapping,
  projectEditableHardwareMapping,
  unmapGeometryCabinetPixel,
  type ResolvedGeometryMapping,
  type ResolvedHardwareMapping,
  type PortId,
  type ProcessorId,
} from '@ledmap/core'
import type {
  TestCabinetNode,
  TestScene,
  TestScope,
  TestScopeKind,
  TestWalkPixel,
} from '../shared/test-engine.js'
import { projectBounds, screenHeight, screenWidth, type Project } from './project.js'

export interface TestScopeTarget {
  readonly id: string
  readonly label: string
}

interface WalkSpan {
  readonly ordinalBase: number
  readonly pixelCount: number
  readonly processor: ProcessorId
  readonly port: PortId
  readonly receiver: string
  readonly cabinet: string
  readonly dataIndexBase: number
}

export interface TestWalkSpace {
  readonly total: number
  readonly spans: readonly WalkSpan[]
  readonly hardware: ResolvedHardwareMapping | null
}

function cabinetCenter(cabinet: TestCabinetNode) {
  return {
    x: cabinet.bounds.x + cabinet.bounds.width / 2,
    y: cabinet.bounds.y + cabinet.bounds.height / 2,
  }
}

function geometryMappings(project: Project): Map<string, ResolvedGeometryMapping> {
  const result = new Map<string, ResolvedGeometryMapping>()
  for (const region of project.source.mappingRegions) {
    const projection = projectEditableGeometryMapping(project.source, region.id)
    if (projection.status === 'ready') result.set(region.grid, projection.mapping)
  }
  return result
}

export function buildTestScene(project: Project): TestScene {
  const source = project.source.hardwareTopology
  const receiverByCabinet = new Map(source.receivers.flatMap(receiver => receiver.cabinets.map(cabinet => [cabinet, receiver] as const)))
  const ports = new Map(source.ports.map(port => [port.id, port]))
  const processors = new Map(source.processors.map(processor => [processor.id, processor]))
  const screens = project.screens.map(screen => ({
    id: screen.screen.id,
    name: screen.screen.name,
    bounds: { x: screen.x, y: screen.y, width: screenWidth(screen), height: screenHeight(screen) },
  }))
  const cabinets: TestCabinetNode[] = []
  for (const screen of project.screens) {
    for (const cabinet of screen.cabinets) {
      const sourceCabinet = source.cabinets.find(value => value.id === cabinet.sourceId)
      if (!sourceCabinet) continue
      const receiver = receiverByCabinet.get(sourceCabinet.id)
      const port = receiver ? ports.get(receiver.port) : undefined
      const processor = port ? processors.get(port.processor) : undefined
      cabinets.push({
        id: sourceCabinet.id,
        screen: screen.screen.id,
        logicalOrder: cabinet.index + 1,
        bounds: {
          x: screen.x + sourceCabinet.column * sourceCabinet.pixelWidth,
          y: screen.y + sourceCabinet.row * sourceCabinet.pixelHeight,
          width: sourceCabinet.pixelWidth,
          height: sourceCabinet.pixelHeight,
        },
        hardware: receiver && port && processor ? {
          receiver: receiver.id,
          port: port.id,
          processor: processor.id,
          processorName: processor.name,
        } : null,
      })
    }
  }
  const cabinetMap = new Map(cabinets.map(cabinet => [cabinet.id, cabinet]))
  const modules = source.modules.flatMap(module => {
    const cabinet = cabinetMap.get(module.cabinet)
    if (!cabinet) return []
    return [{
      id: module.id,
      cabinet: module.cabinet,
      screen: cabinet.screen,
      bounds: {
        x: cabinet.bounds.x + module.column * module.pixelWidth,
        y: cabinet.bounds.y + module.row * module.pixelHeight,
        width: module.pixelWidth,
        height: module.pixelHeight,
      },
    }]
  })
  const signalPaths = source.receivers.map(receiver => {
    const assigned = receiver.cabinets.map(cabinet => cabinetMap.get(cabinet)).filter(cabinet => cabinet !== undefined)
    return {
      receiver: receiver.id,
      port: receiver.port,
      processor: receiver.processor,
      cabinets: assigned.map(cabinet => cabinet.id),
      points: assigned.map(cabinetCenter),
    }
  })
  const hardware = projectEditableHardwareMapping(project.source)
  const hardwareReady = hardware.status === 'ready' && source.processors.length > 0 && hardware.hardware.pixelCount > 0
  const mappings = geometryMappings(project)
  const mappingReady = cabinets.length > 0 && cabinets.every(cabinet => {
    const sourceCabinet = source.cabinets.find(value => value.id === cabinet.id)
    return sourceCabinet ? mappings.has(sourceCabinet.grid) : false
  })
  const bounds = projectBounds(project)
  return Object.freeze({
    bounds: { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height },
    screens: Object.freeze(screens),
    cabinets: Object.freeze(cabinets),
    modules: Object.freeze(modules),
    signalPaths: Object.freeze(signalPaths),
    hardwareReady,
    mappingReady,
    hardwareReason: hardwareReady
      ? null
      : hardware.diagnostics[0]?.message ?? 'Complete Cabinet assignments in Hardware before using this pattern.',
    mappingReason: mappingReady ? null : 'Every Cabinet requires a complete Mapping Region for Address Walk.',
  })
}

function uniqueTargets(values: readonly TestScopeTarget[]): readonly TestScopeTarget[] {
  const seen = new Set<string>()
  return values.filter(value => {
    if (seen.has(value.id)) return false
    seen.add(value.id)
    return true
  })
}

export function testScopeTargets(scene: TestScene, kind: TestScopeKind): readonly TestScopeTarget[] {
  if (kind === 'composition') return []
  if (kind === 'screen') return scene.screens.map(screen => ({ id: screen.id, label: `${screen.name} · ${screen.id}` }))
  if (kind === 'cabinet') return scene.cabinets.map(cabinet => ({ id: cabinet.id, label: cabinet.id }))
  if (kind === 'module') return scene.modules.map(module => ({ id: module.id, label: module.id }))
  if (kind === 'receiver') return uniqueTargets(scene.cabinets.flatMap(cabinet => cabinet.hardware
    ? [{ id: cabinet.hardware.receiver, label: cabinet.hardware.receiver }]
    : []))
  return uniqueTargets(scene.cabinets.flatMap(cabinet => cabinet.hardware
    ? [{ id: cabinet.hardware.port, label: cabinet.hardware.port }]
    : []))
}

function scopeCabinets(scene: TestScene, scope: TestScope): Set<string> {
  if (scope.kind === 'composition') return new Set(scene.cabinets.map(cabinet => cabinet.id))
  if (scope.kind === 'screen') return new Set(scene.cabinets.filter(cabinet => cabinet.screen === scope.target).map(cabinet => cabinet.id))
  if (scope.kind === 'cabinet') return new Set(scope.target ? [scope.target] : [])
  if (scope.kind === 'module') {
    const module = scene.modules.find(value => value.id === scope.target)
    return new Set(module ? [module.cabinet] : [])
  }
  if (scope.kind === 'receiver') return new Set(scene.cabinets.filter(cabinet => cabinet.hardware?.receiver === scope.target).map(cabinet => cabinet.id))
  return new Set(scene.cabinets.filter(cabinet => cabinet.hardware?.port === scope.target).map(cabinet => cabinet.id))
}

export function buildTestWalkSpace(project: Project, scene: TestScene, scope: TestScope): TestWalkSpace {
  const projection = projectEditableHardwareMapping(project.source)
  if (projection.status !== 'ready' || !scene.hardwareReady) return { total: 0, spans: [], hardware: null }
  const included = scopeCabinets(scene, scope)
  const spans: WalkSpan[] = []
  let ordinalBase = 0
  for (const port of projection.hardware.ports) {
    for (const receiver of port.receivers) {
      for (const cabinet of receiver.cabinets) {
        if (!included.has(cabinet.cabinet)) continue
        spans.push({
          ordinalBase,
          pixelCount: cabinet.pixelCount,
          processor: port.processor,
          port: port.port,
          receiver: receiver.receiver,
          cabinet: cabinet.cabinet,
          dataIndexBase: cabinet.portBase,
        })
        ordinalBase += cabinet.pixelCount
      }
    }
  }
  return Object.freeze({ total: ordinalBase, spans: Object.freeze(spans), hardware: projection.hardware })
}

export function walkOrdinalForDataIndex(space: TestWalkSpace, dataIndex: number): number | null {
  if (!Number.isSafeInteger(dataIndex) || dataIndex < 0) return null
  const span = space.spans.find(value => dataIndex >= value.dataIndexBase && dataIndex < value.dataIndexBase + value.pixelCount)
  return span ? span.ordinalBase + dataIndex - span.dataIndexBase : null
}

export function resolveTestWalkPixel(project: Project, space: TestWalkSpace, ordinal: number): TestWalkPixel | null {
  if (!space.hardware || space.total === 0 || !Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= space.total) return null
  const span = space.spans.find(value => ordinal >= value.ordinalBase && ordinal < value.ordinalBase + value.pixelCount)
  if (!span) return null
  const dataIndex = span.dataIndexBase + ordinal - span.ordinalBase
  const located = locatePixel(space.hardware, { processor: span.processor, port: span.port, dataIndex })
  const cabinet = project.source.hardwareTopology.cabinets.find(value => value.id === located.cabinet)
  if (!cabinet) return null
  const region = project.source.mappingRegions.find(value => value.grid === cabinet.grid)
  if (!region) return null
  const geometry = projectEditableGeometryMapping(project.source, region.id)
  if (geometry.status !== 'ready') return null
  const mapped = unmapGeometryCabinetPixel(geometry.mapping, { cabinet: located.cabinet, coordinate: located.cabinetCoordinate })
  const screen = project.screens.find(value => value.screen.id === geometry.mapping.screen.id)
  if (!screen) return null
  return Object.freeze({
    ordinal,
    total: space.total,
    input: mapped.inputCoordinate,
    screen: screen.screen.id,
    screenName: screen.screen.name,
    screenCoordinate: mapped.screenCoordinate,
    cabinet: mapped.cabinet,
    cabinetCoordinate: mapped.cabinetCoordinate,
    module: mapped.module,
    moduleCoordinate: mapped.moduleCoordinate,
    receiver: span.receiver,
    port: span.port,
    processor: span.processor,
    dataIndex,
    compositionPoint: {
      x: screen.x + mapped.screenCoordinate.x,
      y: screen.y + mapped.screenCoordinate.y,
    },
  })
}
