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

let running = await launch()
try {
  const page = running.page
  const dump = async () => page.evaluate(() => window.__ledmap.dump())
  const documentState = async () => page.evaluate(() => window.__ledmap.document())
  const windowTitle = async () => running.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle())

  assert.equal((await dump()).length, 0)
  assert.equal(await page.locator('#empty h2').innerText(), 'No screens yet')
  assert.equal(await page.locator('#empty p').innerText(), 'Add your first Screen')
  assert.equal((await documentState()).dirty, false)

  await page.locator('#new-project').click()
  await page.locator('#add-screen').click()
  await page.locator('#add-screen').click()
  await page.locator('#add-screen').click()
  assert.deepEqual((await dump()).map(screen => screen.name), ['Screen 1', 'Screen 2', 'Screen 3'])

  await setScreenPosition(page, 'Screen 1', -240, 80)
  await setScreenPosition(page, 'Screen 2', 640, -120)
  await page.locator('#project-tree [role="treeitem"]').filter({ hasText: 'Cabinet Grid' }).nth(2).click()
  await page.locator('input[aria-label="Cabinet Grid Columns"]').fill('5')
  await page.locator('input[aria-label="Cabinet Grid Columns"]').blur()
  await page.locator('select[aria-label="Cabinet Grid Numbering"]').selectOption('column')
  await page.locator('button[aria-label="Cabinet Grid Snake"]').click()

  const expected = await dump()
  assert.equal(expected.length, 3)
  assert.deepEqual(expected.map(screen => [screen.x, screen.y]), [[-240, 80], [640, -120], [200, 200]])
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
  assert.equal(stored.project.screens.length, 3)
  assert.deepEqual(stored.project.editorLayout.screenPositions.map(entry => [entry.position.x, entry.position.y]), [[-240, 80], [640, -120], [200, 200]])

  await setScreenPosition(page, 'Screen 1', -999, 999)
  assert.equal((await documentState()).dirty, true)
  await page.locator('#open-project').click()
  await page.waitForFunction(() => window.__ledmap.document().dirty === false)
  assert.deepEqual(await dump(), expected)

  await page.locator('#new-project').click()
  await page.waitForFunction(() => window.__ledmap.dump().length === 0)
  assert.equal((await documentState()).currentFilePath, null)
  await page.locator('#open-project').click()
  await page.waitForFunction(() => window.__ledmap.dump().length === 3)
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
  await running.page.waitForFunction(() => window.__ledmap.dump().length === 3)
  assert.deepEqual(await running.page.evaluate(() => window.__ledmap.dump()), expected)

  assert.deepEqual(failures, [])
  console.log('Electron smoke passed: New, three source-backed Screens, signed positions, Grid ordering, Save, dirty Open/Close guards and process restart restore.')
  console.log(`Project: ${projectPath}`)
} finally {
  await close(running.app)
}
