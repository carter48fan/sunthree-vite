# Build Commands Reference

## Fresh Setup (after clone/checkout)

```bash
# Install Node.js dependencies
pnpm install
```

## Development

```bash
pnpm dev            # Start development with hot reload
```

## Production Builds

```bash
# Linux AppImage
pnpm build:linux

# Windows installer (NSIS executable)
pnpm build:win

# macOS app
pnpm build:mac

# Unpacked directory build
pnpm build:unpack
```

## Testing the Built App

```bash
# Test the unpacked version
./dist/linux-unpacked/sunthree-vite

# Test the AppImage
./dist/Sunthree\ Vite-2.0.0.AppImage
```

## Troubleshooting & Verification

```bash
# Run lint and type checks
pnpm lint
pnpm typecheck
pnpm build
```
