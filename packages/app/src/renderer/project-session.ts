import {
  convertEditableProjectToV2,
  createEmptyProjectV2,
  createProjectV2,
  assertProjectV2EditorStructure,
  loadEditableProject,
  inspectProjectV2,
  projectV2AsEditableReadModel,
  serializeEditableProject,
  DomainError,
  type EditableProject,
  type JsonObject,
  type LedMapProjectV2,
} from '@ledmap/core'
import { projectV2WorkspaceReadModel } from './v2-read-model.js'
import type { Project } from './project.js'

export interface ProjectSession<TProject = LedMapProjectV2> {
  readonly project: TProject
  readonly revision: number
  readonly savedRevision: number
  readonly documentId: string
  readonly currentFilePath: string | null
  readonly sourceSchemaVersion: 1 | 2 | 3
  readonly extensions: JsonObject
}

export function sessionDirty(session: ProjectSession): boolean {
  return session.revision !== session.savedRevision
}

export function createProjectSession(documentId: string): ProjectSession {
  return Object.freeze({
    project: createEmptyProjectV2(),
    revision: 0,
    savedRevision: 0,
    documentId,
    currentFilePath: null,
    sourceSchemaVersion: 2,
    extensions: Object.freeze({}),
  })
}

export function loadProjectSession(text: string, currentFilePath: string, documentId: string): ProjectSession {
  const loaded = loadEditableProject(text)
  const project = convertEditableProjectToV2(loaded.project)
  projectV2WorkspaceReadModel(project)
  return Object.freeze({
    project,
    revision: 0,
    savedRevision: 0,
    documentId,
    currentFilePath,
    sourceSchemaVersion: loaded.sourceSchemaVersion,
    extensions: loaded.extensions,
  })
}

export function sessionWorkspaceProject(session: ProjectSession): Project {
  return projectV2WorkspaceReadModel(session.project)
}

export function sameDocumentValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((value, index) => sameDocumentValue(value, right[index]))
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord).sort()
  const rightKeys = Object.keys(rightRecord).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => (
    key === rightKeys[index] && sameDocumentValue(leftRecord[key], rightRecord[key])
  ))
}

function receiverValues(source: EditableProject): readonly object[] {
  return source.hardwareTopology.receivers.map(receiver => ({
    id: receiver.id,
    index: receiver.index,
    processor: receiver.processor,
    port: receiver.port,
    pixelCapacity: receiver.pixelCapacity,
  }))
}

function receiverChains(source: EditableProject): readonly object[] {
  return source.hardwareTopology.receivers.map(receiver => ({ id: receiver.id, cabinets: receiver.cabinets }))
}

function patchedAssignments(original: LedMapProjectV2, converted: LedMapProjectV2): LedMapProjectV2['hardware']['assignments'] {
  const prior = new Map(original.hardware.assignments.map(value => [value.target.cabinetId, value]))
  return converted.hardware.assignments.map(value => {
    const existing = prior.get(value.target.cabinetId)
    if (!existing) return value
    if (existing.receiverId !== value.receiverId && (existing.locked !== true || existing.origin !== undefined)) {
      throw new DomainError('PROJECT_COMPAT_MUTATION_BLOCKED', `Cabinet ${value.target.cabinetId} has V2-only assignment metadata`)
    }
    return { ...value, id: existing.id, locked: existing.locked, ...(existing.origin === undefined ? {} : { origin: existing.origin }) }
  })
}

function patchedRoutes(original: LedMapProjectV2, converted: LedMapProjectV2): LedMapProjectV2['operations']['signalRoutes'] {
  const prior = new Map(original.operations.signalRoutes.map(value => [value.receiverId, value]))
  const result = converted.operations.signalRoutes.map(value => ({
    ...value,
    id: prior.get(value.receiverId)?.id ?? value.id,
  }))
  const receiverIds = new Set(converted.hardware.receivers.map(value => value.id))
  const present = new Set(result.map(value => value.receiverId))
  for (const route of original.operations.signalRoutes) {
    if (route.orderedCabinetIds.length === 0 && receiverIds.has(route.receiverId) && !present.has(route.receiverId)) {
      result.push(route)
    }
  }
  return result
}

export function commitLegacyProject(session: ProjectSession, next: Project): ProjectSession {
  const original = session.project
  const before = projectV2AsEditableReadModel(original)
  const after = next.source
  if (sameDocumentValue(before, after)) return session
  const converted = convertEditableProjectToV2(after)
  const chainsChanged = !sameDocumentValue(receiverChains(before), receiverChains(after))
  const changedPlacements = !sameDocumentValue(before.editorLayout, after.editorLayout)
  const previousCabinets = new Map(original.design.cabinets.map(value => [value.id, value]))
  const previousPlacements = new Map(original.design.composition.placements.map(value => [value.screenId, value]))
  const placements = changedPlacements
    ? converted.design.composition.placements.map(value => {
      const existing = previousPlacements.get(value.screenId)
      if (existing?.locked && (existing.x !== value.x || existing.y !== value.y)) {
        throw new DomainError('PROJECT_COMPAT_MUTATION_BLOCKED', `Screen ${value.screenId} has a locked V2 placement`)
      }
      return { ...value, locked: existing?.locked ?? false }
    })
    : original.design.composition.placements
  const screenIds = new Set(converted.design.screens.map(value => value.id))
  if (original.design.stage?.placements.some(value => !screenIds.has(value.screenId))) {
    throw new DomainError('PROJECT_COMPAT_MUTATION_BLOCKED', 'The legacy mutation would leave a Stage placement without a Screen')
  }
  const candidate = createProjectV2({
    ...original,
    design: {
      ...original.design,
      screens: sameDocumentValue(before.screens, after.screens) ? original.design.screens : converted.design.screens,
      cabinetGrids: sameDocumentValue(before.cabinetGrids, after.cabinetGrids) ? original.design.cabinetGrids : converted.design.cabinetGrids,
      cabinets: sameDocumentValue(before.hardwareTopology.cabinets, after.hardwareTopology.cabinets)
        ? original.design.cabinets
        : converted.design.cabinets.map(value => ({ ...value, label: previousCabinets.get(value.id)?.label ?? value.label })),
      modules: sameDocumentValue(before.hardwareTopology.modules, after.hardwareTopology.modules)
        ? original.design.modules : converted.design.modules,
      composition: { placements },
    },
    content: {
      ...original.content,
      inputCanvases: sameDocumentValue(before.inputCanvas, after.inputCanvas)
        ? original.content.inputCanvases : converted.content.inputCanvases,
      mappingRegions: sameDocumentValue(before.mappingRegions, after.mappingRegions)
        ? original.content.mappingRegions : converted.content.mappingRegions,
    },
    hardware: {
      ...original.hardware,
      processors: sameDocumentValue(before.hardwareTopology.processors, after.hardwareTopology.processors)
        ? original.hardware.processors : converted.hardware.processors,
      ports: sameDocumentValue(before.hardwareTopology.ports, after.hardwareTopology.ports)
        ? original.hardware.ports : converted.hardware.ports,
      receivers: sameDocumentValue(receiverValues(before), receiverValues(after))
        ? original.hardware.receivers : converted.hardware.receivers,
      assignments: chainsChanged ? patchedAssignments(original, converted) : original.hardware.assignments,
      processorOrder: sameDocumentValue(before.hardwareTopology.processorOrder, after.hardwareTopology.processorOrder)
        ? original.hardware.processorOrder : converted.hardware.processorOrder,
      receiverOrder: sameDocumentValue(before.hardwareTopology.receiverOrder, after.hardwareTopology.receiverOrder)
        ? original.hardware.receiverOrder : converted.hardware.receiverOrder,
    },
    operations: {
      ...original.operations,
      signalRoutes: chainsChanged ? patchedRoutes(original, converted) : original.operations.signalRoutes,
    },
    remap: {
      rules: sameDocumentValue(before.rules, after.rules) ? original.remap.rules : converted.remap.rules,
    },
  })
  if (!sameDocumentValue(projectV2AsEditableReadModel(candidate), after)) {
    throw new DomainError('PROJECT_COMPAT_MUTATION_LOSSY', 'The legacy mutation cannot be represented in Project Model v2')
  }
  if (sameDocumentValue(original, candidate)) {
    throw new DomainError('PROJECT_COMPAT_MUTATION_LOSSY', 'The legacy mutation produced no Project Model v2 change')
  }
  return commitProjectV2(session, () => candidate)
}

export function commitProjectV2(session: ProjectSession, command: (project: LedMapProjectV2) => LedMapProjectV2): ProjectSession {
  const proposed = command(session.project)
  if (sameDocumentValue(session.project, proposed)) return session
  const candidate = createProjectV2(proposed)
  assertProjectV2EditorStructure(candidate)
  const diagnostic = inspectProjectV2(candidate)[0]
  if (diagnostic) throw new DomainError('PROJECT_V2_INVALID', `${diagnostic.code}: ${diagnostic.message}`)
  projectV2WorkspaceReadModel(candidate)
  if (!Number.isSafeInteger(session.revision + 1)) throw new DomainError('PROJECT_REVISION_OVERFLOW', 'Project revision exceeds the safe integer range')
  return Object.freeze({ ...session, project: candidate, revision: session.revision + 1 })
}

export function serializeProjectSession(session: ProjectSession): string {
  const editable = projectV2AsEditableReadModel(session.project)
  if (!sameDocumentValue(convertEditableProjectToV2(editable), session.project)) {
    throw new DomainError('PROJECT_COMPAT_SAVE_LOSSY', 'Project Model v2 contains data that schemaVersion 2 cannot preserve')
  }
  return serializeEditableProject({ project: editable, extensions: session.extensions })
}

export function markProjectSessionSaved(
  session: ProjectSession,
  documentId: string,
  savedRevision: number,
  currentFilePath: string,
): ProjectSession {
  if (session.documentId !== documentId) return session
  if (savedRevision > session.revision) throw new DomainError('PROJECT_REVISION_INVALID', 'Saved revision exceeds current revision')
  return Object.freeze({ ...session, savedRevision, currentFilePath, sourceSchemaVersion: 2 })
}
