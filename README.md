# Local Privacy Converter

A privacy-first, offline media conversion desktop app. All processing happens locally — no files are ever uploaded, no internet connection required.

Built with Electron, SvelteKit, and FFmpeg.

---

## Install

### macOS — Homebrew (recommended)

```bash
brew tap Sergeant61/tap
brew install --cask local-privacy-converter
```

To upgrade later:

```bash
brew upgrade --cask local-privacy-converter
```

### Manual download

Pre-built installers are available on the [Releases](https://github.com/Sergeant61/local-privacy-converter/releases) page.

| Platform | Installer |
|---|---|
| macOS (Apple Silicon) | `Local.Privacy.Converter-x.x.x-arm64.dmg` |
| macOS (Intel) | `Local.Privacy.Converter-x.x.x.dmg` |
| Windows | `Local.Privacy.Converter.Setup.x.x.x.exe` |
| Linux | `Local.Privacy.Converter-x.x.x.AppImage` / `.deb` |

---

## Features

### Core Conversion
- **Video conversion** — MP4 (H.264/AAC), WebM (VP9/Opus), MKV, remux/copy, H.265 (HEVC), AV1
- **Audio conversion** — MP3, WAV, M4A/AAC, FLAC, Opus
- **Image conversion** — PNG, JPEG, WebP, AVIF
- **Quality presets** — Very small / Small / Balanced / Compatible / High (CRF-based)
- **Hardware acceleration** — NVIDIA NVENC, Intel QSV, AMD AMF, Apple VideoToolbox, VAAPI (auto-detected)
- **Live progress** with real-time FFmpeg log viewer and cancel support

### Tools
| Tool | Description |
|---|---|
| **Batch conversion** | Convert multiple files at once with per-file status tracking |
| **Video trim** | Cut a time range with stream-copy (fast) or re-encode (precise) |
| **Audio merge** | Concatenate or mix multiple audio files |
| **Video merge** | Concatenate multiple video files |
| **Frame extract** | Pull image frames at a set interval (PNG / JPG) |
| **GIF creator** | High-quality GIF with two-pass palette optimization |
| **APNG creator** | Animated PNG with full 32-bit color and alpha transparency |
| **PDF → Image** | Convert PDF pages to PNG / JPG / PPM via Poppler |
| **Multi-output** | Generate multiple formats from a single input in one run |
| **Aspect ratio** | Crop or pad video to a target ratio (16:9, 1:1, 9:16, …) |
| **Resolution scale** | Upscale or downscale to any preset or custom resolution |
| **Audio normalize** | EBU R128 loudness normalization (loudnorm filter) |
| **Watermark** | Overlay text or image with configurable position and opacity |
| **Metadata editor** | Read and write ID3 / MP4 tags |
| **Subtitle extract** | List and extract embedded subtitle streams |

### Social Media Presets

Ready-made profiles with correct codecs, resolution, bitrate, and file-size limits baked in.

| Platform | Type | Format | Details |
|---|---|---|---|
| WhatsApp Business | Video | MP4 H.264+AAC | 1280×720, 16 MB |
| WhatsApp Business | Image | JPEG | 5 MB |
| WhatsApp Business | Audio | M4A AAC | 16 MB |
| Instagram Business | Feed Video | MP4 H.264+AAC | 1080×1080, 100 MB |
| Instagram Business | Reels / Stories | MP4 H.264+AAC | 1080×1920, 100 MB |
| Instagram Business | Image | JPEG | 1080×1080, 8 MB |
| Messenger Business | Video | MP4 H.264+AAC | 1280×720, 25 MB |
| Messenger Business | Image | JPEG | 25 MB |
| Telegram Business | Video | MP4 H.264+AAC | 1280×720, 2 GB |
| Telegram Business | Image | JPEG | 10 MB |
| Telegram Business | Audio | MP3 | 2 GB |
| YouTube | 1080p | MP4 H.264+AAC | 1920×1080 |
| YouTube | 4K | MP4 H.264+AAC | 3840×2160 |
| TikTok | Video | MP4 H.264+AAC | 1080×1920 |
| LinkedIn | Video | MP4 H.264+AAC | 1920×1080 |
| X (Twitter) | Video | MP4 H.264+AAC | 1280×720 |
| Discord | Video | MP4 H.264+AAC | 1280×720 |

### Power User Features
- **Custom profiles** — save your own preset (format + quality + resolution + audio + extra args) and reuse it
- **Extra FFmpeg arguments** — pass raw flags directly to FFmpeg for advanced control
- **Audio channel control** — force mono or stereo output
- **Quick MP3 extract** — one-click audio strip from any video
- **Conversion history** — searchable log with JSON / CSV export
- **Auto update check** — compares against GitHub Releases, shows a download link if a newer version exists

### App Experience
- **Light / dark theme** — follows system preference, toggleable in-app
- **Language support** — Turkish 🇹🇷 and English 🇬🇧 (switchable in Settings)
- **System tray** — minimize to tray, conversion status in tray menu
- **Taskbar / Dock progress** — live progress bar in macOS Dock and Windows taskbar
- **Settings page** — output directory, default quality, custom FFmpeg binary path
- **Completely offline** — all binaries bundled, no telemetry, no network calls

---

## Screenshots

> _Coming soon_

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 20
- [pnpm](https://pnpm.io) 9.x (`npm i -g pnpm`)

### Install dependencies

```bash
pnpm install
```

### Run in development mode

```bash
pnpm dev
```

Starts the SvelteKit renderer on port 5173, bundles the Electron main/preload in watch mode, and launches the Electron window pointing at the dev server.

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
pnpm --filter desktop run package
```

Output is written to `apps/desktop/release/<version>/`.

---

## Releases (CI)

Pushing a semver tag triggers the GitHub Actions release workflow, which builds on four runners (macOS arm64, macOS x64, Windows x64, Ubuntu x64), collects all artifacts, and publishes them to a GitHub Release with auto-generated release notes.

```bash
git tag v1.1.0
git push origin v1.1.0
```

---

## Project Structure

```
.
├── apps/
│   └── desktop/              # Electron + SvelteKit UI
│       ├── electron/         # Main process (main.ts, preload.ts)
│       └── src/
│           ├── lib/
│           │   ├── components/   # AppShell, Sidebar, HomeConverter, …
│           │   ├── history/      # IndexedDB conversion history store
│           │   └── i18n/         # svelte-i18n locale files (tr, en)
│           └── routes/           # One directory per tool page
├── packages/
│   ├── ffmpeg-core/          # FFmpeg/ffprobe spawn helpers, arg builder
│   ├── media-formats/        # Target profiles, conversion matrix, job hints, UI meta
│   ├── types/                # Shared TypeScript interfaces
│   ├── validators/           # Zod schemas for IPC payloads
│   └── config/               # Shared ESLint / TypeScript config
├── scripts/
│   ├── prepare-ffmpeg.mjs    # Stages platform binaries before packaging
│   └── set-version.mjs       # Writes version to package.json (used in CI)
└── .github/workflows/
    └── release.yml           # Automated cross-platform release pipeline
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Electron](https://electronjs.org) 39 |
| UI framework | [SvelteKit](https://kit.svelte.dev) 2 + Svelte 5 (runes) |
| Media processing | [FFmpeg](https://ffmpeg.org) 7.x (bundled binary) |
| i18n | [svelte-i18n](https://github.com/kaisermann/svelte-i18n) 4 |
| Validation | [Zod](https://zod.dev) |
| Build system | [Turbo](https://turbo.build) + [pnpm workspaces](https://pnpm.io/workspaces) |
| Packaging | [electron-builder](https://www.electron.build) 25 |
| Language | TypeScript 5.7 |

---

## License

MIT — see [LICENSE](LICENSE) for details.
