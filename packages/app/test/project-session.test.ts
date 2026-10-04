import { describe, expect, it } from 'vitest'
import { convertEditableProjectToV2, createProjectV2, inspectProjectV2Readiness, validateProjectV2Structural } from '@ledmap/core'
import { addScreenV2, setScreenPositionV2 } from '../src/renderer/v2-commands.js'
import { unassignCabinetsV2 } from '../src/renderer/v2-hardware-commands.js'
import {
  commitProjectV2,
  createProjectSession,
  loadProjectSession,
  recoverProjectSession,
  serializeProjectSession,
  sessionDirty,
  sessionWorkspaceProject,
  type ProjectSession,
} from '../src/renderer/project-session.js'
import { compactReadyProject } from './v2-parity-fixtures.js'

describe('ProjectSession V2 ownership', () => {
  it('recovers a V4 snapshot into a new dirty untitled runtime epoch', () => {
    const changed = commitProjectV2(createProjectSession('old-epoch'), project => addScreenV2(project))
    const recovered = recoverProjectSession(serializeProjectSession(changed), 'new-epoch')
    expect(recovered.documentId).toBe('new-epoch')
    expect(recovered.project).toEqual(changed.project)
    expect(recovered.currentFilePath).toBeNull()
    expect(recovered.sourceSchemaVersion).toBe(4)
    expect(recovered.revision).toBe(1)
    expect(recovered.savedRevision).toBe(0)
    expect(sessionDirty(recovered)).toBe(true)
  })
  it('does not advance a revision for a semantic no-op, even with newly allocated objects', () => {
    const session = createProjectSession('session-1')
    expect(commitProjectV2(session, project => ({ ...project }))).toBe(session)
    expect(sessionDirty(session)).toBe(false)
  })

  it('advances exactly once for each real V2 mutation and reopens the schema-v4 wire result', () => {
    const empty = createProjectSession('session-1')
    const added = commitProjectV2(empty, project => addScreenV2(project))
    const moved = commitProjectV2(added, project => setScreenPositionV2(project, 'screen-1', -240, 80))
    expect(added.revision).toBe(1)
    expect(moved.revision).toBe(2)
    expect(moved.savedRevision).toBe(0)
    expect(sessionDirty(moved)).toBe(true)
    const stored = serializeProjectSession(moved)
    expect(JSON.parse(stored)).toMatchObject({ format: 'ledmap', schemaVersion: 4 })
    const reopened = loadProjectSession(stored, 'project.ledmap', 'session-2')
    expect(reopened.project).toEqual(moved.project)
    expect(reopened.project.design.cabinets[0]).toMatchObject({ moduleColumns: 1, moduleRows: 1 })
    expect(reopened.project.design.modules).toHaveLength(12)
    expect(reopened.revision).toBe(0)
    expect(sessionWorkspaceProject(reopened).screens[0]).toMatchObject({ x: -240, y: 80 })
  })

  it('preserves V2-only metadata, Cabinet labels and assignment metadata after an unrelated Layout mutation', () => {
    const base = convertEditableProjectToV2(compactReadyProject().source)
    const firstCabinet = base.design.cabinets[0]!
    const firstAssignment = base.hardware.assignments[0]!
    const project = createProjectV2({
      ...base,
      metadata: { name: 'V2 name', description: 'Keep this' },
      design: {
        ...base.design,
        cabinets: base.design.cabinets.map(cabinet => cabinet.id === firstCabinet.id
          ? { ...cabinet, label: 'Custom V2 label' }
          : cabinet),
      },
      hardware: {
        ...base.hardware,
        assignments: base.hardware.assignments.map(assignment => assignment.id === firstAssignment.id
          ? { ...assignment, locked: false, origin: 'manual' as const }
          : assignment),
      },
    })
    const session: ProjectSession = { ...createProjectSession('session-1'), project }
    const changed = commitProjectV2(session, source => setScreenPositionV2(source, 'screen-1', 48, 32))
    expect(changed.project.metadata).toEqual(project.metadata)
    expect(changed.project.design.cabinets[0]!.label).toBe('Custom V2 label')
    expect(changed.project.hardware.assignments[0]).toEqual(project.hardware.assignments[0])
    expect(changed.project.design.composition.placements[0]).toMatchObject({ x: 48, y: 32 })
    expect(changed.revision).toBe(1)
    const reopened = loadProjectSession(serializeProjectSession(changed), 'v3.ledmap', 'session-2')
    expect(reopened.project).toEqual(changed.project)
  })

  it('blocks a mutation of a V2-locked placement without publishing a candidate', () => {
    const base = convertEditableProjectToV2(compactReadyProject().source)
    const project = createProjectV2({
      ...base,
      design: {
        ...base.design,
        composition: {
          placements: base.design.composition.placements.map((placement, index) => (
            index === 0 ? { ...placement, locked: true } : placement
          )),
        },
      },
    })
    const session: ProjectSession = { ...createProjectSession('session-1'), project }
    expect(() => commitProjectV2(session, source => setScreenPositionV2(source, 'screen-1', 48, 32)))
      .toThrow(/PROJECT_COMPAT_MUTATION_BLOCKED/)
    expect(session.project).toBe(project)
    expect(session.revision).toBe(0)
  })

  it('persists V2-only metadata in native v4', () => {
    const session: ProjectSession = {
      ...createProjectSession('session-1'),
      project: createProjectV2({ ...createProjectSession('seed').project, metadata: { name: 'V2 only' } }),
    }
    expect(loadProjectSession(serializeProjectSession(session), 'v3.ledmap', 'session-2').project.metadata)
      .toEqual({ name: 'V2 only' })
  })

  it('keeps valid but out-of-range Mapping as a committed V2 document with readiness diagnostics', () => {
    const base = convertEditableProjectToV2(compactReadyProject().source)
    const session: ProjectSession = { ...createProjectSession('session-1'), project: base }
    const changed = commitProjectV2(session, project => ({ ...project, content: {
      ...project.content, mappingRegions: project.content.mappingRegions.map((region, index) => index === 0
        ? { ...region, position: { ...region.position, x: 17 } } : region),
    } }))
    expect(changed.revision).toBe(1)
    expect(validateProjectV2Structural(changed.project)).toEqual([])
    expect(inspectProjectV2Readiness(changed.project).map(value => value.code)).toContain('MAPPING_OUT_OF_RANGE')
  })

  it('permits incomplete Hardware as readiness state but rejects structural contradictions atomically', () => {
    const base = convertEditableProjectToV2(compactReadyProject().source)
    const session: ProjectSession = { ...createProjectSession('session-1'), project: base }
    const cabinetId = base.design.cabinets[0]!.id
    const incomplete = commitProjectV2(session, project => unassignCabinetsV2(project, 'receiver-1', [cabinetId]))
    expect(incomplete.revision).toBe(1)
    expect(validateProjectV2Structural(incomplete.project)).toEqual([])
    expect(inspectProjectV2Readiness(incomplete.project).length).toBeGreaterThan(0)
    expect(() => commitProjectV2(session, project => ({ ...project, hardware: { ...project.hardware,
      assignments: [...project.hardware.assignments, project.hardware.assignments[0]!] } }))).toThrow()
    expect(session.revision).toBe(0)
    expect(session.project).toBe(base)
  })

  it('persists V2-only Stage state through native v4 Save and Open', () => {
    const empty = createProjectSession('session-1')
    const session: ProjectSession = {
      ...empty,
      project: createProjectV2({
        ...empty.project,
        design: { ...empty.project.design, stage: { placements: [] } },
      }),
    }
    expect(sessionWorkspaceProject(session).screens).toEqual([])
    expect(loadProjectSession(serializeProjectSession(session), 'v3.ledmap', 'session-2').project.design.stage)
      .toEqual({ placements: [] })
    expect(session.revision).toBe(0)
  })
})
