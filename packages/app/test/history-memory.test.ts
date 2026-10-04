import { expect, it } from 'vitest'
import { ProjectDocumentController } from '../src/renderer/document.js'
import { addScreenV2, setScreenPositionV2 } from '../src/renderer/v2-commands.js'
import { initialDraft } from '../src/renderer/state.js'
import { serializeProjectSession } from '../src/renderer/project-session.js'

it('profiles bounded snapshot history on a project larger than the Electron smoke fixture', () => {
  const document = new ProjectDocumentController(() => 'large-project')
  document.transactV2(project => addScreenV2(project, { ...initialDraft,
    columns: '20', rows: '20', moduleColumns: '4', moduleRows: '4' }))
  const bytes = Buffer.byteLength(serializeProjectSession(document.session), 'utf8')
  const beforeHeap = process.memoryUsage().heapUsed
  const started = performance.now()
  for (let x = 1; x <= 8; x++) document.transactV2(project => setScreenPositionV2(project, 'screen-1', x, 0))
  const elapsedMs = Math.round(performance.now() - started)
  const retainedHeapMiB = Math.round((process.memoryUsage().heapUsed - beforeHeap) / 1024 / 1024)
  expect(document.session.project.design.cabinets).toHaveLength(400)
  expect(document.session.project.design.modules).toHaveLength(6_400)
  expect(bytes).toBeGreaterThan(175_355)
  expect(document.historyDepth).toBe(9)
  console.info(`History diagnostic: ${bytes} V3 bytes, 9 states, ${elapsedMs} ms, heap delta ${retainedHeapMiB} MiB`)
})
