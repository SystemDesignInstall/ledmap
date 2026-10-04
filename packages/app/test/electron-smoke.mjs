import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

process.on('uncaughtException', error => {
  console.error(error)
  process.exit(1)
})
process.on('unhandledRejection', error => {
  console.error(error)
  process.exit(1)
})

const appRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
const output = fileURLToPath(new URL('../out/smoke/', import.meta.url))
const projectPath = resolve(output, 'document-lifecycle.ledmap')
const exportDirectory = resolve(output, 'exports')
const exportFiles = [
  'test-checkerboard.png',
  'test-checkerboard-Screen-1-screen-1.png',
  'test-checkerboard-Screen-2-screen-2.png',
  'test-checkerboard-Screen-3-screen-3.png',
  'ledmap-generic-mapping.json',
  'ledmap-generic-mapping.csv',
  'ledmap-generic-mapping-screen-2.json',
]
await mkdir(output, { recursive: true })
const smokeUserData = await mkdtemp(resolve(output, 'user-data-'))
await mkdir(exportDirectory, { recursive: true })
await rm(projectPath, { force: true })
await Promise.all(exportFiles.map(name => rm(resolve(exportDirectory, name), { force: true })))

const env = {
  ...process.env,
  LEDMAP_SMOKE_PROJECT_PATH: projectPath,
  LEDMAP_SMOKE_USER_DATA: smokeUserData,
  LEDMAP_SMOKE_UNSAVED_ACTION: 'discard',
  LEDMAP_SMOKE_SIMULATED_DISPLAYS: '1',
  LEDMAP_SMOKE_EXPORT_DIR: exportDirectory,
}
delete env['ELECTRON_RUN_AS_NODE']
delete env['ELECTRON_RENDERER_URL']
const failures = []

async function launch() {
  const app = await electron.launch({ args: [appRoot], env })
  const page = await app.firstWindow()
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', message => { if (message.type() === 'error') failures.push(message.text()) })
  await page.waitForLoadState('domcontentloaded')
  try {
    await page.waitForFunction(() => window.__ledmap !== undefined)
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : error}\n${failures.join('\n')}`)
  }
  return { app, page }
}

async function close(application) {
  const child = application.process()
  if (application.windows().length > 0) {
    const requestExit = application.evaluate(({ app }) => {
      setTimeout(() => app.exit(0), 0)
      return true
    }).catch(() => false)
    await Promise.race([
      requestExit,
      new Promise(resolvePromise => setTimeout(resolvePromise, 500)),
    ])
  }
  const deadline = Date.now() + 3000
  while (child.exitCode === null && Date.now() < deadline) {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 25))
  }
  if (child.exitCode === null) child.kill()
}

async function setScreenPosition(page, screenName, x, y) {
  await page.locator('#project-tree [role="treeitem"]').filter({ hasText: screenName }).click()
  const xInput = page.locator('input[aria-label="Screen X position"]')
  const yInput = page.locator('input[aria-label="Screen Y position"]')
  await xInput.fill(String(x))
  await xInput.blur()
  await yInput.fill(String(y))
  await yInput.blur()
}

async function addScreen(page) {
  const before = await page.evaluate(() => window.__ledmap.dump().length)
  await page.locator('#add-screen').click()
  await page.locator('#screen-dialog').waitFor({ state: 'visible' })
  assert.equal(await page.locator('#new-screen-module-columns').inputValue(), '1')
  assert.equal(await page.locator('#new-screen-module-rows').inputValue(), '1')
  await page.locator('#new-screen-module-columns').fill('4')
  await page.locator('#new-screen-module-rows').fill('4')
  await page.locator('#screen-form button[type="submit"]').click()
  await page.waitForFunction(count => window.__ledmap.dump().length === count + 1, before)
}

async function setMappingGeometry(page, values) {
  const fields = [
    ['Mapping Region X', values.x],
    ['Mapping Region Y', values.y],
    ['Mapping Region Width', values.width],
    ['Mapping Region Height', values.height],
  ]
  for (const [label, value] of fields) {
    if (value === undefined) continue
    const input = page.locator(`input[aria-label="${label}"]`)
    await input.fill(String(value))
    await input.blur()
  }
}

async function setOutputRegion(page, outputId, values) {
  for (const [key, value] of Object.entries(values)) {
    const input = page.locator(`[data-output-id="${outputId}"] input[aria-label="${outputId} source ${key}"]`)
    await input.fill(String(value))
    await input.blur()
  }
}

async function sha256(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

async function jsonRowsAt(filePath, indexes) {
  const targets = new Set(indexes)
  const rows = new Map()
  const stream = createReadStream(filePath, { encoding: 'utf8' })
  let buffer = ''
  for await (const chunk of stream) {
    buffer += chunk
    for (const index of targets) {
      if (rows.has(index)) continue
      const marker = `,"dataIndex":${index}}`
      const end = buffer.indexOf(marker)
      if (end < 0) continue
      const start = buffer.lastIndexOf('{"inputCanvas"', end)
      if (start >= 0) rows.set(index, JSON.parse(buffer.slice(start, end + marker.length)))
    }
    if (rows.size === targets.size) break
    if (buffer.length > 16384) buffer = buffer.slice(-8192)
  }
  return rows
}

async function csvRowsAt(filePath, indexes) {
  const targets = new Set(indexes)
  const rows = new Map()
  const stream = createReadStream(filePath, { encoding: 'utf8' })
  let pending = ''
  for await (const chunk of stream) {
    pending += chunk
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      const columns = line.split(',')
      const dataIndex = Number(columns[15])
      if (targets.has(dataIndex)) rows.set(dataIndex, columns)
    }
    if (rows.size === targets.size) break
  }
  return rows
}

async function runExport(page, selector, resultPattern, timeout = 120000) {
  await page.locator(selector).click()
  await page.waitForFunction(value => document.querySelector(value)?.disabled === true, selector)
  await page.waitForFunction(({ value, pattern }) => {
    const button = document.querySelector(value)
    return button?.disabled === false && new RegExp(pattern).test(window.__ledmapExport.dump().lastResult)
  }, { value: selector, pattern: resultPattern }, { timeout })
}

function pngSize(bytes) {
  assert.deepEqual([...bytes.subarray(1, 4)], [80, 78, 71])
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

let running = await launch()
const electronRuntime = await running.app.evaluate(() => ({
  electron: process.versions.electron,
  node: process.versions.node,
  uv: process.versions.uv,
  platform: process.platform,
}))
console.log(`Electron runtime: ${JSON.stringify(electronRuntime)}`)
try {
  const page = running.page
  const dump = async () => page.evaluate(() => window.__ledmap.dump())
  const documentState = async () => page.evaluate(() => window.__ledmap.document())
  const windowTitle = async () => running.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle())

  assert.equal((await dump()).length, 0)
  assert.equal(await page.locator('#empty h2').innerText(), 'No screens yet')
  assert.match(await page.locator('#empty').innerText(), /Add your first Screen/)
  assert.equal((await documentState()).dirty, false)
  assert.match(await page.locator('.mode-switcher').innerText(), /Composition\s+Mapping\s+Output Mapping\s+Hardware\s+Test\s+Export/)
  assert.equal((await page.locator('.mode-switcher .mode:disabled').count()), 0)
  assert.doesNotMatch(await page.locator('body').innerText(), /ALPHA|In-memory session/)
  await page.locator('#test-mode').click()
  await page.locator('#test-workspace').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-test-pattern="white"]').isEnabled(), true)
  assert.equal(await page.locator('[data-test-pattern="receiver-labels"]').isDisabled(), true)
  assert.match(await page.locator('[data-test-pattern="receiver-labels"]').getAttribute('title'), /Hardware|Cabinet assignment/i)
  assert.equal(await page.locator('#test-scope option[value="receiver"]').isDisabled(), true)
  await page.locator('#layout-mode').click()

  await page.locator('#new-project').click()
  await addScreen(page)
  await addScreen(page)
  await addScreen(page)
  await addScreen(page)
  await addScreen(page)
  assert.deepEqual((await dump()).map(screen => screen.name), ['Screen 1', 'Screen 2', 'Screen 3', 'Screen 4', 'Screen 5'])

  await setScreenPosition(page, 'Screen 1', -240, 80)
  await setScreenPosition(page, 'Screen 2', 640, -120)
  await page.locator('#project-tree [data-type="screen"]').filter({ hasText: 'Screen 3' }).click()
  await page.locator('input[aria-label="Screen Columns"]').fill('5')
  await page.locator('input[aria-label="Screen Columns"]').blur()
  const orderBefore = await page.evaluate(() => window.__ledmap.dump().map(screen => screen.order))
  const idsBefore = await page.evaluate(() => window.__ledmap.dump().map(screen => screen.cabinets.map(cabinet => cabinet.id)))
  assert.equal(await page.locator('select[aria-label="Screen Numbering"]').count(), 0)
  assert.equal(await page.locator('select[aria-label="Screen Direction"]').count(), 0)
  assert.equal(await page.locator('button[aria-label="Screen Snake"]').count(), 0)
  assert.equal(await page.locator('[data-overlay="signal"]').count(), 0)
  assert.ok(!/Numbering|Direction|Snake|Logical order|Signal/.test(await page.locator('#properties').innerText()))
  for (const [modeId, modeText] of [
    ['layout-mode', 'Composition'], ['mapping-mode', 'Mapping'], ['output-mapping-mode', 'Output Mapping'],
    ['hardware-mode', 'Hardware'], ['test-mode', 'Test'], ['export-mode', 'Export'],
  ]) {
    assert.equal(await page.locator(`#${modeId}`).innerText(), modeText)
  }
  for (const actionId of ['new-project', 'open-project', 'undo-project', 'redo-project', 'save-project', 'save-project-as']) {
    assert.equal(await page.locator(`#${actionId}`).count(), 1)
  }
  assert.match(await page.locator('#layout-workspace .canvas-heading .eyebrow').innerText(), /COMPOSITION WORKSPACE/)
  assert.deepEqual(await page.evaluate(() => window.__ledmap.dump().map(screen => screen.order)), orderBefore)
  assert.deepEqual(await page.evaluate(() => window.__ledmap.dump().map(screen => screen.cabinets.map(cabinet => cabinet.id))), idsBefore)

  const screenNode = name => page.locator('#project-tree [data-type="screen"]').filter({ hasText: name })
  await screenNode('Screen 1').click()
  await screenNode('Screen 2').click({ modifiers: ['Control'] })
  await screenNode('Screen 3').click({ modifiers: ['Control'] })
  assert.deepEqual(await page.evaluate(() => window.__ledmap.selectedScreens()), ['screen-1', 'screen-2', 'screen-3'])
  await page.locator('[data-align="left"]').click()
  let arranged = await dump()
  assert.equal(arranged[0].x, arranged[1].x)
  assert.equal(arranged[1].x, arranged[2].x)
  await page.locator('[data-distribute="vertical"]').click()
  const beforeNudge = await dump()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  arranged = await dump()
  for (const index of [0, 1, 2]) {
    assert.equal(arranged[index].x, beforeNudge[index].x + 1)
    assert.equal(arranged[index].y, beforeNudge[index].y + 10)
  }

  await setScreenPosition(page, 'Screen 4', -777, 333)
  assert.deepEqual((await dump()).slice(3, 4).map(screen => [screen.x, screen.y]), [[-777, 333]])
  await setScreenPosition(page, 'Screen 1', -600, 0)
  await setScreenPosition(page, 'Screen 2', 100, 0)
  await screenNode('Screen 1').click()
  await page.locator('#snap-grid').click()
  assert.deepEqual(await page.evaluate(() => window.__ledmap.snap()), {
    enabled: true, sources: { grid: true, edges: true, centers: true, guides: true }, step: 10,
  })
  await page.locator('#fit-project').click()
  const canvasBox = await page.locator('#project-canvas').boundingBox()
  assert.ok(canvasBox)
  const snapDrag = await page.evaluate(() => {
    const screens = window.__ledmap.dump()
    const moving = screens.find(screen => screen.id === 'screen-1')
    const target = screens.find(screen => screen.id === 'screen-2')
    if (!moving || !target) throw new Error('Smart Snap smoke Screens are missing.')
    const expectedX = target.x - moving.width
    const deltaX = expectedX - moving.x
    return {
      start: window.__ledmap.screenCenterPx(moving.id),
      end: window.__ledmap.projectToPx({
        x: moving.x + moving.width / 2 + deltaX,
        y: moving.y + moving.height / 2,
      }),
      expectedX,
      guideX: target.x,
    }
  })
  assert.equal(snapDrag.guideX, 100)
  await page.mouse.move(canvasBox.x + snapDrag.start.x, canvasBox.y + snapDrag.start.y)
  await page.mouse.down()
  await page.mouse.move(canvasBox.x + snapDrag.end.x, canvasBox.y + snapDrag.end.y, { steps: 5 })
  await page.waitForFunction(({ guideX, expectedX }) => (
    window.__ledmap.guides().some(guide => guide.axis === 'x' && guide.value === guideX)
    && window.__ledmap.dump().find(screen => screen.id === 'screen-1')?.x === expectedX
  ), snapDrag)
  assert.ok((await page.evaluate(() => window.__ledmap.guides())).some(guide => guide.axis === 'x' && guide.value === 100))
  assert.equal((await dump()).find(screen => screen.id === 'screen-1')?.x, snapDrag.expectedX)
  await page.mouse.up()
  await page.waitForFunction(expectedX => (
    window.__ledmap.dump().find(screen => screen.id === 'screen-1')?.x === expectedX
  ), snapDrag.expectedX)
  const committedScreen = (await dump()).find(screen => screen.id === 'screen-1')
  assert.equal(committedScreen?.x, snapDrag.expectedX)
  assert.equal(Number.isSafeInteger(committedScreen?.x), true)

  await screenNode('Screen 5').click()
  await page.locator('#rename-screen').click()
  const nameInput = page.locator('input[aria-label="Screen name"]')
  await nameInput.fill('Stage Right')
  await nameInput.blur()
  assert.equal((await dump())[4].name, 'Stage Right')
  await page.locator('#duplicate-screen').click()
  assert.equal((await dump()).length, 6)
  assert.equal((await dump())[5].name, 'Stage Right Copy')
  await page.locator('#delete-screen').click()
  assert.equal((await dump()).length, 5)

  await page.locator('[data-overlay="modules"]').click()
  assert.equal(await page.locator('[data-overlay="modules"]').getAttribute('aria-pressed'), 'true')
  assert.equal(await page.locator('[data-overlay="signal"]').count(), 0)
  await page.evaluate(() => {
    const proto = CanvasRenderingContext2D.prototype
    if (!proto.fillText.__ledmapWrapped) {
      const original = proto.fillText
      const wrapped = function (...args) {
        window.__drawnText = window.__drawnText ?? []
        window.__drawnText.push(args[0])
        return original.apply(this, args)
      }
      wrapped.__ledmapWrapped = true
      proto.fillText = wrapped
    }
    window.__drawnText = []
  })
  await page.locator('#fit-project').click()
  await page.locator('#actual-size').click()
  const drawnText = await page.evaluate(() => [...new Set(window.__drawnText ?? [])].filter(text => typeof text === 'string'))
  assert.ok(drawnText.some(text => /C\d{2}/.test(text)), 'cabinet identities render without signal order')
  assert.equal(drawnText.filter(text => text.startsWith('#')).length, 0)
  await page.locator('#fit-project').click()
  await page.locator('#actual-size').click()
  assert.equal((await page.evaluate(() => window.__ledmap.camera())).zoom, 1)
  await page.locator('#zoom-in').click()
  assert.ok((await page.evaluate(() => window.__ledmap.camera())).zoom > 1)
  await page.locator('#fit-project').click()
  assert.equal(await page.evaluate(() => window.scrollY), 0)
  await page.screenshot({ path: resolve(output, 'layout-workspace.png') })

  const expected = await dump()
  assert.equal(expected.length, 5)
  assert.equal(expected[2].columns, 5)
  assert.equal(expected[2].numbering, 'row')
  assert.equal(expected[2].snake, true)
  assert.equal((await documentState()).dirty, true)
  assert.match(await windowTitle(), /Untitled\.ledmap \*/)

  await page.locator('#save-project').click()
  await page.waitForFunction(() => window.__ledmap.document().dirty === false)
  assert.equal((await documentState()).currentFilePath, projectPath)
  assert.doesNotMatch(await windowTitle(), / \*/)
  const stored = JSON.parse(await readFile(projectPath, 'utf8'))
  assert.equal(stored.schemaVersion, 4)
  assert.equal(stored.project.design.screens.length, 5)
  assert.deepEqual(
    stored.project.design.composition.placements.map(entry => [entry.x, entry.y]),
    expected.map(screen => [screen.x, screen.y]),
  )

  await setScreenPosition(page, 'Screen 1', -999, 999)
  assert.equal((await documentState()).dirty, true)
  await page.locator('#open-project').click()
  await page.waitForFunction(() => window.__ledmap.document().dirty === false)
  assert.deepEqual(await dump(), expected)

  await page.locator('#new-project').click()
  await page.waitForFunction(() => window.__ledmap.dump().length === 0)
  assert.equal((await documentState()).currentFilePath, null)
  await page.locator('#open-project').click()
  await page.waitForFunction(() => window.__ledmap.dump().length === 5)
  assert.deepEqual(await dump(), expected)

  await setScreenPosition(page, 'Screen 3', 333, -333)
  assert.equal((await documentState()).dirty, true)
  const closed = page.waitForEvent('close')
  await running.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  await closed
  await close(running.app)
  running = await launch()
  assert.equal((await running.page.evaluate(() => window.__ledmap.dump())).length, 0)
  await running.page.locator('#open-project').click()
  await running.page.waitForFunction(() => window.__ledmap.dump().length === 5)
  assert.deepEqual(await running.page.evaluate(() => window.__ledmap.dump()), expected)

  const mappingPage = running.page
  await mappingPage.locator('#new-project').click()
  await mappingPage.waitForFunction(() => window.__ledmap.dump().length === 0)
  await addScreen(mappingPage)
  await addScreen(mappingPage)
  await addScreen(mappingPage)
  await setScreenPosition(mappingPage, 'Screen 1', 100, 100)
  await setScreenPosition(mappingPage, 'Screen 2', 700, 100)
  await setScreenPosition(mappingPage, 'Screen 3', 100, 600)
  const layoutBeforeMapping = await mappingPage.evaluate(() => window.__ledmap.dump().map(screen => ({ id: screen.id, x: screen.x, y: screen.y })))

  await mappingPage.locator('#mapping-mode').click()
  await mappingPage.locator('#mapping-workspace').waitFor({ state: 'visible' })
  assert.equal(await mappingPage.locator('#layout-workspace').isHidden(), true)
  await mappingPage.locator('#mapping-input-width').fill('1920')
  await mappingPage.locator('#mapping-input-height').fill('1080')
  await mappingPage.locator('#mapping-apply-input').click()
  assert.deepEqual(await mappingPage.evaluate(() => window.__ledmapMapping.dump().inputCanvas), { width: 1920, height: 1080 })

  await mappingPage.locator('#mapping-tree [data-screen-id="screen-1"]').click()
  await mappingPage.locator('#mapping-create-region').click()
  await setMappingGeometry(mappingPage, { x: 80, y: 70 })
  await mappingPage.locator('#mapping-tree [data-screen-id="screen-2"]').click()
  await mappingPage.locator('#mapping-create-region').click()
  await setMappingGeometry(mappingPage, { x: 720, y: 90 })
  await mappingPage.locator('#mapping-tree [data-screen-id="screen-3"]').click()
  await mappingPage.locator('#mapping-create-region').click()
  await mappingPage.locator('#mapping-from-layout').click()
  assert.deepEqual(
    (await mappingPage.evaluate(() => window.__ledmapMapping.dump().regions))[2],
    { id: 'region-3', screen: 'screen-3', grid: 'grid-3', x: 100, y: 600, width: 512, height: 384, status: 'complete' },
  )
  await setMappingGeometry(mappingPage, { x: 300, y: 600 })

  let mappingDump = await mappingPage.evaluate(() => window.__ledmapMapping.dump())
  assert.equal(mappingDump.regions.length, 3)
  assert.deepEqual(mappingDump.regions.map(region => region.status), ['complete', 'complete', 'complete'])
  assert.notDeepEqual(
    mappingDump.regions.map(region => ({ id: region.screen, x: region.x, y: region.y })),
    layoutBeforeMapping,
  )

  await mappingPage.locator('#mapping-tree [data-region-id="region-1"]').click()
  await mappingPage.locator('#mapping-fit').click()
  const mappingCanvasBox = await mappingPage.locator('#mapping-canvas').boundingBox()
  assert.ok(mappingCanvasBox)
  let mappingCamera = await mappingPage.evaluate(() => window.__ledmapMapping.camera())
  let regionOne = (await mappingPage.evaluate(() => window.__ledmapMapping.dump().regions))[0]
  const dragStart = {
    x: mappingCanvasBox.x + (regionOne.x + regionOne.width / 2) * mappingCamera.zoom + mappingCamera.offsetX,
    y: mappingCanvasBox.y + (regionOne.y + regionOne.height / 2) * mappingCamera.zoom + mappingCamera.offsetY,
  }
  await mappingPage.mouse.move(dragStart.x, dragStart.y)
  await mappingPage.mouse.down()
  await mappingPage.mouse.move(dragStart.x + 60 * mappingCamera.zoom, dragStart.y + 30 * mappingCamera.zoom, { steps: 4 })
  await mappingPage.mouse.up()
  regionOne = (await mappingPage.evaluate(() => window.__ledmapMapping.dump().regions))[0]
  assert.equal(Number.isSafeInteger(regionOne.x) && Number.isSafeInteger(regionOne.y), true)
  assert.notDeepEqual([regionOne.x, regionOne.y], [80, 70])

  mappingCamera = await mappingPage.evaluate(() => window.__ledmapMapping.camera())
  const resizeStart = {
    x: mappingCanvasBox.x + (regionOne.x + regionOne.width) * mappingCamera.zoom + mappingCamera.offsetX,
    y: mappingCanvasBox.y + (regionOne.y + regionOne.height) * mappingCamera.zoom + mappingCamera.offsetY,
  }
  await mappingPage.mouse.move(resizeStart.x, resizeStart.y)
  await mappingPage.mouse.down()
  await mappingPage.mouse.move(resizeStart.x + 40 * mappingCamera.zoom, resizeStart.y + 24 * mappingCamera.zoom, { steps: 4 })
  await mappingPage.mouse.up()
  const resized = (await mappingPage.evaluate(() => window.__ledmapMapping.dump().regions))[0]
  assert.ok(resized.width > 512 && resized.height > 384)
  assert.equal(resized.status, 'invalid')
  await setMappingGeometry(mappingPage, { x: 120, y: 80, width: 512, height: 384 })

  mappingCamera = await mappingPage.evaluate(() => window.__ledmapMapping.camera())
  const inspectPoint = { x: 130, y: 100 }
  await mappingPage.mouse.click(
    mappingCanvasBox.x + inspectPoint.x * mappingCamera.zoom + mappingCamera.offsetX,
    mappingCanvasBox.y + inspectPoint.y * mappingCamera.zoom + mappingCamera.offsetY,
  )
  const inspectorText = await mappingPage.locator('#mapping-properties').innerText()
  assert.match(inspectorText, /Input X\/Y\s+130, 100/)
  assert.match(inspectorText, /Screen X\/Y\s+10, 20/)
  assert.match(inspectorText, /Cabinet\s+screen-1\/C01/)
  assert.match(inspectorText, /Module\s+screen-1\/C01\/M1x1/)
  assert.match(inspectorText, /Hardware\s+Not configured/)

  await mappingPage.locator('input[aria-label="Reverse pixel X"]').fill('10')
  await mappingPage.locator('input[aria-label="Reverse pixel X"]').blur()
  await mappingPage.locator('input[aria-label="Reverse pixel Y"]').fill('20')
  await mappingPage.locator('input[aria-label="Reverse pixel Y"]').blur()
  await mappingPage.getByRole('button', { name: 'Locate on Input Canvas' }).click()
  assert.match(await mappingPage.locator('#mapping-properties').innerText(), /Input X\/Y\s+130, 100/)
  const forward = await mappingPage.evaluate(() => window.__ledmapMapping.forward('region-1', 130, 100))
  const reverse = await mappingPage.evaluate(pixel => window.__ledmapMapping.reverseModule(
    'region-1', pixel.cabinet, pixel.module, pixel.modulePixel.x, pixel.modulePixel.y,
  ), forward)
  assert.deepEqual(reverse, forward)

  mappingDump = await mappingPage.evaluate(() => window.__ledmapMapping.dump())
  await mappingPage.locator('#save-project').click()
  await mappingPage.waitForFunction(() => window.__ledmap.document().dirty === false)
  const mappingStored = JSON.parse(await readFile(projectPath, 'utf8'))
  assert.equal(mappingStored.project.content.inputCanvases[0].resolution.width, 1920)
  assert.equal(mappingStored.project.content.mappingRegions.length, 3)
  await mappingPage.locator('#new-project').click()
  await mappingPage.waitForFunction(() => window.__ledmapMapping.dump().regions.length === 0)
  await mappingPage.locator('#open-project').click()
  await mappingPage.waitForFunction(() => window.__ledmapMapping.dump().regions.length === 3)
  assert.deepEqual(await mappingPage.evaluate(() => window.__ledmapMapping.dump()), mappingDump)
  await mappingPage.locator('#mapping-tree [data-region-id="region-1"]').click()
  await mappingPage.locator('#mapping-fit').click()
  const reopenedCanvasBox = await mappingPage.locator('#mapping-canvas').boundingBox()
  const reopenedCamera = await mappingPage.evaluate(() => window.__ledmapMapping.camera())
  assert.ok(reopenedCanvasBox)
  await mappingPage.mouse.click(
    reopenedCanvasBox.x + 130 * reopenedCamera.zoom + reopenedCamera.offsetX,
    reopenedCanvasBox.y + 100 * reopenedCamera.zoom + reopenedCamera.offsetY,
  )
  await mappingPage.screenshot({ path: resolve(output, 'mapping-workspace.png') })

  await mappingPage.locator('#hardware-mode').click()
  await mappingPage.locator('#hardware-workspace').waitFor({ state: 'visible' })
  assert.equal(await mappingPage.locator('#mapping-workspace').isHidden(), true)
  assert.match(await mappingPage.locator('#hardware-tree').innerText(), /Add a Processor/)

  await mappingPage.locator('#hardware-add-processor').click()
  for (let portIndex = 1; portIndex <= 4; portIndex += 1) {
    await mappingPage.locator('[data-hardware-type="processor"][data-hardware-id="processor-1"]').click()
    await mappingPage.locator('#hardware-add-port').click()
    assert.equal(await mappingPage.locator('#hardware-add-receiver').isEnabled(), true)
    await mappingPage.locator('#hardware-add-receiver').click()
    await mappingPage.locator('#hardware-add-receiver').click()
  }
  await mappingPage.locator('#hardware-add-processor').click()
  await mappingPage.locator('[data-hardware-type="processor"][data-hardware-id="processor-2"]').click()
  await mappingPage.locator('#hardware-add-port').click()
  await mappingPage.locator('#hardware-add-receiver').click()

  let hardwareDump = await mappingPage.evaluate(() => window.__ledmapHardware.dump())
  assert.equal(hardwareDump.processors.length, 2)
  assert.equal(hardwareDump.ports.length, 5)
  assert.equal(hardwareDump.receivers.length, 9)
  assert.deepEqual(hardwareDump.processorOrder, ['processor-1', 'processor-2'])
  assert.equal(hardwareDump.unassigned.length, 36)

  await mappingPage.locator('[data-hardware-type="processor"][data-hardware-id="processor-2"]').click()
  await mappingPage.locator('#hardware-order-up').click()
  assert.deepEqual((await mappingPage.evaluate(() => window.__ledmapHardware.dump())).processorOrder, ['processor-2', 'processor-1'])
  await mappingPage.locator('#hardware-order-down').click()
  assert.deepEqual((await mappingPage.evaluate(() => window.__ledmapHardware.dump())).processorOrder, ['processor-1', 'processor-2'])

  await mappingPage.locator('[data-hardware-type="receiver"][data-hardware-id="receiver-1"]').click()
  await mappingPage.locator('[data-cabinet-id="screen-1/C01"]').click()
  await mappingPage.locator('[data-cabinet-id="screen-1/C02"]').click({ modifiers: ['Control'] })
  await mappingPage.locator('#hardware-assign').click()
  await mappingPage.locator('[data-hardware-type="receiver"][data-hardware-id="receiver-2"]').click()
  await mappingPage.locator('[data-cabinet-id="screen-2/C01"]').click()
  await mappingPage.locator('[data-cabinet-id="screen-2/C02"]').click({ modifiers: ['Control'] })
  await mappingPage.locator('#hardware-assign').click()
  hardwareDump = await mappingPage.evaluate(() => window.__ledmapHardware.dump())
  assert.deepEqual(hardwareDump.receivers[0].cabinets, ['screen-1/C01', 'screen-1/C02'])
  assert.deepEqual(hardwareDump.receivers[1].cabinets, ['screen-2/C01', 'screen-2/C02'])
  assert.equal(hardwareDump.unassigned.length, 32)

  const beforeAllocationPreview = hardwareDump
  await mappingPage.locator('#hardware-auto-allocate').click()
  await mappingPage.locator('#allocation-preview-dialog').waitFor({ state: 'visible' })
  assert.match(await mappingPage.locator('#allocation-preview-body').innerText(), /receiver-1[\s\S]*4 Cabinets/)
  assert.deepEqual(await mappingPage.evaluate(() => window.__ledmapHardware.dump()), beforeAllocationPreview)
  await mappingPage.locator('#allocation-cancel').click()
  await mappingPage.locator('#allocation-preview-dialog').waitFor({ state: 'hidden' })
  assert.deepEqual(await mappingPage.evaluate(() => window.__ledmapHardware.dump()), beforeAllocationPreview)
  await mappingPage.locator('#hardware-auto-allocate').click()
  await mappingPage.locator('#allocation-preview-dialog').waitFor({ state: 'visible' })
  await mappingPage.locator('#allocation-apply').click()
  await mappingPage.waitForFunction(() => window.__ledmapHardware.dump().unassigned.length === 0)
  hardwareDump = await mappingPage.evaluate(() => window.__ledmapHardware.dump())
  assert.equal(hardwareDump.unassigned.length, 0)
  assert.equal(hardwareDump.receivers.every(receiver => receiver.cabinets.length <= 4), true)
  assert.match(await mappingPage.locator('#hardware-diagnostics').innerText(), /Hardware ready/)

  const firstScreenPixel = await mappingPage.evaluate(() => window.__ledmapHardware.inspectCabinet('screen-1/C01', 0, 0))
  const secondScreenPixel = await mappingPage.evaluate(() => window.__ledmapHardware.inspectCabinet('screen-2/C01', 0, 0))
  assert.equal(firstScreenPixel.receiver, 'receiver-1')
  assert.equal(secondScreenPixel.receiver, 'receiver-2')
  assert.equal(firstScreenPixel.port, 'port-1')
  assert.equal(secondScreenPixel.port, 'port-1')
  assert.equal(firstScreenPixel.processor, 'processor-1')
  assert.equal(secondScreenPixel.processor, 'processor-1')
  assert.ok(secondScreenPixel.dataIndex > firstScreenPixel.dataIndex)

  await mappingPage.locator('#hardware-fit').click()
  const hardwareCanvasBox = await mappingPage.locator('#hardware-canvas').boundingBox()
  const hardwareCabinetCenter = await mappingPage.evaluate(() => window.__ledmapHardware.cabinetCenterPx('screen-2/C01'))
  assert.ok(hardwareCanvasBox)
  assert.ok(hardwareCabinetCenter)
  await mappingPage.mouse.click(
    hardwareCanvasBox.x + hardwareCabinetCenter.x,
    hardwareCanvasBox.y + hardwareCabinetCenter.y,
  )
  const hardwareInspector = await mappingPage.locator('#hardware-properties').innerText()
  assert.match(hardwareInspector, /Input[\s\S]*Screen[\s\S]*Cabinet[\s\S]*Module[\s\S]*Receiver[\s\S]*Port[\s\S]*Processor[\s\S]*dataIndex/)
  await mappingPage.locator('[data-hardware-overlay="port"]').click()
  await mappingPage.locator('[data-hardware-overlay="processor"]').click()
  assert.equal(await mappingPage.locator('[data-hardware-overlay="port"]').getAttribute('aria-pressed'), 'true')
  assert.equal(await mappingPage.locator('[data-hardware-overlay="processor"]').getAttribute('aria-pressed'), 'true')
  await mappingPage.locator('[data-hardware-overlay="port"]').click()
  await mappingPage.locator('[data-hardware-overlay="processor"]').click()

  const hardwareBeforeSave = await mappingPage.evaluate(() => window.__ledmapHardware.dump())
  await mappingPage.locator('#save-project').click()
  await mappingPage.waitForFunction(() => window.__ledmap.document().dirty === false)
  const hardwareStored = JSON.parse(await readFile(projectPath, 'utf8'))
  assert.equal(hardwareStored.schemaVersion, 4)
  assert.equal(hardwareStored.project.hardware.processors.length, 2)
  assert.equal(hardwareStored.project.hardware.receivers.length, 9)
  assert.doesNotMatch(JSON.stringify(hardwareStored.project.hardware), /HardwareProfile|profileRef/i)

  await mappingPage.locator('#new-project').click()
  await mappingPage.waitForFunction(() => window.__ledmapHardware.dump().processors.length === 0)
  await mappingPage.locator('#open-project').click()
  await mappingPage.waitForFunction(() => window.__ledmapHardware.dump().processors.length === 2)
  assert.deepEqual(await mappingPage.evaluate(() => window.__ledmapHardware.dump()), hardwareBeforeSave)
  assert.deepEqual(
    await mappingPage.evaluate(() => window.__ledmapHardware.inspectCabinet('screen-1/C01', 0, 0)),
    firstScreenPixel,
  )
  assert.deepEqual(
    await mappingPage.evaluate(() => window.__ledmapHardware.inspectCabinet('screen-2/C01', 0, 0)),
    secondScreenPixel,
  )
  await mappingPage.locator('#hardware-fit').click()
  const reopenedHardwareCanvasBox = await mappingPage.locator('#hardware-canvas').boundingBox()
  const reopenedHardwareCabinetCenter = await mappingPage.evaluate(() => window.__ledmapHardware.cabinetCenterPx('screen-2/C01'))
  assert.ok(reopenedHardwareCanvasBox)
  assert.ok(reopenedHardwareCabinetCenter)
  await mappingPage.mouse.click(
    reopenedHardwareCanvasBox.x + reopenedHardwareCabinetCenter.x,
    reopenedHardwareCanvasBox.y + reopenedHardwareCabinetCenter.y,
  )
  assert.match(await mappingPage.locator('#hardware-properties').innerText(), /dataIndex/)
  await mappingPage.screenshot({ path: resolve(output, 'hardware-workspace.png') })

  const projectBeforeTest = JSON.parse(await readFile(projectPath, 'utf8')).project
  const sessionBeforeTest = await mappingPage.evaluate(() => ({
    project: window.__ledmap.projectSnapshot(),
    revision: window.__ledmap.document().revision,
    savedRevision: window.__ledmap.document().savedRevision,
  }))
  assert.equal((await mappingPage.evaluate(() => window.__ledmap.document())).dirty, false)
  await mappingPage.locator('#test-mode').click()
  await mappingPage.locator('#test-workspace').waitFor({ state: 'visible' })
  assert.equal(await mappingPage.locator('#hardware-workspace').isHidden(), true)
  assert.deepEqual(await mappingPage.evaluate(() => ({
    hardwareReady: window.__ledmapTest.dump().hardwareReady,
    mappingReady: window.__ledmapTest.dump().mappingReady,
  })), { hardwareReady: true, mappingReady: true })

  for (const [pattern, color] of [
    ['white', '#ffffff'],
    ['red', '#ff2028'],
    ['green', '#20e070'],
    ['blue', '#2488ff'],
  ]) {
    await mappingPage.locator(`[data-test-pattern="${pattern}"]`).click()
    const testDump = await mappingPage.evaluate(() => window.__ledmapTest.dump())
    assert.equal(testDump.pattern, pattern)
    assert.ok(testDump.solidColors.includes(color))
  }
  await mappingPage.locator('[data-test-pattern="checkerboard"]').click()
  assert.ok((await mappingPage.evaluate(() => window.__ledmapTest.dump().primitiveKinds.filter(kind => kind === 'rect').length)) > 50)
  await mappingPage.locator('[data-test-pattern="borders"]').click()
  assert.equal((await mappingPage.evaluate(() => window.__ledmapTest.dump())).pattern, 'borders')
  await mappingPage.locator('[data-test-pattern="cabinet-labels"]').click()
  assert.equal((await mappingPage.evaluate(() => window.__ledmapTest.dump())).scopedCabinets.length, 36)
  await mappingPage.locator('[data-test-pattern="cabinet-order"]').click()
  assert.equal((await mappingPage.evaluate(() => window.__ledmapTest.dump())).pattern, 'cabinet-order')

  await mappingPage.locator('#test-scope').selectOption('receiver')
  assert.equal((await mappingPage.evaluate(() => window.__ledmapTest.dump())).scope.target, 'receiver-1')
  assert.deepEqual(
    (await mappingPage.evaluate(() => window.__ledmapTest.dump())).scopedCabinets,
    hardwareBeforeSave.receivers[0].cabinets,
  )
  await mappingPage.locator('[data-test-pattern="receiver-labels"]').click()
  assert.equal((await mappingPage.evaluate(() => window.__ledmapTest.dump())).pattern, 'receiver-labels')

  await mappingPage.locator('#test-scope').selectOption('port')
  await mappingPage.locator('#test-target').selectOption('port-1')
  const sharedPortCabinets = (await mappingPage.evaluate(() => window.__ledmapTest.dump())).scopedCabinets
  assert.equal(sharedPortCabinets.some(id => id.startsWith('screen-1/')), true)
  assert.equal(sharedPortCabinets.some(id => id.startsWith('screen-2/')), true)
  await mappingPage.locator('[data-test-pattern="port-labels"]').click()
  assert.equal((await mappingPage.evaluate(() => window.__ledmapTest.dump())).pattern, 'port-labels')

  await mappingPage.locator('[data-test-pattern="address-walk"]').click()
  await mappingPage.locator('#test-address-index').fill('65535')
  await mappingPage.locator('#test-address-go').click()
  const walkBeforeBoundary = (await mappingPage.evaluate(() => window.__ledmapTest.dump())).walk
  assert.equal(walkBeforeBoundary.dataIndex, 65535)
  assert.equal(walkBeforeBoundary.port, 'port-1')
  assert.equal(walkBeforeBoundary.screen, 'screen-1')
  await mappingPage.locator('#test-address-next').click()
  const walkAfterBoundary = (await mappingPage.evaluate(() => window.__ledmapTest.dump())).walk
  assert.equal(walkAfterBoundary.dataIndex, 65536)
  assert.equal(walkAfterBoundary.port, 'port-1')
  assert.equal(walkAfterBoundary.screen, 'screen-2')
  assert.ok(walkAfterBoundary.input.x !== walkBeforeBoundary.input.x || walkAfterBoundary.input.y !== walkBeforeBoundary.input.y)
  assert.match(await mappingPage.locator('#test-properties').innerText(), /Input[\s\S]*Screen[\s\S]*Cabinet[\s\S]*Module[\s\S]*Receiver[\s\S]*Port[\s\S]*Processor[\s\S]*dataIndex/)
  assert.equal((await mappingPage.evaluate(() => window.__ledmap.document())).dirty, false)

  await mappingPage.locator('#layout-mode').click()
  await mappingPage.locator('#mapping-mode').click()
  await mappingPage.locator('#hardware-mode').click()
  await mappingPage.locator('#test-mode').click()
  assert.equal((await mappingPage.evaluate(() => window.__ledmapTest.dump())).walk.dataIndex, 65536)
  assert.equal((await mappingPage.evaluate(() => window.__ledmap.document())).dirty, false)

  await mappingPage.locator('[data-test-pattern="white"]').click()
  await mappingPage.locator('#live-output-open').click()
  await mappingPage.locator('#live-output-dialog').waitFor({ state: 'visible' })
  await mappingPage.waitForFunction(() => window.__ledmapLiveOutput.dump().displays.length === 2)
  const liveInitial = await mappingPage.evaluate(() => window.__ledmapLiveOutput.dump())
  assert.deepEqual(liveInitial.displays.map(display => display.id), ['sim-display-1', 'sim-display-2'])
  assert.equal(liveInitial.displays[0].primary, true)
  assert.deepEqual(liveInitial.displays[1], {
    id: 'sim-display-2',
    bounds: { x: 1920, y: 0, width: 1280, height: 720 },
    resolution: { width: 1280, height: 720 },
    scaleFactor: 1,
    primary: false,
  })
  const outputOneCard = mappingPage.locator('[data-output-id="output-1"]')
  await outputOneCard.locator('select[aria-label="output-1 Windows Display"]').selectOption('sim-display-2')
  const outputOneWindow = running.app.waitForEvent('window')
  await outputOneCard.getByRole('button', { name: 'Start', exact: true }).click()
  const outputOnePage = await outputOneWindow
  outputOnePage.on('pageerror', error => failures.push(error.message))
  outputOnePage.on('console', message => { if (message.type() === 'error') failures.push(message.text()) })
  await outputOnePage.waitForFunction(() => window.__ledmapOutput?.dump()?.pattern === 'white')
  assert.deepEqual(await outputOnePage.evaluate(() => ({
    displayId: window.__ledmapOutput.dump().displayId,
    pattern: window.__ledmapOutput.dump().pattern,
    scaleMode: window.__ledmapOutput.dump().scaleMode,
  })), { displayId: 'sim-display-2', pattern: 'white', scaleMode: 'fit' })
  assert.deepEqual(await outputOnePage.evaluate(() => ({
    canvasCount: document.querySelectorAll('canvas').length,
    bodyText: document.body.innerText,
    background: getComputedStyle(document.body).backgroundColor,
    nodeRequire: typeof window.require,
    desktopApi: typeof window.ledmapDesktop,
    outputApi: typeof window.ledmapOutput,
  })), {
    canvasCount: 1,
    bodyText: '',
    background: 'rgb(0, 0, 0)',
    nodeRequire: 'undefined',
    desktopApi: 'undefined',
    outputApi: 'object',
  })
  const staticRevision = (await outputOnePage.evaluate(() => window.__ledmapOutput.dump())).revision
  await outputOnePage.waitForTimeout(350)
  assert.equal((await outputOnePage.evaluate(() => window.__ledmapOutput.dump())).revision, staticRevision)
  const outputSecurity = await running.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
    .filter(window => window.getTitle() === 'LedMAP Live Output')
    .map(window => {
      const preferences = window.webContents.getLastWebPreferences()
      return {
        nodeIntegration: preferences.nodeIntegration,
        contextIsolation: preferences.contextIsolation,
        sandbox: preferences.sandbox,
      }
    }))
  assert.deepEqual(outputSecurity, [{ nodeIntegration: false, contextIsolation: true, sandbox: true }])

  await mappingPage.locator('#live-output-close').click()
  for (const pattern of ['red', 'checkerboard', 'cabinet-labels']) {
    await mappingPage.locator(`[data-test-pattern="${pattern}"]`).click()
    await outputOnePage.waitForFunction(expected => window.__ledmapOutput.dump().pattern === expected, pattern)
  }
  const outputOneRevisionBeforeRegion = (await outputOnePage.evaluate(() => window.__ledmapOutput.dump())).revision
  await mappingPage.locator('#live-output-open').click()
  await setOutputRegion(mappingPage, 'output-1', { x: -160, y: 40, width: 900, height: 500 })
  await outputOnePage.waitForFunction(revision => window.__ledmapOutput.dump().revision > revision, outputOneRevisionBeforeRegion)
  assert.deepEqual((await outputOnePage.evaluate(() => window.__ledmapOutput.dump())).region, {
    x: -160, y: 40, width: 900, height: 500,
  })
  const outputTwoCard = mappingPage.locator('[data-output-id="output-2"]')
  await outputTwoCard.locator('select[aria-label="output-2 Windows Display"]').selectOption('sim-display-2')
  await setOutputRegion(mappingPage, 'output-2', { x: 600, y: -120, width: 640, height: 480 })
  await outputTwoCard.locator('select[aria-label="output-2 scale mode"]').selectOption('actual')
  const outputTwoWindow = running.app.waitForEvent('window')
  await outputTwoCard.getByRole('button', { name: 'Start', exact: true }).click()
  const outputTwoPage = await outputTwoWindow
  outputTwoPage.on('pageerror', error => failures.push(error.message))
  outputTwoPage.on('console', message => { if (message.type() === 'error') failures.push(message.text()) })
  await outputTwoPage.waitForFunction(() => window.__ledmapOutput?.dump()?.pattern === 'cabinet-labels')
  assert.deepEqual(await outputTwoPage.evaluate(() => ({
    region: window.__ledmapOutput.dump().region,
    scaleMode: window.__ledmapOutput.dump().scaleMode,
  })), { region: { x: 600, y: -120, width: 640, height: 480 }, scaleMode: 'actual' })
  assert.equal((await mappingPage.evaluate(() => window.__ledmapLiveOutput.dump())).outputs.filter(route => route.running).length, 2)
  await mappingPage.screenshot({ path: resolve(output, 'live-output-routing.png') })
  await mappingPage.locator('#live-output-close').click()
  await mappingPage.locator('#test-fit').click()
  await mappingPage.screenshot({ path: resolve(output, 'live-output-regions.png') })

  const outputOneClosed = outputOnePage.waitForEvent('close')
  await mappingPage.locator('#live-output-open').click()
  await mappingPage.locator('[data-output-id="output-1"]').getByRole('button', { name: 'Stop', exact: true }).click()
  await outputOneClosed
  assert.equal((await mappingPage.evaluate(() => window.__ledmapLiveOutput.dump())).outputs[0].running, false)
  assert.equal((await mappingPage.evaluate(() => window.__ledmapLiveOutput.dump())).outputs[1].running, true)
  await mappingPage.locator('#live-output-close').click()

  await mappingPage.locator('[data-test-pattern="address-walk"]').click()
  await mappingPage.locator('#test-address-index').fill('65535')
  await mappingPage.locator('#test-address-go').click()
  await outputTwoPage.waitForFunction(() => window.__ledmapOutput.dump().dataIndex === 65535)
  await mappingPage.locator('#test-address-next').click()
  await outputTwoPage.waitForFunction(() => window.__ledmapOutput.dump().dataIndex === 65536)
  assert.deepEqual(await outputTwoPage.evaluate(() => ({
    dataIndex: window.__ledmapOutput.dump().dataIndex,
    pattern: window.__ledmapOutput.dump().pattern,
  })), { dataIndex: 65536, pattern: 'address-walk' })
  await outputTwoPage.screenshot({ path: resolve(output, 'live-output-window.png') })

  assert.equal(await mappingPage.evaluate(() => window.__ledmapLiveOutput.simulateDisplayChange('add')), true)
  await mappingPage.waitForFunction(() => window.__ledmapLiveOutput.dump().displays.length === 3)
  assert.deepEqual((await mappingPage.evaluate(() => window.__ledmapLiveOutput.dump())).displays[2], {
    id: 'sim-display-3',
    bounds: { x: -1024, y: 0, width: 1024, height: 768 },
    resolution: { width: 1280, height: 960 },
    scaleFactor: 1.25,
    primary: false,
  })
  const outputTwoClosed = outputTwoPage.waitForEvent('close')
  assert.equal(await mappingPage.evaluate(() => window.__ledmapLiveOutput.simulateDisplayChange('remove', 'sim-display-2')), true)
  await outputTwoClosed
  await mappingPage.waitForFunction(() => window.__ledmapLiveOutput.dump().outputs[1].running === false)
  assert.equal((await mappingPage.evaluate(() => window.__ledmapLiveOutput.dump())).displays.some(display => display.id === 'sim-display-2'), false)
  assert.equal((await mappingPage.evaluate(() => window.__ledmap.document())).dirty, false)
  await mappingPage.locator('#layout-mode').click()
  await mappingPage.locator('#test-mode').click()
  assert.equal((await mappingPage.evaluate(() => window.__ledmap.document())).dirty, false)
  assert.deepEqual(await mappingPage.evaluate(() => ({
    project: window.__ledmap.projectSnapshot(),
    revision: window.__ledmap.document().revision,
    savedRevision: window.__ledmap.document().savedRevision,
  })), sessionBeforeTest)

  await mappingPage.locator('#save-project-as').click()
  await mappingPage.waitForFunction(() => window.__ledmap.document().dirty === false)
  const projectAfterTestSave = JSON.parse(await readFile(projectPath, 'utf8')).project
  assert.deepEqual(projectAfterTestSave, projectBeforeTest)
  assert.doesNotMatch(JSON.stringify(projectAfterTestSave), /address-walk|checkerboard|testPattern|walkOrdinal|live-output|sim-display/i)
  await mappingPage.locator('#test-fit').click()
  await mappingPage.screenshot({ path: resolve(output, 'test-workspace.png') })

  await mappingPage.locator('[data-test-pattern="checkerboard"]').click()
  await mappingPage.locator('#export-mode').click()
  await mappingPage.locator('#export-workspace').waitFor({ state: 'visible' })
  assert.equal(await mappingPage.locator('#test-workspace').isHidden(), true)
  assert.deepEqual(await mappingPage.evaluate(() => window.__ledmapExport.dump().stages.map(stage => [stage.id, stage.status])), [
    ['integrity', 'ready'], ['mapping', 'ready'], ['hardware', 'ready'], ['remap', 'ready'],
  ])
  assert.equal((await mappingPage.evaluate(() => window.__ledmapExport.dump())).pattern, 'checkerboard')
  assert.equal((await mappingPage.evaluate(() => window.__ledmapExport.dump())).pixelCount, 589824)

  await runExport(mappingPage, '#export-png-run', 'Exported 1 PNG')
  assert.deepEqual(pngSize(await readFile(resolve(exportDirectory, 'test-checkerboard.png'))), { width: 1112, height: 884 })
  await mappingPage.locator('#export-png-scope').selectOption('batch-screens')
  await runExport(mappingPage, '#export-png-run', 'Exported 3 PNG')
  for (const [name, id] of [['Screen-1', 'screen-1'], ['Screen-2', 'screen-2'], ['Screen-3', 'screen-3']]) {
    assert.deepEqual(pngSize(await readFile(resolve(exportDirectory, `test-checkerboard-${name}-${id}.png`))), { width: 512, height: 384 })
  }

  const jsonPath = resolve(exportDirectory, 'ledmap-generic-mapping.json')
  const csvPath = resolve(exportDirectory, 'ledmap-generic-mapping.csv')
  await runExport(mappingPage, '#export-json-run', 'Exported JSON')
  const jsonBoundary = await jsonRowsAt(jsonPath, [65535, 65536])
  assert.deepEqual(
    [jsonBoundary.get(65535).screen, jsonBoundary.get(65535).receiver, jsonBoundary.get(65535).port, jsonBoundary.get(65535).dataIndex],
    ['screen-1', 'receiver-1', 'port-1', 65535],
  )
  assert.deepEqual(
    [jsonBoundary.get(65536).screen, jsonBoundary.get(65536).receiver, jsonBoundary.get(65536).port, jsonBoundary.get(65536).dataIndex],
    ['screen-2', 'receiver-2', 'port-1', 65536],
  )
  const jsonHash = await sha256(jsonPath)
  await runExport(mappingPage, '#export-json-run', 'Exported JSON')
  assert.equal(await sha256(jsonPath), jsonHash)

  await runExport(mappingPage, '#export-csv-run', 'Exported CSV')
  const csvBoundary = await csvRowsAt(csvPath, [65535, 65536])
  assert.deepEqual(csvBoundary.get(65535).slice(3, 4).concat(csvBoundary.get(65535).slice(12, 16)), [
    'screen-1', 'processor-1', 'port-1', 'receiver-1', '65535',
  ])
  assert.deepEqual(csvBoundary.get(65536).slice(3, 4).concat(csvBoundary.get(65536).slice(12, 16)), [
    'screen-2', 'processor-1', 'port-1', 'receiver-2', '65536',
  ])
  const csvHash = await sha256(csvPath)
  await runExport(mappingPage, '#export-csv-run', 'Exported CSV')
  assert.equal(await sha256(csvPath), csvHash)

  await mappingPage.locator('#export-generic-scope').selectOption('screen')
  await mappingPage.locator('#export-generic-screen').selectOption('screen-2')
  await runExport(mappingPage, '#export-json-run', 'Exported JSON')
  const selectedRows = await jsonRowsAt(resolve(exportDirectory, 'ledmap-generic-mapping-screen-2.json'), [65536])
  assert.deepEqual(
    [selectedRows.get(65536).screen, selectedRows.get(65536).port, selectedRows.get(65536).dataIndex],
    ['screen-2', 'port-1', 65536],
  )
  assert.equal((await mappingPage.evaluate(() => window.__ledmap.document())).dirty, false)

  await mappingPage.locator('#export-png-scope').selectOption('composition')
  await mappingPage.locator('#export-generic-scope').selectOption('composition')
  assert.equal(await mappingPage.evaluate(() => window.__ledmapExport.simulateCancel()), true)
  await mappingPage.locator('#export-png-run').click()
  await mappingPage.waitForFunction(() => /canceled/i.test(window.__ledmapExport.dump().lastResult))
  assert.equal((await mappingPage.evaluate(() => window.__ledmap.document())).dirty, false)
  assert.deepEqual(await mappingPage.evaluate(() => ({
    project: window.__ledmap.projectSnapshot(),
    revision: window.__ledmap.document().revision,
    savedRevision: window.__ledmap.document().savedRevision,
  })), sessionBeforeTest)

  await mappingPage.locator('#hardware-mode').click()
  await mappingPage.locator('[data-hardware-type="receiver"][data-hardware-id="receiver-1"]').click()
  const beforeBlockedDelete = await mappingPage.evaluate(() => window.__ledmapHardware.dump())
  await mappingPage.locator('#hardware-delete').click()
  assert.deepEqual(await mappingPage.evaluate(() => window.__ledmapHardware.dump()), beforeBlockedDelete)
  assert.equal((await mappingPage.evaluate(() => window.__ledmap.document())).dirty, false)
  await mappingPage.locator(`[data-cabinet-id="${beforeBlockedDelete.receivers[0].cabinets[0]}"]`).first().click()
  await mappingPage.locator('#hardware-unassign').click()
  const brokenHardware = await mappingPage.evaluate(() => window.__ledmapHardware.dump())
  assert.equal((await mappingPage.evaluate(() => window.__ledmap.document())).dirty, true)
  await mappingPage.locator('#export-mode').click()
  await mappingPage.waitForFunction(() => window.__ledmapExport.dump().ready === false)
  assert.equal((await mappingPage.evaluate(() => window.__ledmapExport.dump())).stages.find(stage => stage.id === 'hardware').status, 'blocked')
  assert.equal(await mappingPage.locator('#export-json-run').isDisabled(), true)
  assert.equal(await mappingPage.locator('#export-csv-run').isDisabled(), true)
  assert.equal((await mappingPage.evaluate(() => window.__ledmapExport.dump())).pngReady, true)
  assert.equal(await mappingPage.locator('#export-png-run').isEnabled(), true)
  await mappingPage.locator('#hardware-mode').click()
  assert.deepEqual(await mappingPage.evaluate(() => window.__ledmapHardware.dump()), brokenHardware)
  await mappingPage.locator('#open-project').click()
  await mappingPage.waitForFunction(() => window.__ledmap.document().dirty === false && window.__ledmapHardware.dump().receivers.length === 9)
  assert.equal((await mappingPage.evaluate(() => window.__ledmap.document())).dirty, false)
  await mappingPage.locator('#export-mode').click()
  await mappingPage.waitForFunction(() => window.__ledmapExport.dump().ready === true)
  await mappingPage.locator('#export-generic-scope').selectOption('composition')
  await mappingPage.screenshot({ path: resolve(output, 'export-center.png') })

  assert.deepEqual(failures, [])
  console.log('Electron smoke passed: Layout through deterministic Export with pixel-exact PNG, byte-identical JSON/CSV and unre-based shared-Port addresses.')
  console.log(`Project: ${projectPath}`)
} finally {
  await close(running.app)
}
process.exit(0)
