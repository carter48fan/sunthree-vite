import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

export interface ProgressPayload {
  status: 'starting' | 'downloading' | 'converting' | 'completed' | 'error'
  percent: number
  speed?: string
  eta?: string
  file?: string
  message?: string
}

/**
 * Resolves binary paths for yt-dlp and ffmpeg across development and production
 */
export function getBinaries(): { ytDlpPath: string; ffmpegDir: string } {
  const isDev = !app.isPackaged
  const isWin = process.platform === 'win32'
  const platformFolder = isWin ? 'win' : 'linux'

  const ytDlpFilename = isWin ? 'yt-dlp.exe' : 'yt-dlp'
  const ffmpegFilename = isWin ? 'ffmpeg.exe' : 'ffmpeg'

  let ytDlpPath = ''
  let ffmpegDir = ''

  if (isDev) {
    const binBase = path.join(__dirname, '..', '..', 'resources', 'bin', platformFolder)
    ytDlpPath = path.join(binBase, ytDlpFilename)
    ffmpegDir = binBase
  } else {
    const binBase = path.join(process.resourcesPath, 'bin')
    ytDlpPath = path.join(binBase, ytDlpFilename)
    ffmpegDir = binBase
  }

  // Linux system fallback if bundled binary is missing
  if (!isWin) {
    if (!fs.existsSync(ytDlpPath)) {
      if (fs.existsSync('/usr/bin/yt-dlp')) {
        ytDlpPath = '/usr/bin/yt-dlp'
      }
    }
    const bundledFfmpeg = path.join(ffmpegDir, ffmpegFilename)
    if (!fs.existsSync(bundledFfmpeg)) {
      if (fs.existsSync('/usr/bin/ffmpeg')) {
        ffmpegDir = '/usr/bin'
      }
    }
  }

  return { ytDlpPath, ffmpegDir }
}

/**
 * Downloads audio from YouTube and converts to MP3 in the target path
 */
export function downloadAudio(
  rawUrl: string,
  targetDirectory: string,
  onProgress: (payload: ProgressPayload) => void
): { cancel: () => void; promise: Promise<string> } {
  let child: ChildProcess | null = null

  const promise = new Promise<string>((resolve, reject) => {
    // 1. Sanitize URL to avoid unwanted playlist downloads
    let url = rawUrl.trim()
    if (url.includes('&list=')) {
      url = url.split('&list=')[0]
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return reject(new Error('Invalid URL provided. Must start with http:// or https://'))
    }

    // 2. Ensure target folder exists
    try {
      fs.mkdirSync(targetDirectory, { recursive: true })
    } catch (err: unknown) {
      return reject(
        new Error(`Failed to create directory '${targetDirectory}': ${(err as Error).message}`)
      )
    }

    // 3. Resolve binaries
    const { ytDlpPath, ffmpegDir } = getBinaries()

    if (!fs.existsSync(ytDlpPath)) {
      return reject(new Error(`yt-dlp executable not found at: ${ytDlpPath}`))
    }

    onProgress({
      status: 'starting',
      percent: 0,
      message: 'Initializing downloader...'
    })

    const outputTemplate = path.join(targetDirectory, '%(title)s.%(ext)s')

    const args = [
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '192K',
      '--ffmpeg-location',
      ffmpegDir,
      '-o',
      outputTemplate,
      '--newline',
      '--no-playlist',
      url
    ]

    console.log(`[DOWNLOADER] Executing: ${ytDlpPath} ${args.join(' ')}`)

    try {
      child = spawn(ytDlpPath, args)
    } catch (err: unknown) {
      return reject(new Error(`Failed to spawn yt-dlp: ${(err as Error).message}`))
    }

    let downloadedFile = ''
    let lastError = ''

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      const lines = text.split('\n').filter((l) => l.trim().length > 0)

      for (const line of lines) {
        console.log(`[yt-dlp stdout] ${line}`)

        // Track completed destination file
        const destMatch = line.match(/(?:Destination:\s*|Deleting original file\s+)(.+\.mp3)/i)
        if (destMatch && destMatch[1]) {
          downloadedFile = destMatch[1].trim()
        }

        // Check downloading progress
        // Format: [download]  45.2% of  12.34MiB at  2.45MiB/s ETA 00:07
        const dlMatch = line.match(
          /\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+(.*?)\s+at\s+(.*?)\s+ETA\s+(.*)/i
        )
        if (dlMatch) {
          const percent = parseFloat(dlMatch[1])
          const speed = dlMatch[3].trim()
          const eta = dlMatch[4].trim()

          onProgress({
            status: 'downloading',
            percent,
            speed,
            eta
          })
          continue
        }

        // Check audio extraction
        if (
          line.includes('[ExtractAudio]') ||
          line.includes('Post-process') ||
          line.includes('Converting video')
        ) {
          onProgress({
            status: 'converting',
            percent: 100,
            message: 'Extracting and converting to MP3...'
          })
        }
      }
    })

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      console.warn(`[yt-dlp stderr] ${text}`)
      lastError += text
    })

    child.on('error', (err) => {
      reject(err)
    })

    child.on('close', (code) => {
      if (code === 0) {
        onProgress({
          status: 'completed',
          percent: 100,
          file: downloadedFile
        })
        resolve(downloadedFile)
      } else {
        const errorMsg = lastError.trim() || `Download process exited with code ${code}`
        onProgress({
          status: 'error',
          percent: 0,
          message: errorMsg
        })
        reject(new Error(errorMsg))
      }
    })
  })

  return {
    cancel: () => {
      if (child) {
        child.kill()
      }
    },
    promise
  }
}
