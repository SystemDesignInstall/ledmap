import {
  addPort, addProcessor, addReceiver, assignCabinets, hardwareCabinetOrder,
} from '../src/renderer/hardware-project.js'
import { addMappingRegion, setInputCanvasResolution } from '../src/renderer/mapping-project.js'
import { addScreen, createProject, setScreenPosition, type Project } from '../src/renderer/project.js'
import { initialDraft } from '../src/renderer/state.js'

export function compactReadyProject(): Project {
  const draft = {
    ...initialDraft,
    columns: '1', rows: '1', moduleColumns: '1', moduleRows: '1',
    modulePixelWidth: '2', modulePixelHeight: '2',
  }
  let project = addScreen(addScreen(createProject(), draft), draft)
  project = setScreenPosition(project, 'screen-2', 8, 0)
  project = setInputCanvasResolution(project, 16, 8)
  project = addMappingRegion(project, 'screen-1', { x: 0, y: 0 })
  project = addMappingRegion(project, 'screen-2', { x: 8, y: 0 })
  project = addProcessor(project)
  project = addPort(project, 'processor-1')
  project = addReceiver(project, 'port-1')
  project = addReceiver(project, 'port-1')
  const cabinets = hardwareCabinetOrder(project)
  project = assignCabinets(project, 'receiver-1', [cabinets[0]!])
  return assignCabinets(project, 'receiver-2', [cabinets[1]!])
}
