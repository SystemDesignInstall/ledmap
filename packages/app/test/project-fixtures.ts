import { addScreen, createProject, setScreenPosition, type Project } from '../src/renderer/project.js'
import { initialDraft } from '../src/renderer/state.js'

export function createTestProject(): Project {
  let project = createProject()
  project = addScreen(project)
  project = addScreen(project, { ...initialDraft, columns: '3', rows: '2' })
  project = setScreenPosition(project, 'screen-2', 700, 120)
  project = addScreen(project, { ...initialDraft, columns: '4', rows: '2' })
  return setScreenPosition(project, 'screen-3', 320, 620)
}
