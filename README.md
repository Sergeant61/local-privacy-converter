# Local Privacy Converter

A privacy-first, offline media conversion desktop app. All processing happens locally — no files are uploaded, no internet connection required.

Built with Electron, SvelteKit, and FFmpeg.

---

## Features

- **Video conversion** — MP4 (H.264/AAC), WebM (VP9/Opus), MKV, remux/copy
- **Audio extraction & conversion** — MP3, WAV, M4A/AAC, FLAC, Opus
- **Image conversion** — PNG, JPEG, WebP
- **Social media presets** — ready-made profiles for WhatsApp Business, Instagram Business, Messenger Business, and Telegram Business with correct codecs, resolution, and file size limits baked in
- **Resolution & aspect ratio controls** — standard presets (360p → 4K) plus custom values; crop to 16:9, 9:16, 1:1, 4:3, 21:9, or a custom ratio
- **Quality presets** — small / balanced / high / lossless
- **Hardware acceleration** — NVIDIA NVENC, Intel QSV, AMD AMF, Apple VideoToolbox (auto-detected)
- **Live conversion progress** with cancel support
- **Output folder** saved automatically to `Documents/LPC`
- **Completely offline** — binaries are bundled, no telemetry, no network calls

---

## Social Media Presets

| Platform | Type | Format | Max Size |
|---|---|---|---|
| WhatsApp Business | Video | MP4 H.264+AAC 1280×720 | 16 MB |
| WhatsApp Business | Image | JPEG | 5 MB |
| WhatsApp Business | Audio | M4A AAC | 16 MB |
| Instagram Business | Feed Video | MP4 H.264+AAC 1080×1080 | 100 MB |
| Instagram Business | Reels / Stories | MP4 H.264+AAC 1080×1920 | 100 MB |
| Instagram Business | Image | JPEG 1080×1080 | 8 MB |
| Messenger Business | Video | MP4 H.264+AAC 1280×720 | 25 MB |
| Messenger Business | Image | JPEG | 25 MB |
| Telegram Business | Video | MP4 H.264+AAC 1280×720 | 2000 MB |
| Telegram Business | Image | JPEG | 10 MB |
| Telegram Business | Audio | MP3 | 2000 MB |

---

## Screenshots

> _Coming soon_

---

## Download

Pre-built installers are available on the [Releases](https://github.com/Sergeant61/local-privacy-converter/releases) page.

| Platform | Installer |
|---|---|
| macOS (Apple Silicon) | `Local.Privacy.Converter-x.x.x-arm64.dmg` |
| macOS (Intel) | `Local.Privacy.Converter-x.x.x.dmg` |
| Windows | `Local.Privacy.Converter-Setup-x.x.x.exe` |
| Linux | `Local.Privacy.Converter-x.x.x.AppImage` / `.deb` |

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 20
- [pnpm](https://pnpm.io) 9.x (`npm i -g pnpm`)
- FFmpeg binary available on PATH **or** installed via the workspace dep (`@ffmpeg-binary/ffmpeg`)

### Install dependencies

```bash
pnpm install
```

### Run in development mode

```bash
pnpm dev
```

This starts the SvelteKit renderer on port 5173, bundles the Electron main/preload in watch mode, and launches the Electron window pointing at the dev server.

### Type-check

```bash
pnpm typecheck
```

### Lint

```bash
pnpm lint
```

---

## Building

### Stage FFmpeg binaries (required before packaging)

```bash
node scripts/prepare-ffmpeg.mjs
```

### Package for the current platform

```bash
pnpm dist
```

### Platform-specific builds

```bash
pnpm dist:mac     # macOS DMG + ZIP (arm64 + x64)
pnpm dist:win     # Windows NSIS installer (x64)
pnpm dist:linux   # Linux AppImage + DEB (x64)
pnpm dist:dir     # Unpackaged directory (fast, for testing)
```

Output is written to `apps/desktop/release/<version>/`.

---

## Releases (CI)

Pushing a semver tag triggers the GitHub Actions release workflow:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow builds on four runners (macOS arm64, macOS x64, Windows x64, Ubuntu x64), collects all artifacts, and publishes them to a GitHub Release with auto-generated release notes.

---

## Project Structure

```
.
├── apps/
│   └── desktop/          # Electron + SvelteKit UI
│       ├── electron/     # Main process (main.ts, preload.ts)
│       └── src/          # SvelteKit renderer (Svelte 5)
├── packages/
│   ├── ffmpeg-core/      # FFmpeg/ffprobe spawn helpers, arg builder
│   ├── media-formats/    # Target profiles, conversion matrix, job hints, UI meta
│   ├── types/            # Shared TypeScript interfaces
│   ├── validators/       # Zod schemas for IPC payloads
│   └── config/           # Shared ESLint / TypeScript config
├── scripts/
│   ├── prepare-ffmpeg.mjs  # Stages platform binaries before packaging
│   └── set-version.mjs     # Writes version to package.json (used in CI)
└── .github/workflows/
    └── release.yml         # Automated cross-platform release pipeline
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Electron](https://electronjs.org) 39 |
| UI framework | [SvelteKit](https://kit.svelte.dev) + Svelte 5 (runes) |
| Media processing | [FFmpeg](https://ffmpeg.org) (bundled binary) |
| Validation | [Zod](https://zod.dev) |
| Build system | [Turbo](https://turbo.build) + [pnpm workspaces](https://pnpm.io/workspaces) |
| Packaging | [electron-builder](https://www.electron.build) 25 |
| Language | TypeScript 5.7 |

---

## License

MIT — see [LICENSE](LICENSE) for details.
