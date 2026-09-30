import { projectV2AsEditableReadModel, type LedMapProjectV2 } from '@ledmap/core'
import { createProject, type Project } from './project.js'

function detachedFrozen<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(item => detachedFrozen(item))) as T
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, detachedFrozen(item)]))) as T
  }
  return value
}

export function projectV2WorkspaceReadModel(project: LedMapProjectV2): Project {
  return detachedFrozen(createProject(projectV2AsEditableReadModel(project)))
}
