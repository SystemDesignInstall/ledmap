import { describe, expect, it } from 'vitest'
import { createEditableProject, editableProjectFromValidatedProject, inspectEditableProject } from '../../src/index.js'
import { minimalProject, mutable } from '../serialization/fixtures.js'

describe('Editable project construction', () => {
  it('creates a deeply immutable empty editor source', () => {
    const project = createEditableProject()
    expect(inspectEditableProject(project)).toEqual([])
    expect(project.inputCanvas).toBeNull()
    expect(project.screens).toEqual([])
    expect(project.hardwareTopology.cabinets).toEqual([])
    expect(project.editorLayout.screenPositions).toEqual([])
    expect(Object.isFrozen(project)).toBe(true)
    expect(Object.isFrozen(project.hardwareTopology)).toBe(true)
    expect(Object.isFrozen(project.editorLayout.screenPositions)).toBe(true)
  })

  it('detaches a valid v1 runtime source and preserves a signed composition position', () => {
    const source = minimalProject()
    const project = editableProjectFromValidatedProject(source, { x: -40, y: 25 })

    expect(inspectEditableProject(project)).toEqual([])
    expect(project.screens).toEqual([source.mapping.screen])
    expect(project.cabinetGrids).toEqual([source.mapping.grid])
    expect(project.mappingRegions).toEqual([source.mapping.region])
    expect(project.editorLayout.screenPositions).toEqual([{
      screen: source.mapping.screen.id,
      position: { x: -40, y: 25 },
    }])

    const originalName = project.screens[0]!.name
    mutable(source.mapping.screen).name = 'Changed after bridge'
    mutable(source.mapping.hardwareTopology.receivers[0]!).cabinets = []

    expect(project.screens[0]!.name).toBe(originalName)
    expect(project.hardwareTopology.receivers[0]!.cabinets).not.toEqual([])
    expect(Object.isFrozen(project.screens[0]!.resolution)).toBe(true)
    expect(Object.isFrozen(project.hardwareTopology.receivers[0]!.cabinets)).toBe(true)
  })

  it('rejects unsafe composition coordinates at the bridge boundary', () => {
    expect(() => editableProjectFromValidatedProject(minimalProject(), {
      x: Number.MAX_SAFE_INTEGER + 1,
      y: 0,
    })).toThrow(/signed safe integers/)
  })
})
