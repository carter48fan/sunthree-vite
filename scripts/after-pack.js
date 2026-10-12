/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs')
const path = require('path')

exports.default = async function (context) {
  // Ensure binaries in resources/bin are executable on Linux
  if (context.electronPlatformName === 'linux') {
    const binDir = path.join(context.appOutDir, 'resources', 'bin')
    if (fs.existsSync(binDir)) {
      const binaries = ['yt-dlp', 'ffmpeg', 'ffprobe']
      for (const binary of binaries) {
        const binPath = path.join(binDir, binary)
        if (fs.existsSync(binPath)) {
          try {
            fs.chmodSync(binPath, '0755')
            console.log(`Set execute permissions on ${binary}`)
          } catch (err) {
            console.error(`Failed to set permissions on ${binary}:`, err)
          }
        }
      }
    }
  }
}
