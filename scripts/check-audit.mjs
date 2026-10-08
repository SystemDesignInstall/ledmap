import { execFileSync } from 'node:child_process'

// Advisory IDs that fail `npm audit` but are accepted after review.
// Key: GHSA id. Value: justification. Keep this list minimal and time-stamped on change.
const exceptions = new Map([
  [
    'GHSA-hp3w-g68c-fv3c',
    'sprintf-js unbounded-precision DoS, reachable only through electron-builder build-tooling logs (devDependency, never shipped in the app bundle). ' +
      'The available fix downgrades to electron-builder@26.5.0 which carries HIGH GHSA-7g7r-gx96-252g. Accepted 2026-10-08; re-check on electron-builder upgrades.',
  ],
])

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
let raw = ''
try {
  raw = execFileSync(npm, ['audit', '--package-lock-only', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (error) {
  raw = error?.stdout?.toString() ?? ''
}

let report
try {
  report = JSON.parse(raw || '{}')
} catch {
  throw new Error('Unable to parse `npm audit --json` output')
}

const ranks = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 }
const failures = []
for (const [name, entry] of Object.entries(report.vulnerabilities ?? {})) {
  if ((ranks[entry.severity] ?? 0) < ranks.low) continue
  const advisories = new Set()
  for (const via of entry.via ?? []) {
    const url = typeof via === 'object' ? via.url ?? '' : ''
    const match = /GHSA-[a-z0-9-]+/i.exec(url)
    if (match) advisories.add(match[0].toUpperCase())
  }
  const unaccepted = [...advisories].filter(id => !exceptions.has(id))
  // No advisory link (range-only entry) or any unaccepted advisory -> fail.
  if (advisories.size === 0 || unaccepted.length > 0) {
    failures.push(`${name} [${entry.severity}]: ${(unaccepted.length > 0 ? unaccepted : ['no advisory id']).join(', ')}`)
  }
}

if (failures.length > 0) throw new Error(`Unaccepted audit findings:\n${failures.join('\n')}`)
console.log('Audit check passed: no unaccepted low-or-higher findings')
