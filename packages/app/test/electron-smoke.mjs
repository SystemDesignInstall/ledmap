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
  const labels = async () => (await page.locator('#grid-canvas').getAttribute('aria-label')).split('; ')
  const canvasNumbers = async expected => {
    await page.waitForFunction(values => JSON.stringify(window.__drawnText.filter(text => text.startsWith('#'))) === JSON.stringify(values.map(n => `#${n}`)), expected)
    assert.deepEqual(await page.evaluate(() => window.__drawnText.filter(text => text.startsWith('C'))), expected.map((_, i) => `C${String(i + 1).padStart(2, '0')}`))
    assert.deepEqual((await page.locator('#grid-canvas').getAttribute('aria-label')).match(/C\d+: logical \d+/g), expected.map((n, i) => `C${String(i + 1).padStart(2, '0')}: logical ${n}`))
  }
  await page.getByRole('button', { name: '+ Create Screen' }).click()
  await canvasNumbers([1, 2, 3, 4, 8, 7, 6, 5, 9, 10, 11, 12])
  assert.match(await page.locator('#summary').innerText(), /196,608/)
  assert.equal(await page.locator('#create-screen').isDisabled(), true)
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  await page.screenshot({ path: `${output}/alpha-default.png` })

  const cases = [
    ['row', 'left-to-right', true, [1, 2, 3, 4, 8, 7, 6, 5, 9, 10, 11, 12]],
    ['row', 'left-to-right', false, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]],
    ['row', 'right-to-left', false, [4, 3, 2, 1, 8, 7, 6, 5, 12, 11, 10, 9]],
    ['row', 'right-to-left', true, [4, 3, 2, 1, 5, 6, 7, 8, 12, 11, 10, 9]],
    ['column', 'top-to-bottom', false, [1, 4, 7, 10, 2, 5, 8, 11, 3, 6, 9, 12]],
    ['column', 'top-to-bottom', true, [1, 6, 7, 12, 2, 5, 8, 11, 3, 4, 9, 10]],
    ['column', 'bottom-to-top', false, [3, 6, 9, 12, 2, 5, 8, 11, 1, 4, 7, 10]],
    ['column', 'bottom-to-top', true, [3, 4, 9, 10, 2, 5, 8, 11, 1, 6, 7, 12]],
  ]
  for (const [numbering, direction, snake, expected] of cases) {
    await page.locator('#numbering').selectOption(numbering)
    await page.locator('#direction').selectOption(direction)
    await page.locator('#snake').setChecked(snake)
    await canvasNumbers(expected)
  }
  await page.locator('#numbering').selectOption('row')
  assert.equal(await page.locator('#direction').inputValue(), 'right-to-left')
  await page.locator('#direction').selectOption('left-to-right')
  for (const [field, value] of Object.entries({ moduleColumns: '3', moduleRows: '2', modulePixelWidth: '5', modulePixelHeight: '7' })) {
    await page.locator(`#${field}`).fill(value)
  }
  await page.waitForFunction(() => document.querySelector('#summary').textContent.includes('2,520'))
  assert.match(await page.locator('#summary').innerText(), /15 × 14 px/)
  assert.match(await page.locator('#summary').innerText(), /60 × 42 px/)
  await page.screenshot({ path: `${output}/alpha-rectangular.png` })

  const before = await labels()
  for (const invalid of ['', '0', '-1', '1.5', '9007199254740992', '1025']) {
    await page.locator('#columns').fill(invalid)
    assert.match(await page.locator('#preview-status').innerText(), /Changes not applied/)
    assert.deepEqual(await labels(), before)
    await page.locator('#columns').fill('4')
    assert.match(await page.locator('#preview-status').innerText(), /Preview up to date/)
  }
  await page.locator('#modulePixelWidth').fill('9007199254740991')
  assert.match(await page.locator('#error').innerText(), /Invalid cabinet configuration/)
  const errorBox = await page.locator('#error').boundingBox()
  assert.ok(errorBox && errorBox.y >= 0 && errorBox.y + errorBox.height <= await page.evaluate(() => window.innerHeight))
  await page.screenshot({ path: `${output}/alpha-invalid.png` })
  await page.locator('#modulePixelWidth').fill('5')

  for (const [columns, rows] of [['1', '1'], ['1', '5'], ['5', '1']]) {
    await page.locator('#columns').fill(columns)
    await page.locator('#rows').fill(rows)
    for (const [numbering, direction, snake] of cases) {
      await page.locator('#numbering').selectOption(numbering)
      await page.locator('#direction').selectOption(direction)
      await page.locator('#snake').setChecked(snake)
      assert.match(await page.locator('#preview-status').innerText(), /Preview up to date/)
      const values = await labels()
      assert.equal(values.length, Number(columns) * Number(rows))
      assert.equal(new Set(values.map(text => text.split('logical ')[1])).size, values.length)
    }
  }
  await page.locator('#columns').fill('4')
  await page.locator('#rows').fill('3')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 760))
  await page.waitForFunction(() => window.innerWidth <= 960)
  const client = await page.context().newCDPSession(page)
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
  await client.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 2, mobile: false })
  await page.waitForFunction(() => document.querySelector('canvas').width === Math.round(document.querySelector('canvas').getBoundingClientRect().width * 2))
  await page.screenshot({ path: `${output}/alpha-resize.png` })
  await client.send('Emulation.clearDeviceMetricsOverride')
  await page.locator('#columns').fill('32')
  await page.locator('#rows').fill('32')
  await page.waitForFunction(() => document.querySelector('#detail-note').textContent.includes('hidden at this scale'))
  assert.equal((await labels()).length, 1024)
  await page.locator('#moduleColumns').fill('65')
  assert.match(await page.locator('#error').innerText(), /65,536 modules/)
  assert.deepEqual(failures, [])
  console.log('Electron smoke passed: creation, 8 ordering modes, Canvas labels, rectangular layout, invalid input, limits, degenerate grids, resize and DPR=2.')
  console.log(`Screenshots: ${output}`)
} finally {
  await app.close()
}
