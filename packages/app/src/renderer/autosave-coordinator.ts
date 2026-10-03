import type { RecoverySaveCommit, RecoverySnapshotRequest } from '../shared/ipc.js'
import { serializeProjectSession, sessionDirty, type ProjectSession } from './project-session.js'

interface RecoveryTransport {
  writeRecovery(request: RecoverySnapshotRequest): Promise<void>
  reconcileRecovery(request: RecoverySaveCommit): Promise<void>
  discardRecovery(recoveryId: string): Promise<void>
}

interface ActiveRecovery {
  readonly recoveryId: string
  readonly sessionEpoch: string
  readonly documentId: string
  sourcePath: string | null
  baselineSourceSha256: string | null
  lastCommittedRevision: number
  failures: number
  stopped: boolean
}

const retryDelays = [2_000, 5_000, 15_000] as const

export class AutosaveCoordinator {
  private active: ActiveRecovery | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private maxTimer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private pending: Promise<void> = Promise.resolve()

  constructor(
    private readonly getSession: () => ProjectSession,
    private readonly transport: RecoveryTransport,
    private readonly diagnostic: (error: unknown) => void = () => undefined,
  ) {}

  attach(session: ProjectSession, baselineSourceSha256: string | null, recoveryId: string = crypto.randomUUID()): void {
    this.cancelTimers()
    this.active = { recoveryId, sessionEpoch: crypto.randomUUID(), documentId: session.documentId,
      sourcePath: session.currentFilePath, baselineSourceSha256, lastCommittedRevision: 0, failures: 0, stopped: false }
  }

  get recoveryId(): string | null { return this.active?.recoveryId ?? null }

  mutation(before: ProjectSession, after: ProjectSession): void {
    const active = this.active
    if (!active || active.stopped || before.documentId !== active.documentId || after.documentId !== active.documentId ||
        before.revision === after.revision) return
    active.failures = 0
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null }
    if (sessionDirty(after)) this.schedule(active)
    else {
      this.cancelTimers()
      this.reconcileClean(active, after.stateId)
    }
  }

  private reconcileClean(active: ActiveRecovery, stateId: number): void {
    this.pending = this.pending.then(async () => {
      if (this.active !== active) return
      const current = this.getSession()
      if (current.documentId !== active.documentId || sessionDirty(current) || current.stateId !== stateId) return
      await this.transport.discardRecovery(active.recoveryId)
      active.lastCommittedRevision = Math.max(active.lastCommittedRevision, current.revision)
      const latest = this.getSession()
      if (this.active === active && latest.documentId === active.documentId && sessionDirty(latest)) this.trigger(active)
    }).catch(error => { this.diagnostic(error) })
  }

  private schedule(active: ActiveRecovery): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.trigger(active), 2_000)
    if (!this.maxTimer) this.maxTimer = setTimeout(() => this.trigger(active), 30_000)
  }

  private trigger(active: ActiveRecovery): void {
    if (this.active !== active || active.stopped) return
    this.clearSchedule()
    const snapshot = this.getSession()
    if (snapshot.documentId !== active.documentId || !sessionDirty(snapshot) ||
        snapshot.revision <= active.lastCommittedRevision) return
    this.pending = this.pending.then(async () => {
      if (this.active !== active || active.stopped) return
      const current = this.getSession()
      if (current.documentId !== active.documentId || !sessionDirty(current) ||
          snapshot.revision <= current.savedRevision ||
          snapshot.revision <= active.lastCommittedRevision) return
      try {
        const text = serializeProjectSession(snapshot)
        await this.transport.writeRecovery({ recoveryId: active.recoveryId, sessionEpoch: active.sessionEpoch,
          text, sourcePath: active.sourcePath, displayName: snapshot.project.metadata.name ?? 'Untitled',
          snapshotRevision: snapshot.revision, observedSavedRevision: current.savedRevision,
          sourceSchemaVersion: current.sourceSchemaVersion, baselineSourceSha256: active.baselineSourceSha256 })
        active.lastCommittedRevision = snapshot.revision
        active.failures = 0
        const latest = this.getSession()
        if (this.active === active && latest.documentId === active.documentId &&
            sessionDirty(latest) && latest.revision > snapshot.revision && !this.idleTimer) this.schedule(active)
      } catch (error) {
        active.failures += 1
        if (active.failures >= retryDelays.length) this.diagnostic(error)
        const delay = retryDelays[active.failures - 1]
        if (delay && this.active === active && !active.stopped && !this.retryTimer) {
          this.retryTimer = setTimeout(() => { this.retryTimer = null; this.trigger(active) }, delay)
        }
      }
    })
  }

  async saved(snapshot: ProjectSession, current: ProjectSession, sha256: string): Promise<void> {
    const active = this.active
    if (!active || active.documentId !== snapshot.documentId || current.documentId !== snapshot.documentId) return
    const sourcePath = current.currentFilePath
    active.sourcePath = sourcePath
    active.baselineSourceSha256 = sha256
    if (!sessionDirty(current)) {
      this.cancelTimers()
      this.reconcileClean(active, current.stateId)
    } else {
      if (!this.idleTimer && !this.maxTimer) this.schedule(active)
      this.pending = this.pending.then(async () => {
        if (!sourcePath || this.active !== active) return
        await this.transport.reconcileRecovery({ recoveryId: active.recoveryId, sessionEpoch: active.sessionEpoch,
          savedRevision: snapshot.revision, currentRevision: current.revision, sourcePath,
          baselineSourceSha256: sha256 })
      }).catch(error => { this.diagnostic(error) })
    }
    let timeout: ReturnType<typeof setTimeout> | undefined
    await Promise.race([this.pending, new Promise<void>(resolve => {
      timeout = setTimeout(resolve, 5_000)
    })])
    if (timeout) clearTimeout(timeout)
  }

  async discard(): Promise<void> {
    const active = this.active
    if (!active) return
    active.stopped = true
    this.cancelTimers()
    await this.pending
    try {
      await this.transport.discardRecovery(active.recoveryId)
      if (this.active === active) this.active = null
    } catch (error) {
      active.stopped = false
      if (this.active === active && sessionDirty(this.getSession())) this.schedule(active)
      throw error
    }
  }

  async settle(): Promise<void> { await this.pending }

  private clearSchedule(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    if (this.maxTimer) clearTimeout(this.maxTimer)
    this.idleTimer = null
    this.maxTimer = null
  }

  private cancelTimers(): void {
    this.clearSchedule()
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
  }
}
