import { compareUtf16 } from './json.js'
import type { EditableProjectDocument, JsonValue } from './types.js'
import type { LedMapDocumentV3 } from './v3-types.js'
import type { LedMapDocumentV4 } from './v4-types.js'
import type { LedMapDocumentV5 } from './v5-types.js'
import type { LedMapDocumentV6 } from './v6-types.js'
import type { LedMapDocumentV7 } from './v7-types.js'

function indent(depth: number): string {
  return '  '.repeat(depth)
}

function writeScalar(value: null | boolean | number | string): string {
  return JSON.stringify(value)
}

function writeJson(value: JsonValue, depth: number, sortKeys: boolean): string {
  if (value === null || typeof value !== 'object') return writeScalar(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map(item => indent(depth + 1) + writeJson(item, depth + 1, sortKeys))
    return '[\n' + items.join(',\n') + '\n' + indent(depth) + ']'
  }
  const keys = Object.getOwnPropertyNames(value)
  if (sortKeys) keys.sort(compareUtf16)
  if (keys.length === 0) return '{}'
  const entries = keys.map(key => {
    const child = (value as Record<string, JsonValue>)[key]!
    return indent(depth + 1) + writeScalar(key) + ': ' + writeJson(child, depth + 1, sortKeys)
  })
  return '{\n' + entries.join(',\n') + '\n' + indent(depth) + '}'
}

export function writeDocument(document: EditableProjectDocument | LedMapDocumentV3 | LedMapDocumentV4 | LedMapDocumentV5 | LedMapDocumentV6 | LedMapDocumentV7): string {
  const entries = [
    indent(1) + writeScalar('format') + ': ' + writeScalar(document.format),
    indent(1) + writeScalar('schemaVersion') + ': ' + writeScalar(document.schemaVersion),
    indent(1) + writeScalar('project') + ': ' + writeJson(document.project as unknown as JsonValue, 1, false),
    indent(1) + writeScalar('extensions') + ': ' + writeJson(document.extensions, 1, true),
  ]
  return '{\n' + entries.join(',\n') + '\n}\n'
}
