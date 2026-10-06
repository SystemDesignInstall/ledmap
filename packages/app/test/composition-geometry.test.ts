import { describe, expect, it } from 'vitest'
import { selectCompositionGeometry } from '@ledmap/core'
import { addScreenV2, setScreenPositionsV2 } from '../src/renderer/v2-commands.js'
import { createProjectSession, sessionWorkspaceProject } from '../src/renderer/project-session.js'
import { projectBounds, projectV2WorkspaceReadModel } from '../src/renderer/v2-view-model.js'

describe('Composition geometry parity', () => {
  it('reports zero bounds for an empty project', () => {
    const project = projectV2WorkspaceReadModel(createProjectSession('session-1').project)
    expect(projectBounds(project)).toEqual({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 })
    expect(selectCompositionGeometry(project.model).bounds).toBeNull()
  })

  it('matches the core selector bounds, rects and pixel totals', () => {
    const empty = createProjectSession('session-1').project
    const two = addScreenV2(addScreenV2(empty))
    const moved = setScreenPositionsV2(two, { 'screen-1': { x: 0, y: 0 }, 'screen-2': { x: 600, y: 40 } })
    const project = projectV2WorkspaceReadModel(moved)
    const geometry = selectCompositionGeometry(moved)
    expect(projectBounds(project)).toEqual({ ...geometry.bounds! })
    expect(geometry.screens).toHaveLength(2)
    for (const rect of geometry.screens) {
      const view = project.screens.find(screen => screen.screen.id === rect.screenId)!
      expect(rect.x).toBe(view.x)
      expect(rect.y).toBe(view.y)
    }
    expect(geometry.totalOutputPixels).toBe(project.screens.reduce((sum, screen) => sum + screen.pixelCount, 0))
    expect(geometry.overlaps).toEqual([])
  })

  it('keeps union bounds while reporting the overlap pair', () => {
    const empty = createProjectSession('session-1').project
    const two = addScreenV2(addScreenV2(empty))
    const moved = setScreenPositionsV2(two, { 'screen-1': { x: 0, y: 0 }, 'screen-2': { x: 100, y: 50 } })
    const project = projectV2WorkspaceReadModel(moved)
    const geometry = selectCompositionGeometry(moved)
    expect(geometry.overlaps).toHaveLength(1)
    expect(projectBounds(project)).toEqual({ ...geometry.bounds! })
  })

  it('rejects negative placements through the same core contract', () => {
    const empty = createProjectSession('session-1').project
    const added = addScreenV2(empty)
    const corrupted = {
      ...added,
      design: {
        ...added.design,
        composition: {
          placements: added.design.composition.placements.map(placement => ({ ...placement, x: -10 })),
        },
      },
    }
    expect(() => projectBounds(sessionWorkspaceProject({ ...createProjectSession('s'), project: corrupted }))).toThrow(/PROJECT_INVALID_GEOMETRY/)
    expect(() => selectCompositionGeometry(corrupted)).toThrowError(/PROJECT_INVALID_GEOMETRY/)
  })
})
