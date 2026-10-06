import { BrowserWindow, dialog, type WebContents } from 'electron'
import { mkdir, open, writeFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import {
  V2ExportPreflightError,
  genericMappingV2Chunks,
  preflightV2GenericMapping,
  type V2GenericMappingFormat,
} from '../shared/v2-export-engine.js'
import type {
  ExportFilePayload,
  ExportWriteResult,
  WriteExportFilesRequest,
  WriteGenericMappingRequest,
} from '../shared/ipc.js'

function safeFileName(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 180 || basename(value) !== value || value === '.' || value === '..') {
    throw new Error('Invalid export file name.')
  }
  return value
}

function extensionFor(format: V2GenericMappingFormat): string {
  return `.${format}`
}

function withExtension(filePath: string, extension: string): string {
  return extname(filePath).toLowerCase() === extension ? filePath : `${filePath}${extension}`
}

function fileFilter(extension: string): Electron.FileFilter[] {
  const name = extension === '.png' ? 'PNG Image' : extension === '.svg' ? 'SVG Image' : extension === '.xml' ? 'XML' : extension === '.json' ? 'JSON' : 'CSV'
  return [{ name, extensions: [extension.slice(1)] }]
}

function validateFile(value: unknown): ExportFilePayload {
  if (value === null || typeof value !== 'object') throw new Error('Invalid export file payload.')
  const file = value as Partial<ExportFilePayload>
  const name = safeFileName(file.name)
  if (!(file.bytes instanceof Uint8Array)) throw new Error(`Invalid bytes for ${name}.`)
  if (file.bytes.byteLength > 512 * 1024 * 1024) throw new Error(`${name} exceeds the 512 MB export limit.`)
  return { name, bytes: file.bytes }
}

async function writeChunks(filePath: string, chunks: Iterable<string>): Promise<void> {
  const handle = await open(filePath, 'w')
  try {
    let pending = ''
    for (const chunk of chunks) {
      pending += chunk
      if (pending.length >= 1024 * 1024) {
        await handle.write(pending, null, 'utf8')
        pending = ''
      }
    }
    if (pending.length > 0) await handle.write(pending, null, 'utf8')
  } finally {
    await handle.close()
  }
}

export class ExportFileService {
  private cancelNext = false

  simulateCancel(): boolean {
    if (!process.env['LEDMAP_SMOKE_EXPORT_DIR']) return false
    this.cancelNext = true
    return true
  }

  async writeFiles(owner: WebContents, value: unknown): Promise<ExportWriteResult> {
    if (value === null || typeof value !== 'object') throw new Error('Invalid export request.')
    const request = value as Partial<WriteExportFilesRequest>
    if (request.mode !== 'single' && request.mode !== 'batch') throw new Error('Invalid export mode.')
    if (!Array.isArray(request.files) || request.files.length === 0) throw new Error('Export requires at least one file.')
    if (request.mode === 'single' && request.files.length !== 1) throw new Error('Single export requires exactly one file.')
    const files = request.files.map(validateFile)
    if (files.some(file => !['.png', '.svg', '.xml', '.csv'].includes(extname(file.name).toLowerCase()))) {
      throw new Error('Unsupported export file extension.')
    }
    if (new Set(files.map(file => file.name)).size !== files.length) throw new Error('Export file names must be unique.')
    if (this.consumeCancel()) return { canceled: true, filePaths: [] }
    const paths = await this.destinationPaths(owner, request.mode, files.map(file => file.name))
    if (!paths) return { canceled: true, filePaths: [] }
    for (let index = 0; index < files.length; index += 1) await writeFile(paths[index]!, files[index]!.bytes)
    return { canceled: false, filePaths: paths }
  }

  async writeGenericMapping(owner: WebContents, value: unknown): Promise<ExportWriteResult> {
    if (value === null || typeof value !== 'object') throw new Error('Invalid Generic Mapping export request.')
    const request = value as Partial<WriteGenericMappingRequest>
    if (request.format !== 'json' && request.format !== 'csv') throw new Error('Invalid Generic Mapping format.')
    if (request.input === null || typeof request.input !== 'object') throw new Error('Invalid Generic Mapping export input.')
    if (request.scope?.kind !== 'composition' && request.scope?.kind !== 'screen') throw new Error('Invalid Generic Mapping scope.')
    if (request.scope.kind === 'screen' && typeof request.scope.screenId !== 'string') throw new Error('Invalid Generic Mapping Screen.')
    const name = safeFileName(request.name)
    const extension = extensionFor(request.format)
    const fileName = extname(name).toLowerCase() === extension ? name : `${name}${extension}`
    const preflight = preflightV2GenericMapping(request.input, request.scope)
    if (!preflight.ready) throw new V2ExportPreflightError(preflight)
    if (this.consumeCancel()) return { canceled: true, filePaths: [] }
    const paths = await this.destinationPaths(owner, 'single', [fileName])
    if (!paths) return { canceled: true, filePaths: [] }
    await writeChunks(paths[0]!, genericMappingV2Chunks(request.input, request.scope, request.format))
    return { canceled: false, filePaths: paths }
  }

  private consumeCancel(): boolean {
    if (!this.cancelNext) return false
    this.cancelNext = false
    return true
  }

  private async destinationPaths(
    owner: WebContents,
    mode: WriteExportFilesRequest['mode'],
    names: readonly string[],
  ): Promise<readonly string[] | null> {
    const firstName = names[0]
    if (!firstName) throw new Error('Export requires at least one destination.')
    const smokeDirectory = process.env['LEDMAP_SMOKE_EXPORT_DIR']
    if (smokeDirectory) {
      await mkdir(smokeDirectory, { recursive: true })
      return names.map(name => resolve(smokeDirectory, name))
    }
    const window = BrowserWindow.fromWebContents(owner)
    if (!window) throw new Error('Editor window is unavailable.')
    if (mode === 'batch') {
      const result = await dialog.showOpenDialog(window, {
        title: 'Export LedMAP files',
        properties: ['openDirectory', 'createDirectory'],
      })
      if (result.canceled || !result.filePaths[0]) return null
      return names.map(name => resolve(result.filePaths[0]!, name))
    }
    const extension = extname(firstName).toLowerCase()
    const result = await dialog.showSaveDialog(window, {
      title: 'Export from LedMAP',
      defaultPath: firstName,
      filters: fileFilter(extension),
    })
    if (result.canceled || !result.filePath) return null
    return [withExtension(result.filePath, extension)]
  }
}
