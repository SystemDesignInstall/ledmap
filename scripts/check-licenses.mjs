import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const lockfile = JSON.parse(readFileSync(new URL('package-lock.json', root), 'utf8'))
const acceptedLicenses = new Set([
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'CC-BY-4.0',
  'ISC',
  'MIT',
])
const errors = []
let dependencyCount = 0

for (const [path, entry] of Object.entries(lockfile.packages)) {
  if (!path.includes('node_modules/') || entry.link) continue
  dependencyCount += 1
  if (!acceptedLicenses.has(entry.license)) {
    errors.push(`${path}: unreviewed license ${entry.license ?? '(missing)'}`)
  }
}

if (dependencyCount === 0) errors.push('No dependency licenses found in the lockfile')

const notice = Buffer.from(
  readFileSync(new URL('docs/licenses/stoatworks-labs-MIT.txt', root), 'utf8')
    .replace(/\r\n/g, '\n'),
)
const noticeBlob = createHash('sha1')
  .update(`blob ${notice.length}\0`)
  .update(notice)
  .digest('hex')

if (noticeBlob !== '2854af553a2f331bbb806636494ff4a5921db848') {
  errors.push('The retained Stoatworks Labs MIT notice differs from its pinned source blob')
}

const xmlNotice = Buffer.from(readFileSync(new URL('docs/licenses/xmldom-MIT.txt', root), 'utf8').replace(/\r\n/g, '\n'))
const xmlNoticeBlob = createHash('sha1').update(`blob ${xmlNotice.length}\0`).update(xmlNotice).digest('hex')
if (xmlNoticeBlob !== 'b95f5698c645e44ecf09ee09a0a44ee6437e23a1') {
  errors.push('The retained xmldom MIT notice differs from its pinned source blob')
}

if (errors.length > 0) throw new Error(errors.join('\n'))

console.log(`License check passed: ${dependencyCount} locked dependencies; pinned MIT notices intact`)
