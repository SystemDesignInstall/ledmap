import { describe, expect, it } from 'vitest'
import { convertEditableProjectToV2, createProjectV2 } from '@ledmap/core'
import { addScreen, setScreenPosition } from '../src/renderer/project.js'
import {
  commitLegacyProject,
  createProjectSession,
  loadProjectSession,
  serializeProjectSession,
  sessionDirty,
  sessionWorkspaceProject,
  type ProjectSession,
} from '../src/renderer/project-session.js'
import { compactReadyProject } from './v2-parity-fixtures.js'

describe('ProjectSession ownership and mutation bridge', () => {
  it('does not advance a revision for a semantic no-op, even with newly allocated objects', () => {
    const session = createProjectSession('session-1')
    const view = sessionWorkspaceProject(session)
    expect(commitLegacyProject(session, { ...view, source: { ...view.source } })).toBe(session)
    expect(sessionDirty(session)).toBe(false)
  })

  it('advances exactly once for each real legacy mutation and reopens the schema-v2 wire result', () => {
    const empty = createProjectSession('session-1')
    const added = commitLegacyProject(empty, addScreen(sessionWorkspaceProject(empty)))
    const moved = commitLegacyProject(added, setScreenPosition(sessionWorkspaceProject(added), 'screen-1', -240, 80))
    expect(added.revision).toBe(1)
    expect(moved.revision).toBe(2)
    expect(moved.savedRevision).toBe(0)
    expect(sessionDirty(moved)).toBe(true)
    const stored = serializeProjectSession(moved)
    expect(JSON.parse(stored)).toMatchObject({ format: 'ledmap', schemaVersion: 2 })
    const reopened = loadProjectSession(stored, 'project.ledmap', 'session-2')
    expect(reopened.project).toEqual(moved.project)
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
    const changed = commitLegacyProject(session, setScreenPosition(sessionWorkspaceProject(session), 'screen-1', 48, 32))
    expect(changed.project.metadata).toEqual(project.metadata)
    expect(changed.project.design.cabinets[0]!.label).toBe('Custom V2 label')
    expect(changed.project.hardware.assignments[0]).toEqual(project.hardware.assignments[0])
    expect(changed.project.design.composition.placements[0]).toMatchObject({ x: 48, y: 32 })
    expect(changed.revision).toBe(1)
    expect(() => serializeProjectSession(changed)).toThrow(/PROJECT_COMPAT_SAVE_LOSSY/)
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
    expect(() => commitLegacyProject(session, setScreenPosition(sessionWorkspaceProject(session), 'screen-1', 48, 32)))
      .toThrow(/PROJECT_COMPAT_MUTATION_BLOCKED/)
    expect(session.project).toBe(project)
    expect(session.revision).toBe(0)
  })

  it('rejects Save before the writer sees V2-only data', () => {
    const session: ProjectSession = {
      ...createProjectSession('session-1'),
      project: createProjectV2({ ...createProjectSession('seed').project, metadata: { name: 'V2 only' } }),
    }
    expect(() => serializeProjectSession(session)).toThrow(/PROJECT_COMPAT_SAVE_LOSSY/)
  })

  it('blocks legacy reads and mutations when Stage cannot be projected', () => {
    const empty = createProjectSession('session-1')
    const session: ProjectSession = {
      ...empty,
      project: createProjectV2({
        ...empty.project,
        design: { ...empty.project.design, stage: { placements: [] } },
      }),
    }
    expect(() => sessionWorkspaceProject(session)).toThrow(/PROJECT_COMPAT_UNSUPPORTED/)
    expect(() => serializeProjectSession(session)).toThrow(/PROJECT_COMPAT_UNSUPPORTED/)
    expect(session.revision).toBe(0)
  })
})
