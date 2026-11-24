# `@awesome-os/theia`

Eclipse Theia IDE adapter for **Awesome-OS** — running natively on **Sectium Browser** (`--sectium` / `--browser`, zero Electron) or on the **shared debloated `b8g-ghost @ cas-v1` Electron runtime** (`--electron`), bridged via **`B8G_ARENA_V1`** zero-copy IPC and sharing a **100% overlapping Open VSX `.vsix` extension cache** with [`awesome-os/code-oss`](https://github.com/awesome-os/code-oss).

---

## Architecture Highlights

### 1. Sectium Browser-Native Target (`--sectium` / `--browser` — Zero Electron)
- Default target for Awesome-OS: attaches directly to the Power-Button-managed **Sectium Display** (`sectium-browser`) over the host device boundary (`\\.\pipe\sectium-dev` on Windows / `/tmp/sectium-dev.sock` on POSIX).
- **Zero Electron download or process overhead** — Theia's browser frontend renders directly inside Sectium with `B8G_ARENA_V1` zero-copy shared-memory IPC.

### 2. Shared `b8g-ghost @ cas-v1` Electron & Native ABI (`--electron`)
When desktop Electron mode is requested, `@awesome-os/theia` hydrates content-addressed blobs from [`awesome-os/b8g-ghost` (`cas-v1`)](https://github.com/awesome-os/b8g-ghost/releases/tag/cas-v1) verified by FIPS 180-4 SHA-256:

| Artifact | `cas-v1` Asset Key | Local CAS Path |
| :--- | :--- | :--- |
| Debloated Electron | `electron-win64.tar.zst` / `electron-linux-x64.tar.zst` / `electron-macos-arm64.tar.zst` | `~/.b8g/cas/electron/<sha256>/` |
| Native `B8G_ARENA_V1` ABI | `b8g-ghost-abi-<os>.node` | `~/.b8g/cas/ghost-abi/<sha256>/` |
| Open VSX `.vsix` Cache | Shared local directory (`THEIA_DEFAULT_PLUGINS`) | `~/.b8g/cas/extensions/` |

Because `awesome-os/theia` and `awesome-os/code-oss` resolve the exact same `electron-<os>.tar.zst` and `b8g-ghost-abi-<os>.node` SHA-256 entries into `~/.b8g/cas/`, **Electron is downloaded and unpacked only once per host**.

### 3. 100% Extension Overlap with `awesome-os/code-oss`
- Both `@awesome-os/theia` and `awesome-os/code-oss` mount **`~/.b8g/cas/extensions/`** (overridable via `B8G_GHOST_CACHE_DIR`).
- `@awesome-os/theia` exports `THEIA_DEFAULT_PLUGINS=local-dir:~/.b8g/cas/extensions` and `OVSX_REGISTRY_URL=https://open-vsx.org`.
- Any `.vsix` extension installed from Open VSX in Code-OSS is immediately available in Theia (and vice versa) with zero duplicate disk usage.

---

## CLI Usage

```bash
# Default: Sectium Browser-native target (zero Electron)
node src/cli.mts --sectium --dry-run
node src/cli.mts --browser --dry-run

# Shared cas-v1 Electron + b8g-ghost-abi.node + shared Open VSX extensions
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
