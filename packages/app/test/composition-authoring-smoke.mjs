import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function verifyCompositionAuthoring(page, { output, projectPath, exportDirectory, runExport }) {
  const first = (await page.evaluate(() => window.__ledmap.dump()))[0]
  assert.ok(first)
  await page.locator('#arrow-step').fill('7')
  await page.locator('#arrow-step').blur()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  assert.equal((await page.evaluate(() => window.__ledmap.dump()))[0].x, first.x + 77)
  await page.locator('#undo-project').click()
  assert.equal((await page.evaluate(() => window.__ledmap.dump()))[0].x, first.x + 7)
  await page.locator('#undo-project').click()
  assert.equal((await page.evaluate(() => window.__ledmap.dump()))[0].x, first.x)
  assert.equal(await page.evaluate(() => localStorage.getItem('ledmap.arrowStep.v1')), '7')

  assert.equal(await page.locator('#screen-drawing-color').count(), 1)
  for (const palette of ['white-grid', 'checkerboard', 'gray-gradient', 'rgb-bars']) {
    await page.locator('#screen-drawing-palette').selectOption(palette)
    assert.equal(await page.locator('#screen-drawing-color').count(), 0, `Color is hidden for ${palette}`)
  }
  await page.locator('#screen-drawing-palette').selectOption('screen-color')
  assert.equal(await page.locator('#screen-drawing-color').count(), 1)
  await page.locator('#screen-drawing-labels').selectOption('none')
  await page.locator('#screen-drawing-palette').selectOption('checkerboard')
  await page.locator('#screen-drawing-checkerColors-add').click()
  await page.locator('#screen-drawing-checkerColors-add').click()
  for (const [index, color] of ['#ff0000', '#00ff00', '#0000ff', '#ffff00'].entries()) {
    await page.locator('#screen-drawing-checkerColors-' + index).fill(color)
    await page.locator('#screen-drawing-checkerColors-' + index).blur()
  }
  await page.locator('#fit-project').click()
  const checkerSeam = async () => page.evaluate(value => {
    const canvas = document.querySelector('#project-canvas')
    const point = window.__ledmap.projectToPx({ x: value.x + value.cabinetWidth, y: value.y + value.cabinetHeight / 2 })
    const ratio = window.devicePixelRatio
    return [...canvas.getContext('2d').getImageData(Math.round(point.x * ratio), Math.round(point.y * ratio), 1, 1).data]
  }, first)
  const checkerBorderOn = await checkerSeam()
  await page.getByLabel('Screen cabinet lines', { exact: true }).click()
  const checkerBorderOff = await checkerSeam()
  assert.notDeepEqual(checkerBorderOff, checkerBorderOn, `Checkerboard seam changes: on=${checkerBorderOn}, off=${checkerBorderOff}`)
  assert.ok([[255, 0, 0, 255], [0, 255, 0, 255]].some(color =>
    color.every((channel, index) => channel === checkerBorderOff[index])), 'Checkerboard colors meet without a line')
  await page.getByLabel('Screen cabinet lines', { exact: true }).click()
  const open = async selector => {
    const details = page.locator('details.property-disclosure').filter({ has: page.locator(selector) })
    if (await details.getAttribute('open') === null) await details.locator('summary').click()
  }
  await open('#screen-guide-diagonals')
  const guidePixels = async axis => page.evaluate(({ value, axis }) => {
    const canvas = document.querySelector('#project-canvas')
    const point = window.__ledmap.projectToPx(axis === 'horizontal'
      ? { x: value.x + value.cabinetWidth / 2, y: value.y + value.height / 2 }
      : { x: value.x + value.width / 2, y: value.y + value.cabinetHeight / 2 })
    const ratio = window.devicePixelRatio
    const x = Math.round(point.x * ratio)
    const y = Math.round(point.y * ratio)
    const horizontal = axis === 'horizontal'
    return [...canvas.getContext('2d').getImageData(
      x - (horizontal ? 8 : 2), y - (horizontal ? 2 : 8),
      horizontal ? 16 : 5, horizontal ? 5 : 16).data]
  }, { value: first, axis })
  const horizontalBefore = await guidePixels('horizontal')
  const verticalBefore = await guidePixels('vertical')
  await page.locator('#screen-guide-horizontalCenter').click()
  await page.locator('#screen-guide-verticalCenter').click()
  assert.notDeepEqual(await guidePixels('horizontal'), horizontalBefore, 'Horizontal center is visible')
  assert.notDeepEqual(await guidePixels('vertical'), verticalBefore, 'Vertical center is visible above Cabinet lines')
  await page.locator('#screen-guide-diagonals').click()
  await page.locator('#screen-guide-centralCircle').click()
  await open('#screen-info-enabled')
  await page.locator('#screen-info-enabled').click()
  await page.locator('#screen-info-position').selectOption('bottom-left')
  await page.locator('#screen-info-aspectRatio').click()
  await page.locator('#screen-info-canvasPosition').click()
  await page.locator('#fit-project').click()
  await page.evaluate(() => {
    window.__infoDraws = []
    window.__infoOriginalFillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
      window.__infoDraws.push({ text, x, y })
      return window.__infoOriginalFillText.call(this, text, x, y, ...rest)
    }
  })
  let badge = null
  for (let attempt = 0; attempt < 5 && !badge; attempt += 1) {
    await page.evaluate(() => { window.__infoDraws = [] })
    await page.locator('#zoom-out').click()
    badge = await page.evaluate(() => window.__infoDraws.find(draw => draw.text === 'Info' || draw.text === 'i'))
  }
  assert.ok(badge, 'Small zoom shows a readable Info badge')
  const canvasRect = await page.locator('#project-canvas').boundingBox()
  await page.locator('#project-canvas').hover({ position: { x: badge.x, y: badge.y } })
  const badgeTitle = await page.locator('#project-canvas').getAttribute('title')
  assert.match(badgeTitle ?? '', /Resolution: 512/, `Info badge hover at ${JSON.stringify({ badge, canvasRect })}`)
  await page.evaluate(() => {
    CanvasRenderingContext2D.prototype.fillText = window.__infoOriginalFillText
    delete window.__infoOriginalFillText
    delete window.__infoDraws
  })
  await page.locator('#fit-project').click()

  const logoBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 16
    const context = canvas.getContext('2d')
    context.fillStyle = '#ff0000'
    context.fillRect(0, 0, 32, 16)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const logoPath = resolve(output, 'composition-authoring-logo.png')
  await writeFile(logoPath, Buffer.from(logoBase64, 'base64'))
  await open('#screen-drawing-logo-file')
  await page.locator('#screen-drawing-logo-file').setInputFiles(logoPath)
  await page.waitForFunction(() => /^32 . 16 px$/.test(document.querySelector('#screen-drawing-logo-summary')?.textContent ?? ''))
  await page.locator('#screen-logo-width').fill('64')
  await page.locator('#screen-logo-width').blur()
  await page.locator('#screen-logo-position').selectOption('bottom-right')
  await page.locator('#screen-logo-opacity').fill('50')
  await page.locator('#screen-logo-opacity').blur()
  assert.match(await page.locator('#screen-drawing-logo-summary').innerText(), /32.*16/)
  assert.match(await page.locator('.screen-drawing-logo').innerText(), /Displayed: 64.*32/)
  await page.screenshot({ path: resolve(output, 'composition-authoring.png') })

  await page.locator('#save-project').click()
  await page.waitForFunction(() => window.__ledmap.document().dirty === false)
  const saved = JSON.parse(await readFile(projectPath, 'utf8'))
  const style = saved.extensions['ledmap.compositionChart'].screenStyles[first.id]
  assert.deepEqual(style.checkerColors, ['#ff0000', '#00ff00', '#0000ff', '#ffff00'])
  assert.equal(style.guides.diagonals, true)
  assert.equal(style.guides.centralCircle, true)
  assert.equal(style.information.enabled, true)
  assert.equal(style.information.position, 'bottom-left')
  assert.deepEqual(style.logoLayout, { position: 'bottom-right', width: 64, opacity: 50 })
  assert.equal(saved.extensions['ledmap.compositionChart'].frameMode, 'fit')
  await page.locator('#open-project').click()
  await page.locator('#project-tree [role="treeitem"]').filter({ hasText: 'Screen 1' }).click()
  assert.equal(await page.locator('#screen-drawing-palette').inputValue(), 'checkerboard')
  assert.equal(await page.locator('#screen-info-enabled').getAttribute('aria-pressed'), 'true')
  assert.equal(await page.locator('#screen-logo-opacity').inputValue(), '50')

  await page.locator('#export-mode').click()
  await page.locator('#export-png-scope').selectOption('composition')
  await page.locator('#export-png-pattern').selectOption('composition-chart')
  await runExport(page, '#export-svg-run', 'Exported 1 SVG')
  const svg = await readFile(resolve(exportDirectory, 'screen-drawings.svg'), 'utf8')
  assert.match(svg, /<circle /)
  assert.match(svg, /Resolution: 512/)
  assert.match(svg, /<image [^>]*width="64" height="32" opacity="0.5"/)
  await runExport(page, '#export-png-run', 'Exported 1 PNG')
  const png = await readFile(resolve(exportDirectory, 'screen-drawings.png'))
  assert.deepEqual({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }, { width: 1152, height: 384 })
  const colors = await page.evaluate(async base64 => {
    const image = new Image()
    image.src = 'data:image/png;base64,' + base64
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    return [[30, 20], [158, 20], [30, 148], [158, 148]]
      .map(([x, y]) => [...context.getImageData(x, y, 1, 1).data])
  }, png.toString('base64'))
  assert.deepEqual(colors, [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 0, 255]])
  await page.locator('#layout-mode').click()
  await page.locator('#project-tree [role="treeitem"]').filter({ hasText: 'Screen 1' }).click()
  await page.getByLabel('Screen Columns', { exact: true }).fill('5')
  await page.getByLabel('Screen Columns', { exact: true }).blur()
  assert.equal((await page.evaluate(() => window.__ledmap.dump()))[0].columns, 5)
  await open('input[aria-label="New Saved LED name"]')
  await page.locator('input[aria-label="New Saved LED name"]').fill('Checker LED')
  await page.getByRole('button', { name: 'Save new Saved LED' }).click()
  await page.waitForFunction(async () => (await window.ledmapDesktop.loadPresetLibrary(null)).cabinets.some(value => value.name === 'Checker LED'))
  await open('input[aria-label="New Drawing preset name"]')
  await page.locator('input[aria-label="New Drawing preset name"]').fill('Checker drawing')
  await page.getByRole('button', { name: 'Save new Drawing preset' }).click()
  await page.waitForFunction(async () => (await window.ledmapDesktop.loadPresetLibrary(null)).drawings.some(value => value.name === 'Checker drawing'))
  const library = await page.evaluate(() => window.ledmapDesktop.loadPresetLibrary(null))
  const savedLED = library.cabinets.find(value => value.name === 'Checker LED')
  const savedDrawing = library.drawings.find(value => value.name === 'Checker drawing')
  assert.equal(savedLED.legacyGrid, undefined)
  assert.equal(savedLED.moduleColumns * savedLED.modulePixelWidth, first.cabinetWidth)
  assert.equal(savedDrawing.drawing.palette, 'checkerboard')
  assert.equal(savedDrawing.drawing.guides.horizontalCenter, true)
  assert.deepEqual([savedDrawing.drawing.logo.width, savedDrawing.drawing.logo.height], [32, 16])
  await page.locator('#add-screen').click()
  await page.locator('#new-screen-columns').fill('5')
  await page.locator('#new-screen-led-preset').selectOption({ label: 'Checker LED' })
  await page.locator('#new-screen-drawing-preset').selectOption({ label: 'Checker drawing' })
  assert.equal(await page.locator('#new-screen-columns').inputValue(), '5')
  assert.equal(await page.locator('#new-screen-rows').inputValue(), '3')
  assert.equal(await page.locator('#new-screen-palette').inputValue(), 'checkerboard')
  await page.locator('#screen-form button[type="submit"]').click()
  await page.waitForFunction(() => window.__ledmap.dump().length === 3)
  const created = (await page.evaluate(() => window.__ledmap.dump()))[2]
  assert.deepEqual([created.columns, created.rows], [5, 3])
  await page.locator(`#project-tree [data-id="${created.id}"]`).click()
  assert.equal(await page.locator('#screen-drawing-palette').inputValue(), 'checkerboard')
  assert.equal(await page.locator('#screen-drawing-checkerColors-2').inputValue(), '#0000ff')
  await open('#screen-guide-horizontalCenter')
  assert.equal(await page.locator('#screen-guide-horizontalCenter').getAttribute('aria-pressed'), 'true')
  await open('#screen-drawing-logo-file')
  assert.match(await page.locator('#screen-drawing-logo-summary').innerText(), /32.*16/)
  await page.locator('#screen-drawing-palette').selectOption('screen-color')
  await open('#screen-drawing-preset')
  await page.locator('#screen-drawing-preset').selectOption({ label: 'Checker drawing' })
  await page.getByRole('button', { name: 'Apply Drawing preset' }).click()
  assert.equal(await page.locator('#screen-drawing-palette').inputValue(), 'checkerboard')
  await page.getByLabel('Screen Module Pixel Width', { exact: true }).fill('16')
  await page.getByLabel('Screen Module Pixel Width', { exact: true }).blur()
  assert.equal((await page.evaluate(() => window.__ledmap.dump()))[2].cabinetWidth, 64)
  await open('#screen-led-preset')
  await page.locator('#screen-led-preset').selectOption({ label: 'Checker LED' })
  await page.getByRole('button', { name: 'Apply Saved LED' }).click()
  assert.equal((await page.evaluate(() => window.__ledmap.dump()))[2].cabinetWidth, 128)
  await page.locator('#screen-drawing-palette').selectOption('white-grid')
  assert.equal(await page.locator('#screen-drawing-preset').inputValue(), savedDrawing.id)
  await open('#screen-drawing-preset')
  await page.locator('#screen-drawing-preset').selectOption({ label: 'Checker drawing' })
  await page.getByRole('button', { name: 'Update Drawing preset' }).click()
  await page.waitForFunction(async () => (await window.ledmapDesktop.loadPresetLibrary(null)).drawings
    .some(value => value.name === 'Checker drawing' && value.drawing.palette === 'white-grid'))
  await open('#screen-led-preset')
  await page.locator('#screen-led-preset').selectOption({ label: 'Checker LED' })
  await page.locator('input[aria-label="New Saved LED name"]').fill('Checker LED renamed')
  await page.getByRole('button', { name: 'Rename Saved LED' }).click()
  await page.waitForFunction(async () => (await window.ledmapDesktop.loadPresetLibrary(null)).cabinets
    .some(value => value.name === 'Checker LED renamed'))
  await open('#screen-led-preset')
  await page.locator('#screen-led-preset').selectOption({ label: 'Checker LED renamed' })
  await page.getByRole('button', { name: 'Delete Saved LED' }).click()
  assert.equal((await page.evaluate(() => window.ledmapDesktop.loadPresetLibrary(null))).cabinets.length, 1)
  await page.getByRole('button', { name: 'Delete Saved LED' }).click()
  await page.waitForFunction(async () => (await window.ledmapDesktop.loadPresetLibrary(null)).cabinets.length === 0)
  assert.equal((await page.evaluate(() => window.__ledmap.dump()))[2].cabinetWidth, 128)
  await page.locator('#add-screen').click()
  await page.locator('#new-screen-drawing-preset').selectOption({ label: 'Checker drawing' })
  await page.locator('#new-screen-drawing-delete').click()
  assert.equal((await page.evaluate(() => window.ledmapDesktop.loadPresetLibrary(null))).drawings.length, 1)
  await page.locator('#new-screen-drawing-delete').click()
  await page.waitForFunction(async () => (await window.ledmapDesktop.loadPresetLibrary(null)).drawings.length === 0)
  await page.locator('#screen-cancel').click()
  console.log('Composition authoring passed: arrow step, palette, guides, information, logo, save/open, PNG/SVG, preset save/apply.')
}
