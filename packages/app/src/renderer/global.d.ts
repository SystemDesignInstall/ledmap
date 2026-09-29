import type { LedmapDesktopApi, LedmapOutputApi } from '../shared/ipc.js'

declare global {
  interface Window {
    readonly ledmapDesktop: LedmapDesktopApi
    readonly ledmapOutput: LedmapOutputApi
  }
}

export {}
