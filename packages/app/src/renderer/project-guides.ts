import type { JsonObject, JsonValue } from '@ledmap/core'
import type { ProjectGuide } from './layout-interaction.js'

export const PROJECT_GUIDES_EXTENSION_KEY = 'ledmap.compositionGuides'

function validateGuides(value: unknown): readonly ProjectGuide[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Composition guides are invalid.')
  const record = value as Record<string, unknown>
  if (record['version'] !== 1 || !Array.isArray(record['guides']) || record['guides'].length > 1024) {
    throw new Error('Composition guides need version 1 and at most 1024 guides.')
  }
  const used = new Set<string>()
  return Object.freeze(record['guides'].map((entry: unknown) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Composition guide is invalid.')
    const guide = entry as Record<string, unknown>
    if (typeof guide['id'] !== 'string' || !/^guide-[1-9][0-9]*$/.test(guide['id']) || used.has(guide['id']) ||
        (guide['orientation'] !== 'vertical' && guide['orientation'] !== 'horizontal') ||
        !Number.isSafeInteger(guide['position']) || typeof guide['locked'] !== 'boolean') {
      throw new Error('Composition guide identity, orientation, position or lock state is invalid.')
    }
    used.add(guide['id'])
    return Object.freeze({ id: guide['id'], orientation: guide['orientation'],
      position: guide['position'], locked: guide['locked'] }) as ProjectGuide
  }))
}

export function projectGuidesFromExtensions(extensions: JsonObject): readonly ProjectGuide[] {
  const value = extensions[PROJECT_GUIDES_EXTENSION_KEY]
  return value === undefined ? [] : validateGuides(value)
}

export function withProjectGuides(extensions: JsonObject, guides: readonly ProjectGuide[]): JsonObject {
  const valid = validateGuides({ version: 1, guides })
  const value: JsonValue = { version: 1, guides: valid.map(guide => ({ ...guide })) }
  return Object.freeze({ ...extensions, [PROJECT_GUIDES_EXTENSION_KEY]: value })
}
