import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import { detectDevices, startDeviceWatcher, DetectedDevice } from './deviceManager'
import { downloadAudio, ProgressPayload, getBinaries } from './downloader'

let win: BrowserWindow | null = null
const isDev = !app.isPackaged

function createWindow(): void {
  win = new BrowserWindow({
    width: 1060,
    height: 780,
    minWidth: 840,
    minHeight: 650,
    title: 'Sunthree - Suunto Companion',
    backgroundColor: '#090a0f',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      webSecurity: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  }

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          isDev
            ? "script-src 'self' 'unsafe-eval' 'unsafe-inline' localhost:*; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;"
            : "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;"
        ].join(' ')
      }
    })
  })
}

function setupIpc(): void {
  // 1. Get detected devices
  ipcMain.handle('devices:list', async () => {
    return detectDevices()
  })

  // 2. Resolve default downloads path
  ipcMain.handle('system:get-downloads-dir', async () => {
    return path.join(app.getPath('downloads'), 'MUSIC')
  })

  // 3. Open path in OS file explorer
  ipcMain.handle('system:open-path', async (_event, folderPath: string) => {
    if (folderPath) {
      await shell.openPath(folderPath)
    }
  })

  // 4. Download audio directly with native yt-dlp
  ipcMain.handle(
    'download:start',
    async (event, { url, targetPath }: { url: string; targetPath: string }) => {
      try {
        let finalPath = targetPath
        if (targetPath === 'downloads' || !targetPath) {
          finalPath = path.join(app.getPath('downloads'), 'MUSIC')
        }

        const { promise } = downloadAudio(url, finalPath, (progress: ProgressPayload) => {
          if (win && !win.isDestroyed()) {
            event.sender.send('download:progress', progress)
          }
        })

        const completedFile = await promise
        return { success: true, file: completedFile }
      } catch (err: unknown) {
        console.error('Download failed:', err)
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // Backward-compatible handler for old engine-command invocations
  ipcMain.on('engine-command', async (event, { command, payload }) => {
    if (command === 'list-drives') {
      const devices = detectDevices()
      event.sender.send('engine-response', {
        type: 'drives-list',
        drives: devices.map((d) => ({ name: d.name, path: d.mountPoint }))
      })
    } else if (command === 'download-video') {
      let dest = payload.path
      if (dest === 'downloads') {
        dest = path.join(app.getPath('downloads'), 'MUSIC')
      }

      downloadAudio(payload.url, dest, (progress) => {
        if (progress.status === 'downloading' || progress.status === 'converting') {
          event.sender.send('engine-response', {
            type: 'download-progress',
            progress: {
              status: progress.status,
              percent: progress.percent,
              speed: progress.speed || '',
              eta: progress.eta || ''
            }
          })
        } else if (progress.status === 'completed') {
          event.sender.send('engine-response', {
            type: 'download-complete',
            file: progress.file || ''
          })
        } else if (progress.status === 'error') {
          event.sender.send('engine-response', {
            type: 'error',
            message: progress.message || 'Download failed'
          })
        }
      })
    }
  })
}

app.whenReady().then(() => {
  createWindow()
  setupIpc()

  // Log binary locations on launch
  const bins = getBinaries()
  console.log('✅ Native Engine Initialized:')
  console.log(`   yt-dlp: ${bins.ytDlpPath}`)
  console.log(`   ffmpeg dir: ${bins.ffmpegDir}`)

  // Send initial engine-ready signal for backward compatibility
  if (win) {
    win.webContents.once('did-finish-load', () => {
      win?.webContents.send('engine-ready')
      win?.webContents.send('devices:updated', detectDevices())
    })
  }

  // Start hotplug watcher to auto-detect device plug/unplug events
  startDeviceWatcher((devices: DetectedDevice[]) => {
    console.log(`🔌 Devices updated. Found ${devices.length} storage volumes.`)
    if (win && !win.isDestroyed()) {
      win.webContents.send('devices:updated', devices)
      win.webContents.send('engine-response', {
        type: 'drives-list',
        drives: devices.map((d) => ({ name: d.name, path: d.mountPoint }))
      })
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
