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
      'lsblk -J -o NAME,LABEL,UUID,MOUNTPOINT,RM,HOTPLUG,VENDOR,MODEL,TRAN,SERIAL',
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

      if (item.mountpoint && isUsb && !visitedMounts.has(item.mountpoint)) {
        visitedMounts.add(item.mountpoint)
        const label = item.label || item.uuid || path.basename(item.mountpoint)
        const id = item.uuid || item.label || item.name
        const { hasMusic, musicPath } = findMusicDirectory(item.mountpoint)
        const {
          model: suuntoModel,
          modelName,
          isWayne
        } = identifyModel(label, id, `${vendor} ${model}`)

        const known = KNOWN_DEVICES[id] || KNOWN_DEVICES[label]
        const displayName = known
          ? known.name
          : isWayne
            ? `Wayne's Headphones (${modelName})`
            : `${label} (${modelName})`

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
          vendor: `${vendor} ${model}`.trim() || undefined
        })
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
            visitedMounts.add(fullPath)
            const { hasMusic, musicPath } = findMusicDirectory(fullPath)
            const { model: suuntoModel, modelName, isWayne } = identifyModel(entry, entry, '')

            const known = KNOWN_DEVICES[entry]
            const displayName = known
              ? known.name
              : isWayne
                ? `Wayne's Headphones (${modelName})`
                : `${entry} (${modelName})`

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
              isWayneDevice: isWayne
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

  // Strategy 1: PowerShell query for volumes and USB disks
  try {
    const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Volume | Select-Object DriveLetter, Label, DeviceID, FileSystem, DriveType | ConvertTo-Json -Compress"`
    const raw = execSync(cmd, { encoding: 'utf-8', timeout: 4000 })
    const parsed = JSON.parse(raw)
    const volumes = Array.isArray(parsed) ? parsed : [parsed]

    for (const vol of volumes) {
      if (!vol.DriveLetter) continue
      const root = vol.DriveLetter.endsWith('\\') ? vol.DriveLetter : `${vol.DriveLetter}\\`
      visitedRoots.add(root)

      const label = vol.Label || 'USB Drive'
      const id = vol.DeviceID || vol.DriveLetter
      const isRemovable = vol.DriveType === 2 // 2 = Removable disk
      const { hasMusic, musicPath } = findMusicDirectory(root)
      const { model, modelName, isWayne } = identifyModel(label, id, '')

      const known = KNOWN_DEVICES[label] || (vol.Label && KNOWN_DEVICES[vol.Label])
      const displayName = known
        ? known.name
        : isWayne
          ? `Wayne's Headphones (${vol.DriveLetter})`
          : `${label} (${vol.DriveLetter})`

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
        isWayneDevice: isWayne
      })
    }
  } catch {
    // Strategy 2: Direct scan of drive letters D:\ through Z:\
    const letters = 'DEFGHIJKLMNOPQRSTUVWXYZ'
    for (const char of letters) {
      const root = `${char}:\\`
      if (visitedRoots.has(root)) continue
      try {
        if (fs.existsSync(root)) {
          visitedRoots.add(root)
          const { hasMusic, musicPath } = findMusicDirectory(root)
          const { model, modelName, isWayne } = identifyModel(char, char, '')

          devices.push({
            id: `${char}:`,
            name: `Drive ${char}: (${modelName})`,
            model,
            modelName,
            volumeLabel: `Drive ${char}:`,
            mountPoint: root,
            musicPath,
            hasMusicFolder: hasMusic,
            isRemovable: true,
            isWayneDevice: isWayne
          })
        }
      } catch {
        // Skip inaccessible drive letters
      }
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
    // 1. Devices that have a MUSIC folder come first
    if (a.hasMusicFolder && !b.hasMusicFolder) return -1
    if (!a.hasMusicFolder && b.hasMusicFolder) return 1

    // 2. Wayne's identified devices come next
    if (a.isWayneDevice && !b.isWayneDevice) return -1
    if (!a.isWayneDevice && b.isWayneDevice) return 1

    // 3. Suunto devices
    if (a.model !== 'generic' && b.model === 'generic') return -1
    if (a.model === 'generic' && b.model !== 'generic') return 1

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
