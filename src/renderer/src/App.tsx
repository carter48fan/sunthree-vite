import type { JSX } from 'react'
import { useState, useEffect, useCallback } from 'react'
import { DetectedDevice, DownloadProgress } from '../../preload'
import { DeviceGraphic } from './components/DeviceGraphic'

export default function App(): JSX.Element {
  const [url, setUrl] = useState('')
  const [devices, setDevices] = useState<DetectedDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<DetectedDevice | null>(null)
  const [downloadsDir, setDownloadsDir] = useState<string>('')
  const [useDownloadsFallback, setUseDownloadsFallback] = useState(false)
  const [delistedIds, setDelistedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('sunthree_delisted_devices')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  const [isDownloading, setIsDownloading] = useState(false)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>('Searching for devices...')
  const [completedFile, setCompletedFile] = useState<string | null>(null)
  const [isDarkMode, setIsDarkMode] = useState(true)

  // Synchronize dark mode class
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDarkMode])

  // Load downloads directory
  useEffect(() => {
    if (window.electronAPI?.getDownloadsDir) {
      window.electronAPI.getDownloadsDir().then((dir) => setDownloadsDir(dir))
    }
  }, [])

  // Filter devices excluding any that were manually delisted
  const activeDevices = devices.filter(
    (d) => !delistedIds.includes(d.id) && !delistedIds.includes(d.mountPoint)
  )

  // Update selected device from list
  const applyDevices = useCallback(
    (deviceList: DetectedDevice[]) => {
      setDevices(deviceList)

      const activeList = deviceList.filter(
        (d) => !delistedIds.includes(d.id) && !delistedIds.includes(d.mountPoint)
      )

      if (activeList.length > 0) {
        // Pick first device (they are already sorted by priority: Wayne's device & Suunto first)
        const primary = activeList[0]
        setSelectedDevice(primary)
        setUseDownloadsFallback(false)

        if (primary.hasMusicFolder) {
          setStatusMessage(`Matched ${primary.name} with active MUSIC folder!`)
        } else {
          setStatusMessage(`Connected: ${primary.name}. MUSIC folder will be created on transfer.`)
        }
      } else {
        setSelectedDevice(null)
        setStatusMessage('No external music devices detected. Ready for Downloads folder.')
      }
    },
    [delistedIds]
  )

  const handleDelistCurrentDevice = (): void => {
    if (!selectedDevice) return
    const idToDelist = selectedDevice.id
    const mountToDelist = selectedDevice.mountPoint
    const updated = Array.from(new Set([...delistedIds, idToDelist, mountToDelist]))
    setDelistedIds(updated)
    try {
      localStorage.setItem('sunthree_delisted_devices', JSON.stringify(updated))
    } catch {
      // Ignore storage errors
    }

    const remaining = devices.filter(
      (d) => !updated.includes(d.id) && !updated.includes(d.mountPoint)
    )
    if (remaining.length > 0) {
      setSelectedDevice(remaining[0])
    } else {
      setSelectedDevice(null)
      setUseDownloadsFallback(true)
    }
    setStatusMessage(`Delisted "${selectedDevice.name}". It will be ignored in future scans.`)
  }

  const handleRestoreDelisted = (): void => {
    setDelistedIds([])
    try {
      localStorage.removeItem('sunthree_delisted_devices')
    } catch {
      // Ignore
    }
    const primary = devices[0]
    if (primary) {
      setSelectedDevice(primary)
      setUseDownloadsFallback(false)
      setStatusMessage(`Restored all delisted devices. Connected to ${primary.name}.`)
    } else {
      setStatusMessage('Restored all delisted devices.')
    }
  }

  // Initialize devices & listeners
  useEffect(() => {
    if (!window.electronAPI) return

    // 1. Initial devices fetch
    window.electronAPI.getDevices().then(applyDevices)

    // 2. Hotplug event listener
    const unsubDevices = window.electronAPI.onDevicesUpdated((updatedList) => {
      applyDevices(updatedList)
    })

    // 3. Download progress listener
    const unsubProgress = window.electronAPI.onDownloadProgress((prog) => {
      setProgress(prog)
      if (prog.status === 'downloading') {
        setStatusMessage(`Downloading audio (${Math.round(prog.percent)}%)...`)
      } else if (prog.status === 'converting') {
        setStatusMessage('Converting audio to 192kbps MP3...')
      } else if (prog.status === 'completed') {
        setIsDownloading(false)
        setCompletedFile(prog.file || 'Audio Track')
        setStatusMessage('Track successfully transferred!')
      } else if (prog.status === 'error') {
        setIsDownloading(false)
        setStatusMessage(`Error: ${prog.message || 'Download failed'}`)
      }
    })

    return () => {
      unsubDevices?.()
      unsubProgress?.()
    }
  }, [applyDevices])

  // Auto-detect clipboard URL when window gets focus
  const checkClipboard = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText()
      if (text && (text.includes('youtube.com/watch') || text.includes('youtu.be/'))) {
        setUrl(text.trim())
        setStatusMessage('YouTube link pasted from clipboard!')
      }
    } catch {
      // Clipboard permissions may fail if not focused
    }
  }

  const handleDownload = async (): Promise<void> => {
    if (!url.trim()) {
      setStatusMessage('Please enter or paste a YouTube URL.')
      return
    }

    const targetPath = useDownloadsFallback
      ? downloadsDir
      : selectedDevice?.musicPath || downloadsDir

    if (!targetPath) {
      setStatusMessage('Please choose a valid destination folder.')
      return
    }

    setIsDownloading(true)
    setCompletedFile(null)
    setProgress({ status: 'starting', percent: 0 })
    setStatusMessage('Initiating download engine...')

    try {
      const result = await window.electronAPI.startDownload(url.trim(), targetPath)
      if (!result.success) {
        setIsDownloading(false)
        setStatusMessage(`Download failed: ${result.error || 'Unknown error'}`)
      }
    } catch (err: unknown) {
      setIsDownloading(false)
      setStatusMessage(`Error: ${(err as Error).message || 'Execution failed'}`)
    }
  }

  const currentDestination = useDownloadsFallback
    ? downloadsDir
    : selectedDevice?.musicPath || downloadsDir

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 text-slate-100 selection:bg-red-500 selection:text-white">
      <div className="w-full max-w-xl bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl backdrop-blur-xl p-8 relative overflow-hidden transition-all duration-300">
        {/* Top Accent Light */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent" />

        {/* Header Controls */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-red-600 to-red-500 flex items-center justify-center shadow-lg shadow-red-500/20">
              <span className="text-white font-black text-xl">S</span>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                SUNTHREE
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-widest">
                  v2.0 Native
                </span>
              </h1>
              <p className="text-xs text-slate-400">Suunto Companion for Wayne</p>
            </div>
          </div>

          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 hover:text-white border border-slate-700/50 transition-colors"
            title="Toggle theme"
          >
            {isDarkMode ? '☀️' : '🌙'}
          </button>
        </div>

        {/* Device Graphic Card */}
        <div className="mb-6 rounded-2xl bg-gradient-to-b from-slate-800/40 to-slate-950/60 border border-slate-800/80 p-5 relative overflow-hidden">
          {selectedDevice && !useDownloadsFallback ? (
            <div className="flex flex-col items-center">
              <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>DEVICE CONNECTED</span>
              </div>

              {/* Suunto Device Render */}
              <DeviceGraphic
                model={selectedDevice.model}
                modelName={selectedDevice.modelName}
                connected={true}
                isWayne={selectedDevice.isWayneDevice}
              />

              {/* Device metadata badges */}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="px-3 py-1 rounded-lg bg-slate-800/80 text-slate-300 border border-slate-700/50 flex items-center gap-1">
                  📁 <span className="font-mono">{selectedDevice.musicPath}</span>
                </span>
                {selectedDevice.size && (
                  <span className="px-2.5 py-1 rounded-lg bg-slate-800/80 text-slate-300 border border-slate-700/50 font-mono">
                    💾 {selectedDevice.size}
                  </span>
                )}
                {selectedDevice.hasMusicFolder ? (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                    🎵 /MUSIC active
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                    ⚡ Will create /MUSIC
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="py-6 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center mb-3">
                <span className="text-3xl animate-bounce">🎧</span>
              </div>
              <h3 className="font-semibold text-slate-200 text-sm">
                Waiting for Suunto Headphones...
              </h3>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                Plug Wayne&apos;s headphones in via USB. The app will lock onto the device and its{' '}
                <code className="text-red-400 font-mono">MUSIC</code> folder automatically.
              </p>
            </div>
          )}
        </div>

        {/* Input & Target Controls */}
        <div className="space-y-4">
          {/* YouTube Link Input */}
          <div className="relative">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste YouTube track URL here..."
              disabled={isDownloading}
              className="w-full px-4 py-3.5 pr-24 rounded-xl bg-slate-800/50 border border-slate-700/60 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 text-sm font-medium transition-all"
            />
            <button
              onClick={checkClipboard}
              disabled={isDownloading}
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-600/60 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-600/40 transition-colors"
              title="Paste from clipboard"
            >
              <span>📋</span> Paste
            </button>
          </div>

          {/* Storage Destination Selector */}
          <div className="flex gap-2">
            <select
              value={useDownloadsFallback ? 'downloads' : selectedDevice?.id || 'downloads'}
              onChange={(e) => {
                const val = e.target.value
                if (val === 'downloads') {
                  setUseDownloadsFallback(true)
                } else {
                  setUseDownloadsFallback(false)
                  const matched = activeDevices.find((d) => d.id === val)
                  if (matched) setSelectedDevice(matched)
                }
              }}
              disabled={isDownloading}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700/60 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-sm font-medium cursor-pointer transition-all"
            >
              {activeDevices.map((d) => (
                <option key={d.id} value={d.id} className="bg-slate-900 text-white">
                  {d.name} {d.size ? `(${d.size})` : ''}{' '}
                  {d.hasMusicFolder ? '• (🎵 /MUSIC detected)' : ''}
                </option>
              ))}
              <option value="downloads" className="bg-slate-900 text-white">
                💻 Local Downloads Folder ({downloadsDir || 'Downloads/MUSIC'})
              </option>
            </select>

            {selectedDevice && !useDownloadsFallback && (
              <button
                onClick={handleDelistCurrentDevice}
                disabled={isDownloading}
                className="px-3 py-2 rounded-xl bg-slate-800/50 hover:bg-red-950/40 border border-slate-700/60 hover:border-red-500/40 text-slate-400 hover:text-red-300 text-xs font-semibold transition-colors flex items-center gap-1.5"
                title={`Delist "${selectedDevice.name}" so Sunthree ignores it`}
              >
                <span>🚫</span>
                <span>Delist</span>
              </button>
            )}

            <button
              onClick={() => window.electronAPI?.getDevices().then(applyDevices)}
              disabled={isDownloading}
              className="px-4 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/60 text-slate-300 hover:text-white transition-colors"
              title="Refresh mounted drives"
            >
              🔄
            </button>
          </div>

          {delistedIds.length > 0 && (
            <div className="flex items-center justify-between text-xs px-1 text-slate-400">
              <span>
                {Math.ceil(delistedIds.length / 2)} drive
                {Math.ceil(delistedIds.length / 2) > 1 ? 's' : ''} manually delisted
              </span>
              <button
                onClick={handleRestoreDelisted}
                disabled={isDownloading}
                className="text-red-400 hover:text-red-300 hover:underline font-medium transition-colors"
              >
                Restore Delisted Drives
              </button>
            </div>
          )}
        </div>

        {/* Live Progress Bar */}
        {isDownloading && progress && (
          <div className="mt-5 space-y-2 p-4 rounded-xl bg-slate-800/40 border border-slate-800">
            <div className="flex justify-between text-xs font-bold text-slate-300">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                {progress.status === 'starting'
                  ? 'Fetching stream details...'
                  : progress.status === 'downloading'
                    ? 'Downloading audio...'
                    : 'Converting to MP3 (192K)...'}
              </span>
              <span className="font-mono text-red-400">{Math.round(progress.percent)}%</span>
            </div>

            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden shadow-inner">
              <div
                className="bg-gradient-to-r from-red-600 to-red-500 h-3 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.max(progress.percent, 5)}%` }}
              />
            </div>

            {progress.status === 'downloading' && (
              <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                <span>Speed: {progress.speed || 'Calculating...'}</span>
                <span>ETA: {progress.eta || 'Calculating...'}</span>
              </div>
            )}
          </div>
        )}

        {/* Completed notification with Open Folder */}
        {completedFile && !isDownloading && (
          <div className="mt-5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">✅</span>
              <div>
                <p className="text-xs font-semibold text-emerald-400">Download Complete!</p>
                <p className="text-[11px] text-slate-400 truncate max-w-xs">{completedFile}</p>
              </div>
            </div>
            <button
              onClick={() => window.electronAPI?.openPath(currentDestination)}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-medium border border-emerald-500/30 transition-colors"
            >
              Open Folder
            </button>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleDownload}
          disabled={isDownloading || !url.trim()}
          className="mt-6 w-full py-4 text-sm font-bold tracking-wider text-white bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 active:scale-[0.99] rounded-xl shadow-lg shadow-red-600/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          {isDownloading
            ? 'TRANSFERRING TRACK...'
            : selectedDevice && !useDownloadsFallback
              ? `TRANSFER TO ${selectedDevice.modelName.toUpperCase()}`
              : 'DOWNLOAD TO FOLDER'}
        </button>

        {/* Status Bar */}
        <div className="mt-4 text-center">
          <p className="text-xs text-slate-400 font-medium">
            <b className="text-slate-300">Status:</b> {statusMessage}
          </p>
        </div>
      </div>
    </div>
  )
}
