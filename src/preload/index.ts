import { contextBridge, ipcRenderer } from 'electron'

export interface DetectedDevice {
  id: string
  name: string
  model: 'suunto-wing' | 'suunto-sonic' | 'suunto-watch' | 'generic'
  modelName: string
  volumeLabel: string
  mountPoint: string
  musicPath: string
  hasMusicFolder: boolean
  isRemovable: boolean
  isWayneDevice: boolean
  size?: string
  vendor?: string
}

export interface DownloadProgress {
  status: 'starting' | 'downloading' | 'converting' | 'completed' | 'error'
  percent: number
  speed?: string
  eta?: string
  file?: string
  message?: string
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Modern direct IPC methods
  getDevices: (): Promise<DetectedDevice[]> => ipcRenderer.invoke('devices:list'),
  getDownloadsDir: (): Promise<string> => ipcRenderer.invoke('system:get-downloads-dir'),
  startDownload: (
    url: string,
    targetPath: string
  ): Promise<{ success: boolean; file?: string; error?: string }> =>
    ipcRenderer.invoke('download:start', { url, targetPath }),
  openPath: (folderPath: string): Promise<void> =>
    ipcRenderer.invoke('system:open-path', folderPath),

  onDevicesUpdated: (callback: (devices: DetectedDevice[]) => void): (() => void) => {
    const handler = (_event: unknown, devices: DetectedDevice[]): void => callback(devices)
    ipcRenderer.on('devices:updated', handler)
    return (): void => {
      ipcRenderer.removeListener('devices:updated', handler)
    }
  },
  onDownloadProgress: (callback: (progress: DownloadProgress) => void): (() => void) => {
    const handler = (_event: unknown, progress: DownloadProgress): void => callback(progress)
    ipcRenderer.on('download:progress', handler)
    return (): void => {
      ipcRenderer.removeListener('download:progress', handler)
    }
  },

  // Legacy backward-compatibility
  sendCommand: (command: string, payload: unknown = {}): void => {
    ipcRenderer.send('engine-command', { command, payload })
  },
  onEngineResponse: (callback: (response: unknown) => void): void => {
    ipcRenderer.on('engine-response', (_event, value) => callback(value))
  },
  onEngineReady: (callback: () => void): void => {
    ipcRenderer.once('engine-ready', () => callback())
  }
})
