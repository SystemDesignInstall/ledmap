import { addScreen, createProject, setScreenPosition, type Project } from '../src/renderer/project.js'
import { initialDraft, type Draft } from '../src/renderer/state.js'

export const ref001Draft: Draft = { ...initialDraft, moduleColumns: '4', moduleRows: '4' }

export function createTestProjectFrom(base: Draft): Project {
  let project = createProject()
  project = addScreen(project, base)
  project = addScreen(project, { ...base, columns: '3', rows: '2' })
  project = setScreenPosition(project, 'screen-2', 700, 120)
  project = addScreen(project, { ...base, columns: '4', rows: '2' })
  return setScreenPosition(project, 'screen-3', 320, 620)
}

export function createTestProject(): Project {
  return createTestProjectFrom(initialDraft)
}

export function createRef001TestProject(): Project {
  return createTestProjectFrom(ref001Draft)
}