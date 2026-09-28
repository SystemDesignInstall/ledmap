import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const appRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
const output = fileURLToPath(new URL('../out/smoke/', import.meta.url))
await mkdir(output, { recursive: true })
const env = { ...process.env }
delete env['ELECTRON_RUN_AS_NODE']
delete env['ELECTRON_RENDERER_URL']
const app = await electron.launch({ args: [appRoot], env })
const failures = []
try {
  const page = await app.firstWindow()
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', message => { if (message.type() === 'error') failures.push(message.text()) })
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(() => {
    const proto = CanvasRenderingContext2D.prototype
    const transform = proto.setTransform
    const text = proto.fillText
    window.__drawnText = []
    proto.setTransform = function (...args) { window.__drawnText = []; return transform.apply(this, args) }
    proto.fillText = function (...args) { window.__drawnText.push(args[0]); return text.apply(this, args) }
  })
  await page.waitForFunction(() => window.__ledmap && window.__ledmap.dump().length === 3)

  const dump = async () => page.evaluate(() => window.__ledmap.dump())
  const selection = async () => page.evaluate(() => window.__ledmap.selection())
  const bounds = async () => page.evaluate(() => window.__ledmap.bounds())
  const viewMode = async () => page.evaluate(() => window.__ledmap.viewMode())
  const camera = async () => page.evaluate(() => window.__ledmap.camera())
  const canvasBox = async () => (await page.locator('#project-canvas').boundingBox())

  const initial = await dump()
  assert.equal(initial.length, 3)
  assert.deepEqual(initial.map(s => s.name), ['Screen 1', 'Screen 2', 'Screen 3'])
  assert.deepEqual(initial.map(s => [s.x, s.y]), [[0, 0], [700, 120], [320, 620]])
  assert.ok((await bounds()).width === 1084 && (await bounds()).height === 876)
  assert.match(await page.locator('#bounds').innerText(), /Project bounds 1,084 × 876 px/)
  assert.equal(initial[0].cabinets.length, 12)
  assert.deepEqual(initial[0].order, [1, 2, 3, 4, 8, 7, 6, 5, 9, 10, 11, 12])
  assert.deepEqual(initial[0].cabinets.map(c => c.id), Array.from({ length: 12 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`))
  assert.deepEqual(initial[1].order, [1, 2, 3, 6, 5, 4])
  assert.deepEqual(initial[2].order, [1, 2, 3, 4, 8, 7, 6, 5])
  assert.match(await page.locator('#project-tree').innerText(), /Screens \(3\)/)
  assert.match(await page.locator('#project-canvas').getAttribute('aria-label'), /3 screens/)

  await page.locator('#project-tree [role="treeitem"]').filter({ hasText: 'Screen 1' }).click()
  assert.equal((await selection())?.type, 'screen')
  assert.equal((await selection())?.id, 'screen-1')
  assert.equal(await page.locator('#properties-title').innerText(), 'Screen')
  assert.equal(await page.locator('#selection-chip').innerText(), 'Screen 1 selected')
  assert.equal(await page.locator('input[aria-label="Screen X position"]').inputValue(), '0')

  const xInput = page.locator('input[aria-label="Screen X position"]')
  await xInput.fill('120')
  await xInput.blur()
  assert.equal((await dump())[0].x, 120)
  assert.equal((await dump())[0].y, 0)
  assert.equal(await page.locator('input[aria-label="Screen X position"]').inputValue(), '120')
  assert.equal((await bounds()).width, 964)

  await page.evaluate(() => {
    const input = document.querySelector('input[aria-label="Screen X position"]')
    input.value = ''
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.waitForFunction(() => document.querySelector('input[aria-label="Screen X position"]').getAttribute('aria-invalid') === 'true')
  assert.equal((await dump())[0].x, 120)

  await page.locator('#project-tree [role="treeitem"]').filter({ hasText: 'Cabinet Grid' }).first().click()
  assert.equal((await selection())?.type, 'cabinetGrid')
  assert.equal(await page.locator('#properties-title').innerText(), 'Cabinet Grid')
  const gridColumnsInput = page.locator('input[aria-label="Cabinet Grid Columns"]')
  const gridRowsInput = page.locator('input[aria-label="Cabinet Grid Rows"]')
  assert.equal(await gridColumnsInput.inputValue(), '4')
  assert.equal(await gridRowsInput.inputValue(), '3')
  await gridColumnsInput.fill('5')
  await gridColumnsInput.blur()
  assert.equal((await dump())[0].columns, 5)
  assert.equal((await dump())[0].cabinets.length, 15)
  assert.equal((await selection())?.type, 'cabinetGrid', 'grid selection survives resize commit')
  assert.equal((await dump())[1].columns, 3, 'grid edit only changes the owning screen')
  await gridColumnsInput.fill('4')
  await gridColumnsInput.blur()
  assert.equal((await dump())[0].columns, 4)
  assert.equal((await dump())[0].rows, 3)
  assert.equal((await dump())[0].cabinets.length, 12)

  await gridColumnsInput.fill('400')
  await gridColumnsInput.blur()
  await page.waitForFunction(() => document.querySelector('input[aria-label="Cabinet Grid Columns"]').getAttribute('aria-invalid') === 'true')
  assert.equal((await dump())[0].columns, 4, 'value above the limit does not mutate the model')
  assert.equal(await gridColumnsInput.inputValue(), '4')
  assert.match(await gridColumnsInput.getAttribute('title'), /limited to 341/)
  assert.equal((await selection())?.type, 'cabinetGrid')

  const configBefore = (await dump())[0]
  const configIds = configBefore.cabinets.map(c => c.id)
  const moduleColumnsInput = page.locator('input[aria-label="Cabinet Grid Module Columns"]')
  const moduleRowsInput = page.locator('input[aria-label="Cabinet Grid Module Rows"]')
  assert.equal(await moduleColumnsInput.inputValue(), '4')
  assert.equal(await moduleRowsInput.inputValue(), '4')
  await moduleColumnsInput.fill('5')
  await moduleColumnsInput.blur()
  let configured = (await dump())[0]
  assert.equal(configured.moduleColumns, 5)
  assert.equal(configured.cabinetWidth, 160)
  assert.equal(configured.cabinetHeight, 128)
  assert.equal(configured.width, 640)
  assert.equal(configured.height, 384)
  assert.equal(configured.modulesPerCabinet, 20)
  assert.equal(configured.totalModules, 240)
  assert.deepEqual(configured.cabinets.map(c => c.id), configIds)
  assert.equal(configured.nextCabinetSerial, configBefore.nextCabinetSerial)
  assert.equal((await selection())?.type, 'cabinetGrid')
  await page.screenshot({ path: `${output}/cabinet-config-editor.png` })

  await moduleRowsInput.fill('0')
  await moduleRowsInput.blur()
  await page.waitForFunction(() => document.querySelector('input[aria-label="Cabinet Grid Module Rows"]').getAttribute('aria-invalid') === 'true')
  assert.equal((await dump())[0].moduleRows, 4, 'invalid module geometry does not mutate the model')
  assert.equal(await moduleRowsInput.inputValue(), '4')

  const numberingSelect = page.locator('select[aria-label="Cabinet Grid Numbering"]')
  await numberingSelect.selectOption('column')
  configured = (await dump())[0]
  assert.equal(configured.numbering, 'column')
  assert.equal(configured.direction, 'top-to-bottom')
  assert.deepEqual(configured.cabinets.map(c => c.id), configIds)
  const directionSelect = page.locator('select[aria-label="Cabinet Grid Direction"]')
  assert.deepEqual(await directionSelect.locator('option').evaluateAll(nodes => nodes.map(node => node.value)), ['top-to-bottom', 'bottom-to-top'])
  const snakeToggle = page.locator('button[aria-label="Cabinet Grid Snake"]')
  assert.equal(await snakeToggle.getAttribute('aria-pressed'), 'true')
  await snakeToggle.click()
  assert.equal((await dump())[0].snake, false)

  await numberingSelect.selectOption('row')
  assert.equal((await dump())[0].direction, 'left-to-right')
  await page.locator('button[aria-label="Cabinet Grid Snake"]').click()
  await moduleColumnsInput.fill('4')
  await moduleColumnsInput.blur()
  configured = (await dump())[0]
  assert.equal(configured.moduleColumns, 4)
  assert.equal(configured.cabinetWidth, 128)
  assert.equal(configured.width, 512)
  assert.equal(configured.snake, true)
  assert.deepEqual(configured.order, [1, 2, 3, 4, 8, 7, 6, 5, 9, 10, 11, 12])
  assert.deepEqual(configured.cabinets.map(c => c.id), configIds)
  assert.equal((await selection())?.type, 'cabinetGrid')

  const keyboardSnake = page.locator('button[aria-label="Cabinet Grid Snake"]')
  await keyboardSnake.focus()
  await page.keyboard.press('Space')
  assert.equal((await dump())[0].snake, false, 'Space activates the focused property button instead of canvas pan')
  assert.equal((await selection())?.type, 'cabinetGrid')
  await page.locator('button[aria-label="Cabinet Grid Snake"]').focus()
  await page.keyboard.press('Space')
  assert.equal((await dump())[0].snake, true)
  await page.locator('select[aria-label="Cabinet Grid Numbering"]').focus()
  await page.keyboard.press('Escape')
  assert.equal((await selection())?.type, 'cabinetGrid', 'Escape on a property control does not clear canvas selection')

  const modulePixelWidthInput = page.locator('input[aria-label="Cabinet Grid Module Pixel Width"]')
  await modulePixelWidthInput.fill('1300000000000')
  await modulePixelWidthInput.blur()
  assert.equal((await dump())[0].modulePixelWidth, 1300000000000)
  await gridColumnsInput.fill('5')
  await gridColumnsInput.blur()
  await page.waitForFunction(() => document.querySelector('input[aria-label="Cabinet Grid Columns"]').getAttribute('aria-invalid') === 'true')
  assert.equal((await dump())[0].columns, 4, 'resize failure after geometry validation does not mutate the model')
  assert.equal(await gridColumnsInput.inputValue(), '4', 'rejected resize is reflected back to the field')
  assert.match(await gridColumnsInput.getAttribute('title'), /safe integer range/)
  await modulePixelWidthInput.fill('32')
  await modulePixelWidthInput.blur()
  assert.equal((await dump())[0].modulePixelWidth, 32)

  await page.locator('#toggle-mode').click()
  assert.equal(await viewMode(), 'active')
  assert.equal(await page.locator('#toggle-mode').innerText(), 'All Screens')
  assert.equal(await page.locator('#canvas-title').innerText(), 'Screen 1')
  await page.waitForFunction(values => JSON.stringify(window.__drawnText.filter(t => t.startsWith('#'))) === JSON.stringify(values.map(n => `#${n}`)), [1, 2, 3, 4, 8, 7, 6, 5, 9, 10, 11, 12])
  assert.deepEqual(await page.evaluate(() => window.__drawnText.filter(t => t.startsWith('C'))), Array.from({ length: 12 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`))

  const box = await canvasBox()
  assert.ok(box)
  const cabinetPoint = await page.evaluate(() => window.__ledmap.projectToPx({ x: 120 + 64, y: 0 + 64 }))
  await page.mouse.click(box.x + cabinetPoint.x, box.y + cabinetPoint.y)
  assert.equal((await selection())?.type, 'cabinet')
  assert.equal((await selection()).screenId, 'screen-1')
  assert.equal(await page.locator('#properties-title').innerText(), 'Cabinet')
  assert.match(await page.locator('#properties').innerText(), /Physical ID\s*C01/)

  const center = await page.evaluate(() => window.__ledmap.screenCenterPx('screen-1'))
  const zoomBefore = (await camera()).zoom
  const beforeBounds = await bounds()
  const beforeDrag = await dump()
  await page.mouse.move(box.x + center.x, box.y + center.y)
  await page.mouse.down()
  await page.mouse.move(box.x + center.x + 40, box.y + center.y + 20, { steps: 6 })
  await page.mouse.up()
  const afterDrag = await dump()
  const movedBy = { x: afterDrag[0].x - beforeDrag[0].x, y: afterDrag[0].y - beforeDrag[0].y }
  assert.ok(Math.abs(movedBy.x - 40 / zoomBefore) < 0.6, `expected dx≈${40 / zoomBefore}, got ${movedBy.x}`)
  assert.ok(Math.abs(movedBy.y - 20 / zoomBefore) < 0.6, `expected dy≈${20 / zoomBefore}, got ${movedBy.y}`)
  assert.equal((await selection())?.type, 'screen')
  assert.deepEqual(afterDrag[0].order, [1, 2, 3, 4, 8, 7, 6, 5, 9, 10, 11, 12])
  assert.deepEqual(afterDrag[0].cabinets.map(c => c.id), beforeDrag[0].cabinets.map(c => c.id))
  const movedBounds = await bounds()
  assert.ok(movedBounds.width < beforeBounds.width, 'bounds width recalculates after drag')
  assert.ok(movedBounds.height < beforeBounds.height, 'bounds height recalculates after drag')
  assert.ok(movedBounds.left > beforeBounds.left && movedBounds.top > beforeBounds.top, 'bounds origin follows the moved screen')

  await page.locator('#toggle-mode').click()
  assert.equal(await viewMode(), 'all')
  assert.equal(await page.locator('#toggle-mode').innerText(), 'Active Screen')

  await page.locator('#add-screen').click()
  const afterAdd = await dump()
  assert.equal(afterAdd.length, 4)
  assert.equal(afterAdd[3].name, 'Screen 4')
  assert.equal(afterAdd[3].x, 420)
  assert.equal(afterAdd[3].y, 720)
  assert.equal((await selection())?.id, 'screen-4')

  await page.keyboard.press('Escape')
  assert.equal(await selection(), null)
  assert.equal(await page.locator('#selection-chip').innerText(), 'No selection')

  await page.locator('#project-tree [role="treeitem"]').filter({ hasText: 'Screen 3' }).click()
  assert.equal(await page.locator('#properties-title').innerText(), 'Screen')
  assert.equal(await page.locator('input[aria-label="Screen Y position"]').inputValue(), '620')

  const preview = async () => page.evaluate(() => window.__ledmap.preview())
  const handles = async id => page.evaluate(screenId => window.__ledmap.resizeHandlesPx(screenId), id)
  const drawnText = async () => page.evaluate(() => window.__drawnText)
  const screen3Before = (await dump())[2]
  const boundsBeforeResize = await bounds()

  const columnsInput = page.locator('input[aria-label="Screen Columns"]')
  const rowsInput = page.locator('input[aria-label="Screen Rows"]')
  assert.equal(await columnsInput.inputValue(), '4')
  assert.equal(await rowsInput.inputValue(), '2')
  assert.match(await page.locator('#properties').innerText(), /Calculated Screen\s*Width\s*512 px\s*Height\s*256 px/)
  assert.match(await page.locator('#properties').innerText(), /Calculated Cabinet\s*Width\s*128 px\s*Height\s*128 px/)
  assert.equal(await page.locator('#properties').innerText().then(text => /128 px[\s\S]*128 px/.test(text)), true)

  await columnsInput.fill('6')
  await columnsInput.blur()
  const grown = (await dump())[2]
  assert.equal(grown.columns, 6)
  assert.equal(grown.width, 768)
  assert.equal(grown.height, 256)
  assert.equal(grown.cabinets.length, 12)
  assert.deepEqual(grown.cabinets.filter(c => c.column < 4).map(c => c.id), screen3Before.cabinets.map(c => c.id))
  assert.deepEqual(grown.order, [1, 2, 3, 4, 5, 6, 12, 11, 10, 9, 8, 7])
  assert.ok((await bounds()).width > boundsBeforeResize.width, 'project bounds grow with the resized screen')
  assert.equal((await dump())[0].columns, 4, 'other screens are untouched')
  assert.equal((await dump())[1].columns, 3, 'other screens are untouched')
  assert.equal(await preview(), null, 'properties commit does not leave a preview')
  assert.equal(await page.locator('input[aria-label="Screen Columns"]').inputValue(), '6')

  await columnsInput.fill('0')
  await columnsInput.blur()
  await page.waitForFunction(() => document.querySelector('input[aria-label="Screen Columns"]').getAttribute('aria-invalid') === 'true')
  assert.equal((await dump())[2].columns, 6, 'invalid value does not mutate the model')
  assert.equal(await page.locator('input[aria-label="Screen Columns"]').inputValue(), '6')

  await rowsInput.fill('4')
  await rowsInput.blur()
  assert.equal((await dump())[2].rows, 4)
  assert.equal((await dump())[2].height, 512)
  const grownCells = (await dump())[2].cabinets.map(c => `${c.column},${c.row}:${c.id}`)

  await page.locator('#toggle-mode').click()
  await page.locator('#fit-project').click()
  assert.equal(await viewMode(), 'active')
  let step = 2 * 128 * (await camera()).zoom
  const cornerOf = async () => (await handles('screen-3')).find(h => h.handle === 'bottomRight')
  const handleList = await handles('screen-3')
  assert.deepEqual(handleList.map(h => h.handle).sort(), ['bottom', 'bottomRight', 'right'])
  let corner = await cornerOf()

  await page.mouse.move(box.x + corner.x, box.y + corner.y)
  assert.equal(await page.locator('#project-canvas').evaluate(node => node.style.cursor), 'se-resize')
  await page.mouse.down()
  assert.equal(await preview(), null, 'gesture captures the original size without a preview')
  assert.equal((await dump())[2].columns, 6)
  assert.equal((await dump())[2].rows, 4)

  await page.mouse.move(box.x + corner.x + step, box.y + corner.y + step, { steps: 4 })
  assert.deepEqual(await preview(), { screenId: 'screen-3', columns: 8, rows: 6 })
  assert.equal((await dump())[2].columns, 6, 'preview does not mutate the project')
  assert.equal((await dump())[2].rows, 4)
  assert.equal((await dump())[2].x, grown.x, 'handle drag does not move the screen')
  assert.equal((await dump())[2].y, grown.y)
  const previewLabels = (await drawnText()).filter(t => /^C\d\d$/.test(t))
  assert.deepEqual(
    [...new Set(previewLabels)].sort(),
    [...new Set(grownCells.map(cell => cell.split(':')[1]))].sort(),
    'pending preview cells are drawn without IDs, numbers or new identity',
  )
  assert.equal(previewLabels.length, grownCells.length, 'each existing cabinet keeps exactly one label')
  assert.ok((await drawnText()).some(t => t.includes('8 × 6 cabinets') && t.includes('preview')))
  await page.screenshot({ path: `${output}/resize-preview.png` })

  await page.mouse.move(box.x + corner.x + 2 * step, box.y + corner.y + 2 * step, { steps: 4 })
  assert.deepEqual(await preview(), { screenId: 'screen-3', columns: 10, rows: 8 })
  await page.mouse.move(box.x + corner.x + step, box.y + corner.y + step, { steps: 4 })
  assert.deepEqual(await preview(), { screenId: 'screen-3', columns: 8, rows: 6 })
  await page.mouse.up()
  assert.equal(await preview(), null, 'gesture ends without a preview')
  const committed = (await dump())[2]
  assert.equal(committed.columns, 8)
  assert.equal(committed.rows, 6)
  assert.equal(committed.width, 1024)
  assert.equal(committed.height, 768)
  assert.equal(committed.cabinets.length, 48)
  const committedCells = new Map(committed.cabinets.map(c => [`${c.column},${c.row}`, c.id]))
  assert.ok(
    grownCells.every(cell => committedCells.get(cell.slice(0, cell.indexOf(':'))) === cell.slice(cell.indexOf(':') + 1)),
    'every existing cabinet keeps identity and position',
  )
  assert.equal(new Set(committed.cabinets.map(c => c.id)).size, 48, 'IDs are never reused')
  assert.equal(committed.cabinets.filter(c => !grownCells.some(cell => cell.endsWith(`:${c.id}`))).length, 24)
  assert.deepEqual([...committed.order].sort((a, b) => a - b), [...Array(48).keys()].map(i => i + 1))
  assert.equal((await selection())?.type, 'screen')
  assert.equal((await selection())?.id, 'screen-3')

  await page.locator('#fit-project').click()
  step = 2 * 128 * (await camera()).zoom
  corner = await cornerOf()
  await page.mouse.move(box.x + corner.x, box.y + corner.y)
  await page.mouse.down()
  await page.mouse.move(box.x + corner.x - step, box.y + corner.y, { steps: 4 })
  assert.deepEqual(await preview(), { screenId: 'screen-3', columns: 6, rows: 6 })
  await page.keyboard.press('Escape')
  assert.equal(await preview(), null)
  await page.mouse.up()
  assert.equal((await dump())[2].columns, 8, 'Escape cancels the gesture without a commit')
  assert.equal((await dump())[2].rows, 6)
  assert.equal((await selection()), null)

  await page.locator('#toggle-mode').click()
  await page.locator('#fit-project').click()
  assert.equal(await viewMode(), 'all')

  await page.screenshot({ path: `${output}/project-canvas.png` })
  assert.deepEqual(failures, [])
  console.log('Electron smoke passed: demo project, selection, properties edit, cabinet hit, drag, REF-001 safety, view modes, add screen, Escape clear.')
  console.log('Electron smoke passed: grid resize via Properties and handles, deferred commit, ID continuity, invalid input rejection.')
  console.log('Electron smoke passed: cabinet geometry and ordering editor, identity preservation, direction filtering and invalid patch rejection.')
  console.log(`Screenshots: ${output}`)
} finally {
  await app.close()
}
