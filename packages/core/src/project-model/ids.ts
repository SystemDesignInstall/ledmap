import { brand, type Brand } from '../model/ids.js'

export type MediaOutputCanvasId = Brand<'MediaOutputCanvasId'>
export type OutputMappingId = Brand<'OutputMappingId'>
export type SignalRouteId = Brand<'SignalRouteId'>
export type HardwareAssignmentId = Brand<'HardwareAssignmentId'>
export type BackupRouteId = Brand<'BackupRouteId'>
export type LiveOutputTargetId = Brand<'LiveOutputTargetId'>

export const asMediaOutputCanvasId = (value: string): MediaOutputCanvasId => brand<'MediaOutputCanvasId'>(value)
export const asOutputMappingId = (value: string): OutputMappingId => brand<'OutputMappingId'>(value)
export const asSignalRouteId = (value: string): SignalRouteId => brand<'SignalRouteId'>(value)
export const asHardwareAssignmentId = (value: string): HardwareAssignmentId => brand<'HardwareAssignmentId'>(value)
export const asBackupRouteId = (value: string): BackupRouteId => brand<'BackupRouteId'>(value)
export const asLiveOutputTargetId = (value: string): LiveOutputTargetId => brand<'LiveOutputTargetId'>(value)
