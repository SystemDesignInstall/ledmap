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

  await page.screenshot({ path: `${output}/project-canvas.png` })
  assert.deepEqual(failures, [])
  console.log('Electron smoke passed: demo project, selection, properties edit, cabinet hit, drag, REF-001 safety, view modes, add screen, Escape clear.')
  console.log(`Screenshots: ${output}`)
} finally {
  await app.close()
}
