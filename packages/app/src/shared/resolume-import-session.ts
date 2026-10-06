import type { LedMapProjectV2, PixelRect, Size } from '@ledmap/core'
import { parseResolumeAdvancedOutput, RESOLUME_XML_MAX_BYTES } from './resolume-import.js'
import { applyResolumeOutputImport, type ResolumeSliceBinding } from './resolume-project.js'
import { freezeResolume, type ResolumeNativeDocument } from './resolume-types.js'

export interface ResolumeDocumentStamp { readonly documentId: string; readonly revision: number }
export interface ResolumeImportSettings {
  readonly frame: PixelRect
  readonly bindings: readonly ResolumeSliceBinding[]
  readonly rasterOverrides: Readonly<Record<string, Size>>
}
export interface ResolumeImportPreview {
  readonly addedOutputs: number
  readonly mappings: readonly { readonly name: string; readonly screenId: string; readonly screenRect: PixelRect }[]
}

export function decodeResolumeFile(bytes: Uint8Array): string {
  if (bytes.byteLength > RESOLUME_XML_MAX_BYTES) throw new Error('Choose an XML file no larger than 2 MiB.')
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { throw new Error('Choose an XML file encoded as UTF-8.') }
}

export class ResolumeImportSession {
  private source: ResolumeNativeDocument | null = null
  private prepared: {
    readonly stamp: ResolumeDocumentStamp
    readonly settings: ResolumeImportSettings
    readonly intent: string
    readonly summary: ResolumeImportPreview
  } | null = null

  get document(): ResolumeNativeDocument | null { return this.source }
  get preview(): ResolumeImportPreview | null { return this.prepared?.summary ?? null }

  invalidate(): void { this.prepared = null }
  clear(): void { this.invalidate(); this.source = null }

  inspect(text: string): ResolumeNativeDocument {
    this.clear()
    this.source = parseResolumeAdvancedOutput(text)
    return this.source
  }

  prepare(project: LedMapProjectV2, stamp: ResolumeDocumentStamp, settings: ResolumeImportSettings): ResolumeImportPreview {
    this.invalidate()
    if (!this.source) throw new Error('Select an Arena XML file first.')
    const copied = freezeResolume({ frame: { ...settings.frame }, bindings: settings.bindings.map(value => ({ ...value })),
      rasterOverrides: Object.fromEntries(Object.entries(settings.rasterOverrides).map(([id, size]) => [id, { ...size }])) })
    const candidate = applyResolumeOutputImport(project, this.source, copied.frame, copied.bindings, copied.rasterOverrides)
    const summary = freezeResolume({ addedOutputs: candidate.content.mediaOutputs.length - project.content.mediaOutputs.length,
      mappings: candidate.content.outputMappings.slice(project.content.outputMappings.length).map(mapping => ({
        name: mapping.name, screenId: String(mapping.screenId), screenRect: { ...mapping.screenRect },
      })) })
    this.prepared = { stamp: { documentId: stamp.documentId, revision: stamp.revision }, settings: copied,
      intent: JSON.stringify(candidate.content), summary }
    return summary
  }

  apply(project: LedMapProjectV2, stamp: ResolumeDocumentStamp): LedMapProjectV2 {
    const prepared = this.prepared
    if (!prepared || !this.source) throw new Error('Preview the import before applying it.')
    this.invalidate()
    if (stamp.documentId !== prepared.stamp.documentId || stamp.revision !== prepared.stamp.revision) {
      throw new Error('The project changed. Preview the import again.')
    }
    const settings = prepared.settings
    const candidate = applyResolumeOutputImport(project, this.source, settings.frame, settings.bindings, settings.rasterOverrides)
    if (JSON.stringify(candidate.content) !== prepared.intent) throw new Error('The import result changed. Preview the import again.')
    return candidate
  }
}
