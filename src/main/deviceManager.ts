import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'

export type SuuntoModel = 'suunto-wing' | 'suunto-sonic' | 'suunto-watch' | 'generic'

export interface DetectedDevice {
  id: string
  name: string
  model: SuuntoModel
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

// Known nicknames and volume identifiers
const KNOWN_DEVICES: Record<string, { name: string; model: SuuntoModel; modelName: string }> = {
  '4CFC-8D04': {
    name: "Wayne's Headphones (Suunto Wing)",
    model: 'suunto-wing',
    modelName: 'Suunto Wing'
  },
  '7CB2-67CD': {
    name: "Wayne's Headphones (Suunto Sonic)",
    model: 'suunto-sonic',
    modelName: 'Suunto Sonic'
  },
  SUUNTO: {
    name: 'Suunto Sports Device',
    model: 'suunto-wing',
    modelName: 'Suunto Wing'
  },
  'SUUNTO WING': {
    name: 'Suunto Wing',
    model: 'suunto-wing',
    modelName: 'Suunto Wing'
  },
  'SUUNTO SONIC': {
    name: 'Suunto Sonic',
    model: 'suunto-sonic',
    modelName: 'Suunto Sonic'
  }
}

/**
 * Maximum capacity threshold for portable music players: 256 GiB.
 * Suunto Wing and Sonic headphones feature 32 GB of onboard flash storage.
 * Any storage volume with capacity >= 256 GiB (e.g. 500 GB, 931 GB / 1 TB, 2 TB) is an internal
 * or external secondary hard drive / SSD and should be delisted from portable music players.
 */
export const MAX_PORTABLE_STORAGE_BYTES = 256 * 1024 * 1024 * 1024

/**
 * Formats a byte count into a readable string (e.g. "32 GB", "931 GB").
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return ''
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const val = bytes / Math.pow(k, i)
  return `${val.toFixed(i >= 3 ? 0 : 1)} ${sizes[i]}`
}

/**
 * Cross-platform filesystem capacity lookup using statfsSync.
 */
export function getDriveCapacity(mountPoint: string): number | null {
  try {
    if (fs.existsSync(mountPoint)) {
      const stats = fs.statfsSync(mountPoint)
      const totalBytes = Number(stats.bsize) * Number(stats.blocks)
      if (totalBytes > 0) return totalBytes
    }
  } catch {
    // Ignore permissions or unsupported statfs calls
  }
  return null
}

/**
 * Checks a directory for a MUSIC folder (case-insensitive)
 */
function findMusicDirectory(mountPoint: string): { hasMusic: boolean; musicPath: string } {
  try {
    if (!fs.existsSync(mountPoint)) {
      return { hasMusic: false, musicPath: path.join(mountPoint, 'MUSIC') }
    }
    const items = fs.readdirSync(mountPoint)
    const musicItem = items.find((item) => item.toLowerCase() === 'music')
    if (musicItem) {
      return { hasMusic: true, musicPath: path.join(mountPoint, musicItem) }
    }
  } catch {
    // Ignore permissions or I/O errors on transient mounts
  }
  return { hasMusic: false, musicPath: path.join(mountPoint, 'MUSIC') }
}

/**
 * Identifies the model type from volume label, device ID, vendor, or path
 */
function identifyModel(
  label: string,
  id: string,
  vendorModel: string
): { model: SuuntoModel; modelName: string; isWayne: boolean } {
  const combined = `${label} ${id} ${vendorModel}`.toUpperCase()

  if (id === '4CFC-8D04' || combined.includes('4CFC-8D04')) {
    return { model: 'suunto-wing', modelName: 'Suunto Wing', isWayne: true }
  }
  if (id === '7CB2-67CD' || combined.includes('7CB2-67CD')) {
    return { model: 'suunto-sonic', modelName: 'Suunto Sonic', isWayne: true }
  }
  if (combined.includes('WING')) {
    return { model: 'suunto-wing', modelName: 'Suunto Wing', isWayne: false }
  }
  if (combined.includes('SONIC')) {
    return { model: 'suunto-sonic', modelName: 'Suunto Sonic', isWayne: false }
  }
  if (combined.includes('WATCH') || combined.includes('OCEAN') || combined.includes('RACE')) {
    return { model: 'suunto-watch', modelName: 'Suunto Sports Watch', isWayne: false }
  }
  if (combined.includes('SUUNTO')) {
    return { model: 'suunto-wing', modelName: 'Suunto Device', isWayne: false }
  }

  return { model: 'generic', modelName: 'USB Music Player', isWayne: false }
}

/**
 * Linux device discovery using lsblk and filesystem search
 */
function getLinuxDrives(): DetectedDevice[] {
  const devices: DetectedDevice[] = []
  const visitedMounts = new Set<string>()

  // Strategy 1: Use lsblk to inspect block devices with JSON metadata
  try {
    const raw = execSync(
      'lsblk -J -b -o NAME,LABEL,UUID,MOUNTPOINT,RM,HOTPLUG,VENDOR,MODEL,TRAN,SERIAL,SIZE,ROTA,TYPE',
      { encoding: 'utf-8', timeout: 3000 }
    )
    const parsed = JSON.parse(raw)

    interface LsblkItem {
      name: string
      label?: string | null
      uuid?: string | null
      mountpoint?: string | null
      rm?: boolean
      hotplug?: boolean
      vendor?: string | null
      model?: string | null
      tran?: string | null
      serial?: string | null
      size?: number | string | null
      rota?: boolean | null
      type?: string | null
      children?: LsblkItem[]
    }

    function processItem(
      item: LsblkItem,
      parentTran?: string | null,
      parentVendor?: string | null
    ): void {
      const tran = item.tran || parentTran
      const vendor = (item.vendor || parentVendor || '').trim()
      const model = (item.model || '').trim()
      const isUsb = tran === 'usb' || item.rm === true || item.hotplug === true
      const isLoopOrSnap = item.type === 'loop' || item.mountpoint?.startsWith('/snap')
      const isSystemMount =
        item.mountpoint === '/' ||
        item.mountpoint === '/boot' ||
        item.mountpoint === '/boot/efi' ||
        item.mountpoint === '/home'

      const numSize = typeof item.size === 'number' ? item.size : Number(item.size) || 0
      const isRotationalHdd = item.rota === true

      if (
        item.mountpoint &&
        isUsb &&
        !isLoopOrSnap &&
        !isSystemMount &&
        !visitedMounts.has(item.mountpoint)
      ) {
        const label = item.label || item.uuid || path.basename(item.mountpoint)
        const id = item.uuid || item.label || item.name
        const {
          model: suuntoModel,
          modelName,
          isWayne
        } = identifyModel(label, id, `${vendor} ${model}`)

        const known = KNOWN_DEVICES[id] || KNOWN_DEVICES[label]

        // DELIST HARD DRIVES: Delist rotational mechanical HDDs or drives >= 256GB unless recognized Suunto
        const isOversized = numSize >= MAX_PORTABLE_STORAGE_BYTES
        const shouldDelist =
          (isRotationalHdd || isOversized) && !known && !isWayne && suuntoModel === 'generic'

        if (!shouldDelist) {
          visitedMounts.add(item.mountpoint)
          const { hasMusic, musicPath } = findMusicDirectory(item.mountpoint)
          const displayName = known
            ? known.name
            : isWayne
              ? `Wayne's Headphones (${modelName})`
              : `${label} (${modelName})`

          const formattedSize = numSize > 0 ? formatBytes(numSize) : undefined

          devices.push({
            id,
            name: displayName,
            model: suuntoModel,
            modelName,
            volumeLabel: label,
            mountPoint: item.mountpoint,
            musicPath,
            hasMusicFolder: hasMusic,
            isRemovable: isUsb,
            isWayneDevice: isWayne,
            size: formattedSize,
            vendor: `${vendor} ${model}`.trim() || undefined
          })
        }
      }

      if (item.children) {
        for (const child of item.children) {
          processItem(child, tran, vendor)
        }
      }
    }

    if (parsed.blockdevices) {
      for (const dev of parsed.blockdevices) {
        processItem(dev)
      }
    }
  } catch (err) {
    console.warn('lsblk discovery failed, falling back to filesystem walk:', err)
  }

  // Strategy 2: Scan mount directories /media, /run/media, /mnt
  const user = os.userInfo().username
  const mountRoots = [`/media/${user}`, `/run/media/${user}`, '/media', '/run/media', '/mnt']

  for (const root of mountRoots) {
    if (!fs.existsSync(root)) continue
    try {
      const entries = fs.readdirSync(root)
      for (const entry of entries) {
        const fullPath = path.join(root, entry)
        if (visitedMounts.has(fullPath)) continue

        try {
          const stat = fs.statSync(fullPath)
          if (stat.isDirectory()) {
            const capacity = getDriveCapacity(fullPath)
            const { model: suuntoModel, modelName, isWayne } = identifyModel(entry, entry, '')
            const known = KNOWN_DEVICES[entry]

            // Delist hard drives by size in mount roots
            if (
              capacity &&
              capacity >= MAX_PORTABLE_STORAGE_BYTES &&
              !known &&
              !isWayne &&
              suuntoModel === 'generic'
            ) {
              continue
            }

            visitedMounts.add(fullPath)
            const { hasMusic, musicPath } = findMusicDirectory(fullPath)

            const displayName = known
              ? known.name
              : isWayne
                ? `Wayne's Headphones (${modelName})`
                : `${entry} (${modelName})`

            const formattedSize = capacity ? formatBytes(capacity) : undefined

            devices.push({
              id: entry,
              name: displayName,
              model: suuntoModel,
              modelName,
              volumeLabel: entry,
              mountPoint: fullPath,
              musicPath,
              hasMusicFolder: hasMusic,
              isRemovable: true,
              isWayneDevice: isWayne,
              size: formattedSize
            })
          }
        } catch {
          // Skip inaccessible entries
        }
      }
    } catch {
      // Skip root if not readable
    }
  }

  return devices
}

/**
 * Windows device discovery using PowerShell CimInstance + Drive letter fallback
 */
function getWindowsDrives(): DetectedDevice[] {
  const devices: DetectedDevice[] = []
  const visitedRoots = new Set<string>()
  const systemDrive = (process.env.SystemDrive || 'C:').toUpperCase().replace(':', '')

  // Strategy 1: PowerShell query for volumes and USB disks
  try {
    const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Volume | Select-Object DriveLetter, Label, DeviceID, FileSystem, DriveType, Capacity, SystemVolume, BootVolume | ConvertTo-Json -Compress"`
    const raw = execSync(cmd, { encoding: 'utf-8', timeout: 4000 })
    const parsed = JSON.parse(raw)
    const volumes = Array.isArray(parsed) ? parsed : [parsed]

    for (const vol of volumes) {
      if (!vol.DriveLetter) continue
      const letter = vol.DriveLetter.toUpperCase().replace(':', '').replace('\\', '')
      const root = vol.DriveLetter.endsWith('\\') ? vol.DriveLetter : `${vol.DriveLetter}\\`
      visitedRoots.add(root)

      const label = vol.Label || 'USB Drive'
      const id = vol.DeviceID || vol.DriveLetter
      const isRemovable = vol.DriveType === 2 // 2 = Removable disk, 3 = Fixed local hard drive
      const isSystem =
        letter === systemDrive || vol.SystemVolume === true || vol.BootVolume === true

      const { model, modelName, isWayne } = identifyModel(label, id, '')
      const known =
        KNOWN_DEVICES[label] || (vol.Label && KNOWN_DEVICES[vol.Label]) || KNOWN_DEVICES[id]

      // DELIST HARD DRIVES & SYSTEM DRIVES:
      // 1. Skip Windows system / boot drive unless explicitly a known Wayne Suunto device
      if (isSystem && !known && !isWayne) {
        continue
      }

      // 2. Delist non-removable drives (DriveType 3 is internal Fixed Disk / second HDD, 4 is network, 5 is optical)
      if (!isRemovable && !known && !isWayne) {
        continue
      }

      // 3. Delist large capacity drives (e.g. 931 GB / 1 TB, 500 GB HDDs vs 32 GB Suunto)
      const capacity = typeof vol.Capacity === 'number' ? vol.Capacity : getDriveCapacity(root)

      if (
        capacity &&
        capacity >= MAX_PORTABLE_STORAGE_BYTES &&
        !known &&
        !isWayne &&
        model === 'generic'
      ) {
        continue
      }

      const { hasMusic, musicPath } = findMusicDirectory(root)
      const displayName = known
        ? known.name
        : isWayne
          ? `Wayne's Headphones (${vol.DriveLetter})`
          : `${label} (${vol.DriveLetter})`

      const formattedSize = capacity ? formatBytes(capacity) : undefined

      devices.push({
        id: vol.DriveLetter,
        name: displayName,
        model,
        modelName,
        volumeLabel: label,
        mountPoint: root,
        musicPath,
        hasMusicFolder: hasMusic,
        isRemovable,
        isWayneDevice: isWayne,
        size: formattedSize
      })
    }
  } catch (err) {
    console.warn('PowerShell Win32_Volume discovery failed, falling back:', err)
  }

  // Strategy 2: Direct scan of drive letters D:\ through Z:\
  // Only inspect drive letters not already visited / handled by Strategy 1
  const letters = 'DEFGHIJKLMNOPQRSTUVWXYZ'
  for (const char of letters) {
    if (char === systemDrive) continue
    const root = `${char}:\\`
    if (visitedRoots.has(root)) continue

    try {
      if (fs.existsSync(root)) {
        visitedRoots.add(root)
        const capacity = getDriveCapacity(root)

        // Delist hard drives by size threshold
        if (capacity && capacity >= MAX_PORTABLE_STORAGE_BYTES) {
          continue
        }

        const { model, modelName, isWayne } = identifyModel(char, char, '')
        const known = KNOWN_DEVICES[char]

        // If unknown generic device in fallback without a MUSIC folder, do not treat as player
        const { hasMusic, musicPath } = findMusicDirectory(root)
        if (!hasMusic && !known && !isWayne && model === 'generic') {
          continue
        }

        const formattedSize = capacity ? formatBytes(capacity) : undefined

        devices.push({
          id: `${char}:`,
          name: known ? known.name : `Drive ${char}: (${modelName})`,
          model,
          modelName,
          volumeLabel: `Drive ${char}:`,
          mountPoint: root,
          musicPath,
          hasMusicFolder: hasMusic,
          isRemovable: true,
          isWayneDevice: isWayne,
          size: formattedSize
        })
      }
    } catch {
      // Skip inaccessible drive letters
    }
  }

  return devices
}

/**
 * Main detection function. Sorts matching devices by highest priority:
 * 1. Has MUSIC folder AND is Wayne's / Suunto device
 * 2. Has MUSIC folder
 * 3. Other removable drives
 */
export function detectDevices(): DetectedDevice[] {
  let devices: DetectedDevice[] = []

  if (process.platform === 'win32') {
    devices = getWindowsDrives()
  } else {
    devices = getLinuxDrives()
  }

  // Sort by relevance
  return devices.sort((a, b) => {
    // 1. Wayne's identified devices come first
    if (a.isWayneDevice && !b.isWayneDevice) return -1
    if (!a.isWayneDevice && b.isWayneDevice) return 1

    // 2. Other Suunto devices
    if (a.model !== 'generic' && b.model === 'generic') return -1
    if (a.model === 'generic' && b.model !== 'generic') return 1

    // 3. Devices that have a MUSIC folder come next
    if (a.hasMusicFolder && !b.hasMusicFolder) return -1
    if (!a.hasMusicFolder && b.hasMusicFolder) return 1

    return a.name.localeCompare(b.name)
  })
}

/**
 * Watcher that polls for device hotplugging and fires when changes occur
 */
export function startDeviceWatcher(
  onChange: (devices: DetectedDevice[]) => void,
  intervalMs = 2500
): () => void {
  let lastFingerprint = ''

  const check = (): void => {
    try {
      const devices = detectDevices()
      const fingerprint = devices
        .map((d) => `${d.id}:${d.mountPoint}:${d.hasMusicFolder}`)
        .join('|')
      if (fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint
        onChange(devices)
      }
    } catch (e) {
      console.warn('Device watcher check failed:', e)
    }
  }

  // Immediate check
  check()

  const timer = setInterval(check, intervalMs)
  return () => clearInterval(timer)
}
