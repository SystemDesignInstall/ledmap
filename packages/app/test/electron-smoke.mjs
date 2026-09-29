import assert from 'node:assert/strict'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const appRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
const output = fileURLToPath(new URL('../out/smoke/', import.meta.url))
const projectPath = resolve(output, 'document-lifecycle.ledmap')
await mkdir(output, { recursive: true })
await rm(projectPath, { force: true })

const env = {
  ...process.env,
  LEDMAP_SMOKE_PROJECT_PATH: projectPath,
  LEDMAP_SMOKE_UNSAVED_ACTION: 'discard',
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
  await Promise.race([
    application.close(),
    new Promise(resolvePromise => setTimeout(resolvePromise, 3000)),
  ])
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
  await page.locator('#screen-form button[type="submit"]').click()
  await page.waitForFunction(count => window.__ledmap.dump().length === count + 1, before)
}

let running = await launch()
try {
  const page = running.page
  const dump = async () => page.evaluate(() => window.__ledmap.dump())
  const documentState = async () => page.evaluate(() => window.__ledmap.document())
  const windowTitle = async () => running.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle())

  assert.equal((await dump()).length, 0)
  assert.equal(await page.locator('#empty h2').innerText(), 'No screens yet')
  assert.match(await page.locator('#empty').innerText(), /Add your first Screen/)
  assert.equal((await documentState()).dirty, false)
  assert.match(await page.locator('.mode-switcher').innerText(), /Layout\s+Mapping\s+Hardware\s+Test\s+Export/)
  assert.equal((await page.locator('.mode-switcher .mode:disabled').count()), 4)
  assert.doesNotMatch(await page.locator('body').innerText(), /ALPHA|In-memory session/)

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
  await page.locator('select[aria-label="Screen Numbering"]').selectOption('column')
  await page.locator('button[aria-label="Screen Snake"]').click()

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
  await page.locator('#grid-snap').click()
  assert.deepEqual(await page.evaluate(() => window.__ledmap.snap()), { grid: true, smart: true, step: 10 })
  const canvasBox = await page.locator('#project-canvas').boundingBox()
  assert.ok(canvasBox)
  const start = await page.evaluate(() => window.__ledmap.screenCenterPx('screen-1'))
  const end = await page.evaluate(() => window.__ledmap.projectToPx({ x: -153, y: 192 }))
  await page.mouse.move(canvasBox.x + start.x, canvasBox.y + start.y)
  await page.mouse.down()
  await page.mouse.move(canvasBox.x + end.x, canvasBox.y + end.y, { steps: 5 })
  assert.ok((await page.evaluate(() => window.__ledmap.guides())).some(guide => guide.axis === 'x' && guide.value === 100))
  await page.mouse.up()
  assert.equal((await dump())[0].x, -412)
  assert.equal(Number.isSafeInteger((await dump())[0].x), true)

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
  await page.locator('[data-overlay="signal"]').click()
  assert.equal(await page.locator('[data-overlay="modules"]').getAttribute('aria-pressed'), 'true')
  assert.equal(await page.locator('[data-overlay="signal"]').getAttribute('aria-pressed'), 'true')
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
  assert.equal(expected[2].numbering, 'column')
  assert.equal(expected[2].snake, false)
  assert.equal((await documentState()).dirty, true)
  assert.match(await windowTitle(), /Untitled\.ledmap \*/)

  await page.locator('#save-project').click()
  await page.waitForFunction(() => window.__ledmap.document().dirty === false)
  assert.equal((await documentState()).currentFilePath, projectPath)
  assert.doesNotMatch(await windowTitle(), / \*/)
  const stored = JSON.parse(await readFile(projectPath, 'utf8'))
  assert.equal(stored.schemaVersion, 2)
  assert.equal(stored.project.screens.length, 5)
  assert.deepEqual(
    stored.project.editorLayout.screenPositions.map(entry => [entry.position.x, entry.position.y]),
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

  assert.deepEqual(failures, [])
  console.log('Electron smoke passed: five Screens, multi-select, integer drag, Grid/Smart Snap guides, align/distribute, nudge, exact X/Y and Save/reopen.')
  console.log(`Project: ${projectPath}`)
} finally {
  await close(running.app)
}
