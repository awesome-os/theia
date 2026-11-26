> [!NOTE] Consolidated into the unified Holo v11 OS monorepo at https://github.com/awesome-os/awesome-os

# `@awesome-os/theia`

Eclipse Theia IDE adapter for **Awesome-OS** — running natively on **Sectium Browser** (`--sectium` / `--browser`, zero Electron) or on the **shared debloated `b8g-ghost @ cas-v1` Electron runtime** (`--electron`), wired to **Faster Wave 2 TypeScript (`6.0.3`)**, bridged via **`B8G_ARENA_V1`** zero-copy IPC, and sharing a **100% overlapping Open VSX `.vsix` extension cache** with [`awesome-os/code-oss`](https://github.com/awesome-os/code-oss).

---

## Quick Install & Usage

### Install via `pnpm` (or release tarball)

```powershell
pnpm add github:awesome-os/theia
```

Or download the latest SHA-256 verified archive from [`Releases`](https://github.com/awesome-os/theia/releases/latest).

### Usage & Verification

```powershell
# Launch Eclipse Theia on Sectium Browser (default, zero Electron) or shared cas-v1 Electron
node src/cli.mts --sectium --dry-run
node src/cli.mts --electron --dry-run

# Verify locally (Node.js 22+)
node --test
```

---

## Architecture Highlights

### 1. Sectium Browser-Native Target (`--sectium` / `--browser` — Zero Electron)
- Default target for Awesome-OS: attaches directly to the Power-Button-managed **Sectium Display** (`sectium-browser`) over the host device boundary (`\\.\pipe\sectium-dev` on Windows / `/tmp/sectium-dev.sock` on POSIX).
- **Zero Electron download or process overhead** — Theia's browser frontend renders directly inside Sectium with `B8G_ARENA_V1` zero-copy shared-memory IPC.

### 2. Shared `b8g-ghost @ cas-v1` Electron, Faster Wave 2 TypeScript (`6.0.3`), & Native ABI
`@awesome-os/theia` hydrates content-addressed blobs from [`awesome-os/b8g-ghost` (`cas-v1`)](https://github.com/awesome-os/b8g-ghost/releases/tag/cas-v1) verified by FIPS 180-4 SHA-256:

| Artifact | `cas-v1` Asset Key | Local CAS Path |
| :--- | :--- | :--- |
| Faster Wave 2 TypeScript (`6.0.3`) | `typescript-6.0.3-programmable.tar.gz` | `~/.b8g/cas/typescript/<sha256>/` |
| Debloated Electron (`--electron`) | `electron-win64.tar.zst` / `electron-linux-x64.tar.zst` / `electron-macos-arm64.tar.zst` | `~/.b8g/cas/electron/<sha256>/` |
| Native `B8G_ARENA_V1` ABI (`--electron`) | `b8g-ghost-abi-<os>.node` | `~/.b8g/cas/ghost-abi/<sha256>/` |
| Open VSX `.vsix` Cache | Shared local directory (`THEIA_DEFAULT_PLUGINS`) | `~/.b8g/cas/extensions/` |

- Both `--sectium` and `--electron` launch plans inject `AWESOME_OS_TYPESCRIPT_TSDK` and `TYPESCRIPT_TSDK` pointing to `~/.b8g/cas/typescript/<sha256>/lib`, wiring Faster Wave 2 TypeScript `6.0.3` automatically.
- Because `awesome-os/theia` and `awesome-os/code-oss` resolve the exact same `typescript-6.0.3-programmable.tar.gz`, `electron-<os>.tar.zst`, and `b8g-ghost-abi-<os>.node` SHA-256 entries into `~/.b8g/cas/`, **each artifact is downloaded and unpacked only once per host**.

### 3. 100% Extension Overlap & Default Awesome-OS Extension Bundle
- Both `@awesome-os/theia` and `awesome-os/code-oss` mount **`~/.b8g/cas/extensions/`** (overridable via `B8G_GHOST_CACHE_DIR`).
- `@awesome-os/theia` exports `THEIA_DEFAULT_PLUGINS=local-dir:~/.b8g/cas/extensions`, `OVSX_REGISTRY_URL=https://open-vsx.org`, and `AWESOME_OS_BUNDLED_EXTENSIONS` covering the 5 default Awesome-OS extensions:
  1. [`awesome-os/stealifylang-vscode`](https://github.com/awesome-os/stealifylang-vscode) (`stealifylang-vscode`) — StealifyLang LSP, `stealify-lint` (`B8G001`–`B8G016`), `.stealify-rules`, and Awesome-OS governance project rules
  2. [`awesome-os/unreal-vscode`](https://github.com/awesome-os/unreal-vscode) (`unreal-ghost`)
  3. [`awesome-os/godot-vscode`](https://github.com/awesome-os/godot-vscode) (`godot-ghost`)
  4. [`awesome-os/blender-vscode`](https://github.com/awesome-os/blender-vscode) (`blender-ghost`)
  5. [`awesome-os/obs-vscode`](https://github.com/awesome-os/obs-vscode) (`obs-ghost`)
- Any `.vsix` extension installed from Open VSX in Code-OSS is immediately available in Theia (and vice versa) with zero duplicate disk usage.

---

## CLI Usage

```bash
# Default: Sectium Browser-native target (zero Electron) + Wave 2 TypeScript 6.0.3 + 5 bundled extensions
node src/cli.mts --sectium --dry-run
node src/cli.mts --browser --dry-run

# Shared cas-v1 Electron + b8g-ghost-abi.node + Wave 2 TypeScript 6.0.3 + shared Open VSX extensions
node src/cli.mts --electron --dry-run

# Print version
node src/cli.mts --version
```

---

## Verification

Requires Node.js 22.18+ / 24+ (native erasable TypeScript execution, `noEmit: true`):

```bash
node --test test/theia-cas.test.mts
```

## Quick Install & Run (Windows / Linux / macOS)

```sh
# Install / hydrate from v11 CAS via holo-pm
holo-pm install repository://github.com/awesome-os/theia@main

# Or project & run directly via holo-project (0-byte hardlink)
holo-project "project://node/theia?from=repository://github.com/awesome-os/theia@main"
```
