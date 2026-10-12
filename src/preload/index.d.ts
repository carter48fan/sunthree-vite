import { ElectronAPI } from '@electron-toolkit/preload'
import { DetectedDevice, DownloadProgress } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    electronAPI: {
      getDevices: () => Promise<DetectedDevice[]>
      getDownloadsDir: () => Promise<string>
      startDownload: (
        url: string,
        targetPath: string
      ) => Promise<{ success: boolean; file?: string; error?: string }>
      openPath: (folderPath: string) => Promise<void>
      onDevicesUpdated: (callback: (devices: DetectedDevice[]) => void) => () => void
      onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void
      sendCommand: (command: string, payload?: unknown) => void
      onEngineResponse: (callback: (response: unknown) => void) => void
      onEngineReady: (callback: () => void) => void
    }
  }
}
