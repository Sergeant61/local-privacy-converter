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

### macOS — "damaged" warning

If macOS shows _"Local Privacy Converter.app is damaged and can't be opened"_, run this once in Terminal:

```bash
xattr -cr /Applications/Local\ Privacy\ Converter.app
```

This happens because the app is not yet notarized with an Apple Developer certificate. The command removes the quarantine flag Apple sets on downloaded files.

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
| **GIF creator** | High-quality GIF with a per-clip generated color palette (`palettegen` + `paletteuse`) |
| **APNG creator** | Animated PNG; alpha is preserved when the source has it (RGBA in, RGBA out) |
| **PDF → Image** | Convert PDF pages to PNG / JPEG / TIFF. Requires Poppler on your system (`brew install poppler` / `apt install poppler-utils`) — it is **not** bundled |
| **Multi-output** | Generate multiple formats from a single input in one run |
| **Aspect ratio** | Center-crop video to a target ratio (16:9, 1:1, 9:16, …) |
| **Resolution scale** | Upscale or downscale to any preset or custom resolution |
| **Audio normalize** | Two-pass EBU R128 loudness normalization (`loudnorm`, linear mode — loudness range is preserved, not compressed) |
| **Watermark** | Overlay text or image with configurable position and opacity |
| **Metadata editor** | Read and write ID3 / MP4 tags |
| **Subtitle extract** | List and extract embedded subtitle streams |

### Social Media Presets

Ready-made profiles with codec, resolution and file-size limits baked in. Video and audio targets convert the size limit into a bitrate budget; image targets step quality down until the file fits. Sources are fitted to the target frame by center-crop, so the aspect ratio is never stretched.

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
| YouTube | 1080p | MP4 H.264+AAC | 1920×1080, 128 GB |
| YouTube | 4K | MP4 H.264+AAC | 3840×2160, 128 GB |
| TikTok | Video | MP4 H.264+AAC | 1080×1920, 287 MB |
| LinkedIn | Video | MP4 H.264+AAC | 1920×1080, 5 GB |
| X (Twitter) | Video | MP4 H.264+AAC | 1920×1080, 512 MB |
| Discord | Video | MP4 H.264+AAC | 1920×1080, 10 MB (no Nitro) |

### Power User Features
- **Custom profiles** — save your own preset (format + quality + resolution + audio + extra args) and reuse it
- **Extra FFmpeg arguments** — pass raw flags directly to FFmpeg; quoted values are kept intact (`-metadata "title=My Movie"`)
- **Audio channel control** — force mono or stereo output
- **Quick MP3 extract** — one-click audio strip from any video
- **Conversion history** — searchable log with JSON / CSV export
- **Update check** — compares the running version against GitHub Releases and shows a download link only when the remote version is genuinely newer

### App Experience
- **Light / dark theme** — follows system preference, toggleable in-app
- **Language support** — Turkish 🇹🇷 and English 🇬🇧 (switchable in Settings)
- **System tray** — minimize to tray, conversion status in tray menu
- **Taskbar / Dock progress** — live progress bar in macOS Dock and Windows taskbar
- **Settings page** — output directory, default quality, and a custom FFmpeg binary chosen through a file dialog (the app never accepts a binary path from the page itself)
- **Offline by default** — all binaries bundled, no telemetry, no accounts. The only network call the *app* makes is the optional update check below, which contacts the GitHub Releases API and nothing else. (Building from source downloads the FFmpeg binaries once; see below.)

---

## Screenshots

> _Coming soon_

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 20
- [pnpm](https://pnpm.io) **9.15.4** — pinned in `package.json` via `packageManager`

The lockfile is `lockfileVersion 9.0`; pnpm 7 or 8 will refuse it. The simplest
way to get the exact pinned version is Corepack, which ships with Node:

```bash
corepack enable
```

### Install dependencies

```bash
pnpm install
```

CI installs with `--frozen-lockfile`, so a change to any `package.json` must be
committed together with the updated `pnpm-lock.yaml` or the build fails.

### FFmpeg binaries

`ffmpeg` and `ffprobe` are not npm dependencies. They are fetched once from a
pinned GitHub release and verified against SHA-256 checksums committed in
[`scripts/ffmpeg-manifest.json`](scripts/ffmpeg-manifest.json):

```bash
pnpm ffmpeg:fetch
```

`pnpm dev` and every `pnpm dist:*` target run this for you. Downloads are cached
under `node_modules/.cache/ffmpeg-bin/<release-tag>/`, so it only hits the
network the first time. **If a downloaded binary does not match its checksum,
packaging stops** rather than shipping an unverified executable.

Both binaries come from the same FFmpeg build, so `ffprobe` can always read what
`ffmpeg` just wrote. To move to a new FFmpeg release, update the tag and URL in
the manifest and regenerate the checksums:

```bash
node scripts/verify-ffmpeg-manifest.mjs --update
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
pnpm ffmpeg:fetch
```

Fetches and checksum-verifies the FFmpeg 7.1 `ffmpeg`/`ffprobe` pair into
`apps/desktop/extra-resources/ffmpeg/`. The `pnpm dist:*` targets already do
this; run it by hand only when calling `electron-builder` directly.

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
│   ├── ffmpeg-presets/       # Stream-copy and container presets
│   ├── media-formats/        # Target profiles, job spec builder, conversion matrix, UI meta
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
| Media processing | [FFmpeg](https://ffmpeg.org) 7.1 — `ffmpeg` and `ffprobe` from the same build, bundled |
| i18n | [svelte-i18n](https://github.com/kaisermann/svelte-i18n) 4 |
| Validation | [Zod](https://zod.dev) |
| Build system | [Turbo](https://turbo.build) + [pnpm workspaces](https://pnpm.io/workspaces) |
| Packaging | [electron-builder](https://www.electron.build) 25 |
| Language | TypeScript 5.7 |

---

## License

MIT — see [LICENSE](LICENSE) for details.
