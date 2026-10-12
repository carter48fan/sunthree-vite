# Sunthree Vite

High-performance Electron companion app for Suunto bone conduction sports headphones and offline MP3 players.

## Features

- **Zero-Python Native Engine**: Directly leverages standalone `yt-dlp` and `ffmpeg` via native Electron IPC.
- **Automatic Device & Volume Detection**: Auto-detects mounted USB devices on Windows and Linux that have an active `MUSIC` folder, with instant hotplug detection.
- **Device Identification**: Recognizes Suunto Wing (with signature red safety LED graphics), Suunto Sonic, and Suunto Sports Watches.
- **Fast Audio Extraction**: High-fidelity 192kbps MP3 audio conversion directly to device storage.
- **One-Click Experience**: Smart clipboard detection, live stream progress, and auto-folder creation.

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev
```

## Production Builds

```bash
# Build for Windows (NSIS .exe)
pnpm build:win

# Build for Linux (AppImage)
pnpm build:linux
```
