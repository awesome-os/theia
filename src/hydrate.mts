import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const GHOST_INDEX_URL =
  'https://raw.githubusercontent.com/awesome-os/b8g-ghost/main/manifests/index.json';
export const GHOST_CAS_BASE_URL =
  'https://github.com/awesome-os/b8g-ghost/releases/download/cas-v1';
export const OPEN_VSX_REGISTRY_URL = 'https://open-vsx.org';
export const TYPESCRIPT_ASSET_KEY = 'typescript-6.0.3-programmable.tar.gz';

export interface BundledAwesomeOsExtension {
  id: string;
  repo: string;
  repoUrl: string;
  description: string;
}

/**
 * Default Awesome-OS extension bundle shared across `@awesome-os/theia` and
 * `awesome-os/code-oss` via `~/.b8g/cas/extensions/`.
 */
export const AWESOME_OS_BUNDLED_EXTENSIONS: readonly BundledAwesomeOsExtension[] = [
  {
    id: 'stealifylang-vscode',
    repo: 'awesome-os/stealifylang-vscode',
    repoUrl: 'https://github.com/awesome-os/stealifylang-vscode',
    description:
      'StealifyLang LSP, stealify-lint (B8G001-B8G016), .stealify-rules, and Awesome-OS governance project rules',
  },
  {
    id: 'unreal-ghost',
    repo: 'awesome-os/unreal-vscode',
    repoUrl: 'https://github.com/awesome-os/unreal-vscode',
    description: 'Unreal Engine ghost integration for Awesome-OS',
  },
  {
    id: 'godot-ghost',
    repo: 'awesome-os/godot-vscode',
    repoUrl: 'https://github.com/awesome-os/godot-vscode',
    description: 'Godot Engine ghost integration for Awesome-OS',
  },
  {
    id: 'blender-ghost',
    repo: 'awesome-os/blender-vscode',
    repoUrl: 'https://github.com/awesome-os/blender-vscode',
    description: 'Blender ghost integration for Awesome-OS',
  },
  {
    id: 'obs-ghost',
    repo: 'awesome-os/obs-vscode',
    repoUrl: 'https://github.com/awesome-os/obs-vscode',
    description: 'OBS Studio ghost integration for Awesome-OS',
  },
] as const;

export interface GhostCasHistoryItem {
  sha256: string;
  bytes: number;
  version?: string;
  retired_at?: string;
}

export interface GhostCasEntry {
  filename: string;
  sha256: string;
  bytes: number;
  raw_bytes?: number;
  version?: string;
  category?: string;
  download_url: string;
  history?: GhostCasHistoryItem[];
}

export interface GhostIndex {
  schema: string;
  cas_base_url: string;
  updated_at: string;
  total_entries: number;
  entries: Record<string, GhostCasEntry>;
}

export interface HydratedElectronResult {
  entry: GhostCasEntry;
  installDir: string;
  executablePath: string;
  cacheHit: boolean;
}

export interface HydratedGhostAbiResult {
  entry: GhostCasEntry;
  addonPath: string;
  cacheDir: string;
  cacheHit: boolean;
}

export interface HydratedTypeScriptResult {
  entry: GhostCasEntry;
  installDir: string;
  tsdkPath: string;
  typescriptJsPath: string;
  cacheHit: boolean;
}

export interface SharedExtensionsResult {
  extensionsDir: string;
  theiaDefaultPlugins: string;
  openVsxRegistryUrl: string;
  entries: string[];
  bundledExtensions: readonly BundledAwesomeOsExtension[];
}

export interface HydratedTheiaElectronStack {
  electron: HydratedElectronResult;
  ghostAbi: HydratedGhostAbiResult;
  typescript: HydratedTypeScriptResult;
  extensions: SharedExtensionsResult;
}

let cachedIndex: GhostIndex | null = null;

export function getGhostCacheDir(): string {
  const dir = process.env.B8G_GHOST_CACHE_DIR ?? join(homedir(), '.b8g', 'cas');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Shared Open VSX / `.vsix` extension cache directory.
 * 100% shared with `awesome-os/code-oss` at `~/.b8g/cas/extensions/`
 * (or `$B8G_GHOST_CACHE_DIR/extensions`).
 */
export function getSharedExtensionsDir(): string {
  return join(getGhostCacheDir(), 'extensions');
}

export function getTheiaDefaultPluginsEnv(extensionsDir = getSharedExtensionsDir()): string {
  return `local-dir:${extensionsDir}`;
}

export function listSharedVsixExtensions(extensionsDir = getSharedExtensionsDir()): string[] {
  if (!existsSync(extensionsDir)) {
    return [];
  }
  return readdirSync(extensionsDir)
    .filter((name) => !name.startsWith('.'))
    .sort();
}

export function ensureSharedExtensionsDir(): SharedExtensionsResult {
  const extensionsDir = getSharedExtensionsDir();
  mkdirSync(extensionsDir, { recursive: true });
  return {
    extensionsDir,
    theiaDefaultPlugins: getTheiaDefaultPluginsEnv(extensionsDir),
    openVsxRegistryUrl: process.env.OVSX_REGISTRY_URL ?? OPEN_VSX_REGISTRY_URL,
    entries: listSharedVsixExtensions(extensionsDir),
    bundledExtensions: AWESOME_OS_BUNDLED_EXTENSIONS,
  };
}

export function getElectronAssetKey(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  if (platform === 'win32') return 'electron-win64.tar.zst';
  if (platform === 'darwin') return 'electron-macos-arm64.tar.zst';
  return arch === 'arm64' ? 'electron-linux-arm64.tar.zst' : 'electron-linux-x64.tar.zst';
}

export function getElectronExecutableRelPath(
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32') return 'electron.exe';
  if (platform === 'darwin') return join('Electron.app', 'Contents', 'MacOS', 'Electron');
  return 'electron';
}

export function getGhostAbiAssetKey(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  if (platform === 'win32') return 'b8g-ghost-abi-win64.node';
  if (platform === 'darwin') return 'b8g-ghost-abi-macos-arm64.node';
  return arch === 'arm64' ? 'b8g-ghost-abi-linux-arm64.node' : 'b8g-ghost-abi-linux-x64.node';
}

export function getTypeScriptAssetKey(): string {
  return TYPESCRIPT_ASSET_KEY;
}

export async function fetchGhostIndex(forceRefresh = false): Promise<GhostIndex> {
  if (cachedIndex && !forceRefresh) {
    return cachedIndex;
  }
  const cacheFile = join(getGhostCacheDir(), 'index.json');
  try {
    const res = await fetch(GHOST_INDEX_URL, {
      headers: { 'User-Agent': 'awesome-os-theia/0.1.0' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${GHOST_INDEX_URL}`);
    }
    const json = (await res.json()) as GhostIndex;
    try {
      const tmp = `${cacheFile}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(json, null, 2), 'utf8');
      renameSync(tmp, cacheFile);
    } catch {
      // Non-fatal if cache write races
    }
    cachedIndex = json;
    return json;
  } catch (err) {
    if (existsSync(cacheFile)) {
      cachedIndex = JSON.parse(readFileSync(cacheFile, 'utf8')) as GhostIndex;
      return cachedIndex;
    }
    throw err;
  }
}

function applyKeepLast5Pin(entry: GhostCasEntry, pinnedSha?: string): GhostCasEntry {
  const sha = pinnedSha?.trim();
  if (!sha || sha === entry.sha256) {
    return entry;
  }
  const hist = entry.history?.find((h) => h.sha256 === sha);
  if (hist) {
    return {
      ...entry,
      sha256: hist.sha256,
      bytes: hist.bytes,
      version: hist.version ?? entry.version,
      download_url: `${GHOST_CAS_BASE_URL}/${hist.sha256}`,
    };
  }
  return entry;
}

export async function resolveElectronEntry(
  assetKey = getElectronAssetKey(),
  index?: GhostIndex,
): Promise<GhostCasEntry> {
  const idx = index ?? (await fetchGhostIndex());
  const entry = idx.entries[assetKey];
  if (!entry) {
    throw new Error(
      `Electron asset "${assetKey}" not found in b8g-ghost cas-v1 index (${idx.total_entries} entries)`,
    );
  }
  return applyKeepLast5Pin(entry, process.env.ELECTRON_GHOST_SHA256);
}

export async function resolveGhostAbiEntry(
  assetKey = getGhostAbiAssetKey(),
  index?: GhostIndex,
): Promise<GhostCasEntry> {
  const idx = index ?? (await fetchGhostIndex());
  const entry = idx.entries[assetKey];
  if (!entry) {
    throw new Error(
      `Ghost ABI addon "${assetKey}" not found in b8g-ghost cas-v1 index (${idx.total_entries} entries)`,
    );
  }
  return entry;
}

export async function resolveTypeScriptEntry(
  assetKey = getTypeScriptAssetKey(),
  index?: GhostIndex,
): Promise<GhostCasEntry> {
  const idx = index ?? (await fetchGhostIndex());
  const entry = idx.entries[assetKey];
  if (!entry) {
    throw new Error(
      `TypeScript asset "${assetKey}" not found in b8g-ghost cas-v1 index (${idx.total_entries} entries)`,
    );
  }
  return applyKeepLast5Pin(entry, process.env.TYPESCRIPT_GHOST_SHA256);
}

async function downloadVerifiedBlob(entry: GhostCasEntry, destPath: string): Promise<boolean> {
  if (existsSync(destPath)) {
    const actual = createHash('sha256').update(readFileSync(destPath)).digest('hex');
    if (actual === entry.sha256) {
      return true;
    }
  }

  const url = entry.download_url || `${GHOST_CAS_BASE_URL}/${entry.sha256}`;
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'awesome-os-theia/0.1.0' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} hydrating ${entry.filename} from ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const actual = createHash('sha256').update(buf).digest('hex');
  if (actual !== entry.sha256) {
    throw new Error(
      `SHA-256 mismatch for ${entry.filename}: expected ${entry.sha256}, got ${actual}`,
    );
  }

  const tmp = `${destPath}.${process.pid}.tmp`;
  writeFileSync(tmp, buf);
  renameSync(tmp, destPath);
  return false;
}

export async function ensureElectronBinary(
  assetKey = getElectronAssetKey(),
  platform: NodeJS.Platform = process.platform,
): Promise<HydratedElectronResult> {
  const entry = await resolveElectronEntry(assetKey);
  const cacheDir = getGhostCacheDir();
  const installDir = join(cacheDir, 'electron', entry.sha256);
  const executablePath = join(installDir, getElectronExecutableRelPath(platform));

  if (existsSync(executablePath)) {
    return { entry, installDir, executablePath, cacheHit: true };
  }

  const archivePath = join(cacheDir, `${entry.sha256}.tar.zst`);
  await downloadVerifiedBlob(entry, archivePath);

  mkdirSync(installDir, { recursive: true });
  execFileSync('tar', ['--zstd', '-xf', archivePath, '-C', installDir], { stdio: 'inherit' });

  if (!existsSync(executablePath)) {
    throw new Error(`Extracted Electron archive missing expected binary: ${executablePath}`);
  }

  return { entry, installDir, executablePath, cacheHit: false };
}

export async function ensureGhostAbiAddonPath(
  assetKey = getGhostAbiAssetKey(),
): Promise<HydratedGhostAbiResult> {
  const entry = await resolveGhostAbiEntry(assetKey);
  const cacheDir = getGhostCacheDir();
  const addonDir = join(cacheDir, 'ghost-abi', entry.sha256);
  const addonPath = join(addonDir, entry.filename);

  mkdirSync(addonDir, { recursive: true });
  const cacheHit = await downloadVerifiedBlob(entry, addonPath);

  return { entry, addonPath, cacheDir, cacheHit };
}

export async function ensureFastTypeScript(
  assetKey = getTypeScriptAssetKey(),
): Promise<HydratedTypeScriptResult> {
  const entry = await resolveTypeScriptEntry(assetKey);
  const cacheDir = getGhostCacheDir();
  const installDir = join(cacheDir, 'typescript', entry.sha256);
  const tsdkPath = join(installDir, 'lib');
  const typescriptJsPath = join(tsdkPath, 'typescript.js');

  if (existsSync(typescriptJsPath)) {
    return { entry, installDir, tsdkPath, typescriptJsPath, cacheHit: true };
  }

  const archivePath = join(cacheDir, `${entry.sha256}.tar.gz`);
  await downloadVerifiedBlob(entry, archivePath);

  mkdirSync(installDir, { recursive: true });
  execFileSync('tar', ['-xzf', archivePath, '-C', installDir], { stdio: 'inherit' });

  if (!existsSync(typescriptJsPath)) {
    throw new Error(
      `Extracted TypeScript archive missing expected compiler module: ${typescriptJsPath}`,
    );
  }

  return { entry, installDir, tsdkPath, typescriptJsPath, cacheHit: false };
}

export async function hydrateTheiaElectronStack(): Promise<HydratedTheiaElectronStack> {
  const extensions = ensureSharedExtensionsDir();
  const [electron, ghostAbi, typescript] = await Promise.all([
    ensureElectronBinary(),
    ensureGhostAbiAddonPath(),
    ensureFastTypeScript(),
  ]);
  return { electron, ghostAbi, typescript, extensions };
}
