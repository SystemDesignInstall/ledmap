import {
  mapGeometryInputPixel,
  projectEditableGeometryMapping,
  unmapGeometryModulePixel,
} from '@ledmap/core'
import { describe, expect, it } from 'vitest'
import {
  addMappingRegion,
  deleteMappingRegion,
  mapFromLayoutPosition,
  setInputCanvasResolution,
  updateMappingRegion,
} from '../src/renderer/mapping-project.js'
import { setScreenPosition } from '../src/renderer/project.js'
import { createTestProject } from './project-fixtures.js'

describe('Mapping workspace source mutations', () => {
  it('creates Input Canvas and Mapping Regions independently from Layout placement', () => {
    let project = createTestProject()
    project = setInputCanvasResolution(project, 1920, 1080)
    project = addMappingRegion(project, 'screen-1')
    const region = project.source.mappingRegions[0]!
    expect(project.source.inputCanvas?.resolution).toEqual({ width: 1920, height: 1080 })
    expect(region.position).toEqual({ x: 0, y: 0 })
    expect(region.size).toEqual(project.screens[0]!.screen.resolution)

    project = setScreenPosition(project, 'screen-1', 480, 320)
    expect(project.source.mappingRegions[0]!.position).toEqual({ x: 0, y: 0 })
    project = updateMappingRegion(project, region.id, { x: 120, y: 90 })
    expect(project.screens[0]!.x).toBe(480)
    expect(project.source.mappingRegions[0]!.position).toEqual({ x: 120, y: 90 })
  })

  it('maps from Layout only on explicit request and preserves an existing Region size', () => {
    let project = createTestProject()
    project = setInputCanvasResolution(project, 1920, 1080)
    project = setScreenPosition(project, 'screen-1', 320, 180)
    project = addMappingRegion(project, 'screen-1', { x: 10, y: 20 })
    const region = project.source.mappingRegions[0]!
    project = updateMappingRegion(project, region.id, { width: 500, height: 300 })
    project = mapFromLayoutPosition(project, 'screen-1', region.id)
    expect(project.source.mappingRegions[0]).toMatchObject({
      position: { x: 320, y: 180 },
      size: { width: 500, height: 300 },
    })
  })

  it('projects complete geometry without configured hardware addressing and round-trips a Module pixel', () => {
    let project = createTestProject()
    project = setInputCanvasResolution(project, 1920, 1080)
    project = addMappingRegion(project, 'screen-1', { x: 100, y: 50 })
    const region = project.source.mappingRegions[0]!
    const projected = projectEditableGeometryMapping(project.source, region.id)
    expect(projected.status).toBe('ready')
    if (projected.status !== 'ready') return
    const forward = mapGeometryInputPixel(projected.mapping, {
      inputCanvas: project.source.inputCanvas!.id,
      inputCoordinate: { x: 149, y: 87 },
    })
    const reverse = unmapGeometryModulePixel(projected.mapping, {
      cabinet: forward.cabinet,
      module: forward.module,
      coordinate: forward.moduleCoordinate,
    })
    expect(reverse).toEqual(forward)
    expect(project.source.hardwareTopology.processors).toEqual([])
    expect(project.source.hardwareTopology.ports).toEqual([])
    expect(project.source.hardwareTopology.receivers).toEqual([])
  })

  it('keeps invalid and out-of-bounds Regions diagnosable and deletes memberships atomically', () => {
    let project = createTestProject()
    project = setInputCanvasResolution(project, 800, 600)
    project = addMappingRegion(project, 'screen-1')
    const region = project.source.mappingRegions[0]!
    project = updateMappingRegion(project, region.id, { x: 700, y: 500, width: 400, height: 200 })
    const projected = projectEditableGeometryMapping(project.source, region.id)
    expect(projected.status).toBe('incomplete')
    expect(projected.diagnostics[0]?.code).toBe('MAPPING_OUT_OF_RANGE')
    project = deleteMappingRegion(project, region.id)
    expect(project.source.mappingRegions).toEqual([])
    expect(project.source.screens[0]!.mappingRegions).toEqual([])
  })
})
