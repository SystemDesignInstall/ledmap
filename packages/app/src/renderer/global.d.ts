import type { LedmapDesktopApi } from '../shared/ipc.js'

declare global {
  interface Window {
    readonly ledmapDesktop: LedmapDesktopApi
  }
}

export {}
