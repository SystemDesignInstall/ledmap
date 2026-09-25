import { SerializationError, type SerializationPath } from './errors.js'
import type { JsonObject, JsonValue } from './types.js'

export function invalidJson(message: string): SerializationError {
  return new SerializationError('SERIALIZATION_INVALID_JSON', message, [])
}

export function invalidInput(path: SerializationPath, message: string): SerializationError {
  return new SerializationError('SERIALIZATION_INVALID_INPUT', message, path)
}

export function invalidSchema(path: SerializationPath, message: string): SerializationError {
  return new SerializationError('SERIALIZATION_INVALID_SCHEMA', message, path)
}

export function duplicateKey(path: SerializationPath, key: string): SerializationError {
  return new SerializationError('SERIALIZATION_DUPLICATE_KEY', `Duplicate object member name ${key}`, path)
}

export function compareUtf16(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isJsonWhitespace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= '0' && character <= '9'
}

function isHexDigit(character: string | undefined): boolean {
  return character !== undefined && ((character >= '0' && character <= '9') || (character >= 'a' && character <= 'f') || (character >= 'A' && character <= 'F'))
}

function defineDataProperty(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true })
}

export function parseJsonText(text: string): unknown {
  if (text.charCodeAt(0) === 0xfeff) throw invalidJson('JSON text must not start with a byte order mark')
  let position = 0
  const path: (string | number)[] = []
  let overflowPath: SerializationPath | null = null
  const firstDuplicate: { current: { path: SerializationPath; key: string } | null } = { current: null }

  function fail(message: string): never {
    throw invalidJson(`${message} at position ${position}`)
  }

  function skipWhitespace(): void {
    while (position < text.length && isJsonWhitespace(text.charCodeAt(position))) position += 1
  }

  function parseLiteral(literal: 'true' | 'false' | 'null'): boolean | null {
    if (!text.startsWith(literal, position)) fail(`Invalid literal, expected ${literal}`)
    position += literal.length
    return literal === 'null' ? null : literal === 'true'
  }

  function parseHex4(): number {
    const hex = text.slice(position, position + 4)
    if (hex.length < 4 || ![...hex].every(character => isHexDigit(character))) fail('Invalid \\u escape, expected four hex digits')
    position += 4
    return Number.parseInt(hex, 16)
  }

  function parseString(): string {
    position += 1
    const chunks: string[] = []
    let pending = ''
    for (;;) {
      if (position >= text.length) fail('Unterminated string')
      const character = text[position]!
      if (character === '"') {
        position += 1
        chunks.push(pending)
        return chunks.join('')
      }
      if (character === '\\') {
        position += 1
        const escape = text[position]
        position += 1
        switch (escape) {
          case '"': pending += '"'; break
          case '\\': pending += '\\'; break
          case '/': pending += '/'; break
          case 'b': pending += '\b'; break
          case 'f': pending += '\f'; break
          case 'n': pending += '\n'; break
          case 'r': pending += '\r'; break
          case 't': pending += '\t'; break
          case 'u': {
            const code = parseHex4()
            if (code >= 0xd800 && code <= 0xdbff && text[position] === '\\' && text[position + 1] === 'u') {
              const mark = position
              position += 2
              const low = parseHex4()
              if (low >= 0xdc00 && low <= 0xdfff) {
                pending += String.fromCodePoint(0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00))
                break
              }
              position = mark
            }
            pending += String.fromCharCode(code)
            break
          }
          default: fail('Invalid escape sequence')
        }
        continue
      }
      if (character.charCodeAt(0) < 0x20) fail('Unescaped control character in string')
      pending += character
      position += 1
    }
  }

  function parseNumber(): number {
    const start = position
    if (text[position] === '-') position += 1
    if (text[position] === '0') position += 1
    else if (isDigit(text[position])) { while (isDigit(text[position])) position += 1 } else fail('Invalid number')
    if (text[position] === '.') {
      position += 1
      if (!isDigit(text[position])) fail('Invalid number fraction')
      while (isDigit(text[position])) position += 1
    }
    const exponent = text[position]
    if (exponent === 'e' || exponent === 'E') {
      position += 1
      const sign = text[position]
      if (sign === '+' || sign === '-') position += 1
      if (!isDigit(text[position])) fail('Invalid number exponent')
      while (isDigit(text[position])) position += 1
    }
    const value = Number(text.slice(start, position))
    if (!Number.isFinite(value) && overflowPath === null) overflowPath = [...path]
    return value
  }

  function parseObject(): Record<string, unknown> {
    position += 1
    const result: Record<string, unknown> = {}
    const seen = new Set<string>()
    skipWhitespace()
    if (text[position] === '}') {
      position += 1
      return result
    }
    for (;;) {
      skipWhitespace()
      if (text[position] !== '"') fail('Expected an object member name')
      const key = parseString()
      skipWhitespace()
      if (text[position] !== ':') fail("Expected ':' after object member name")
      position += 1
      if (seen.has(key) && firstDuplicate.current === null) firstDuplicate.current = { path: [...path, key], key }
      seen.add(key)
      path.push(key)
      const value = parseValue()
      path.pop()
      defineDataProperty(result, key, value)
      skipWhitespace()
      if (text[position] === ',') {
        position += 1
        continue
      }
      if (text[position] === '}') {
        position += 1
        return result
      }
      fail("Expected ',' or '}' in object")
    }
  }

  function parseArray(): unknown[] {
    position += 1
    const result: unknown[] = []
    skipWhitespace()
    if (text[position] === ']') {
      position += 1
      return result
    }
    for (;;) {
      path.push(result.length)
      const value = parseValue()
      path.pop()
      result.push(value)
      skipWhitespace()
      if (text[position] === ',') {
        position += 1
        continue
      }
      if (text[position] === ']') {
        position += 1
        return result
      }
      fail("Expected ',' or ']' in array")
    }
  }

  function parseValue(): unknown {
    skipWhitespace()
    const character = text[position]
    if (character === undefined) fail('Unexpected end of JSON text')
    if (character === '{') return parseObject()
    if (character === '[') return parseArray()
    if (character === '"') return parseString()
    if (character === 't') return parseLiteral('true')
    if (character === 'f') return parseLiteral('false')
    if (character === 'n') return parseLiteral('null')
    if (character === '-' || isDigit(character)) return parseNumber()
    fail('Unexpected character')
  }

  const value = parseValue()
  skipWhitespace()
  if (position < text.length) fail('Unexpected trailing text after JSON value')
  const duplicate = firstDuplicate.current
  if (duplicate !== null) throw duplicateKey(duplicate.path, duplicate.key)
  if (overflowPath !== null) throw invalidSchema(overflowPath, 'Parsed number is not a finite JSON number')
  return value
}

export function canonicalArrayIndex(key: string): number | null {
  if (!/^(?:0|[1-9][0-9]*)$/.test(key)) return null
  return Number(key)
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!
      if ('value' in descriptor) deepFreeze(descriptor.value)
    }
    Object.freeze(value)
  }
  return value
}

export function cloneJsonValue(value: unknown, path: SerializationPath, ancestors: Set<object> = new Set()): JsonValue {
  if (value === null) return null
  const kind = typeof value
  if (kind === 'string' || kind === 'boolean') return value as string | boolean
  if (kind === 'number') {
    const number = value as number
    if (!Number.isFinite(number)) throw invalidInput(path, 'a finite JSON number')
    return number
  }
  if (kind !== 'object') throw invalidInput(path, 'a JSON value; undefined, functions, symbols and bigint are not representable')
  const source = value as object
  if (ancestors.has(source)) throw invalidInput(path, 'an acyclic JSON value; circular references are not representable')
  ancestors.add(source)
  try {
    for (const symbol of Object.getOwnPropertySymbols(source)) {
      throw invalidInput([...path, symbol.description ?? 'symbol'], 'a JSON value without symbol keys')
    }
    if (Array.isArray(source)) {
      if (Object.getPrototypeOf(source) !== Array.prototype) throw invalidInput(path, 'a plain array')
      const lengthDescriptor = Object.getOwnPropertyDescriptor(source, 'length')!
      if (!('value' in lengthDescriptor)) throw invalidInput(path, 'a plain array')
      const length = lengthDescriptor.value as number
      const names = Object.getOwnPropertyNames(source)
      let indexCount = 0
      for (const key of names) {
        if (key === 'length') continue
        const index = canonicalArrayIndex(key)
        const descriptor = Object.getOwnPropertyDescriptor(source, key)!
        if (index === null || index >= length) throw invalidInput([...path, key], 'a plain array without extra own properties')
        if (!('value' in descriptor)) throw invalidInput([...path, key], 'own data properties; accessors are not supported')
        indexCount += 1
      }
      if (indexCount !== length) throw invalidInput(path, 'a dense array without holes')
      const items: JsonValue[] = []
      for (let index = 0; index < length; index += 1) {
        items.push(cloneJsonValue(source[index], [...path, index], ancestors))
      }
      return items
    }
    if (!isPlainRecord(source)) throw invalidInput(path, 'a plain JSON object')
    const result: Record<string, JsonValue> = {}
    for (const key of Object.getOwnPropertyNames(source)) {
      const descriptor = Object.getOwnPropertyDescriptor(source, key)!
      if (!('value' in descriptor)) throw invalidInput([...path, key], 'own data properties; accessors are not supported')
      defineDataProperty(result, key, cloneJsonValue(descriptor.value, [...path, key], ancestors))
    }
    return result as JsonObject
  } finally {
    ancestors.delete(source)
  }
}
