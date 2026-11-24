#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AWESOME_OS_BUNDLED_EXTENSIONS,
  ensureElectronBinary,
  ensureFastTypeScript,
  ensureGhostAbiAddonPath,
  ensureSharedExtensionsDir,
  getElectronAssetKey,
  getElectronExecutableRelPath,
  getGhostAbiAssetKey,
  getGhostCacheDir,
  getTypeScriptAssetKey,
  OPEN_VSX_REGISTRY_URL,
  resolveElectronEntry,
  resolveGhostAbiEntry,
  resolveTypeScriptEntry,
  type BundledAwesomeOsExtension,
  type GhostCasEntry,
} from './hydrate.mts';

export type TheiaLaunchMode = 'sectium' | 'electron';

export interface ParsedCliArgs {
  mode: TheiaLaunchMode;
  dryRun: boolean;
  showVersion: boolean;
  showHelp: boolean;
  workspaceDir: string;
  passthroughArgs: string[];
}

export interface TheiaLaunchPlan {
  adapter: '@awesome-os/theia';
  version: string;
  mode: TheiaLaunchMode;
  zeroElectron: boolean;
  workspaceDir: string;
  extensionsDir: string;
  bundledExtensions: readonly BundledAwesomeOsExtension[];
  ipcProtocol: 'B8G_ARENA_V1';
  env: Record<string, string>;
  command: string;
  args: string[];
  typescript: {
    assetKey: string;
    version: string;
    sha256: string;
    bytes: number;
    installDir: string;
    tsdkPath: string;
    downloadUrl: string;
  };
  electron?: {
    assetKey: string;
    sha256: string;
    bytes: number;
    installDir: string;
    executablePath: string;
    downloadUrl: string;
  };
  ghostAbi?: {
    assetKey: string;
    sha256: string;
    bytes: number;
    addonPath: string;
    downloadUrl: string;
  };
  sectium?: {
    target: 'sectium-browser';
    displayChannel: string;
  };
}

export function getPackageVersion(): string {
  try {
    const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? '0.1.0';
  } catch {
    return '0.1.0';
  }
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  let mode: TheiaLaunchMode = 'sectium';
  let dryRun = false;
  let showVersion = false;
  let showHelp = false;
  let workspaceDir = process.cwd();
  const passthroughArgs: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--browser' || arg === '--sectium') {
      mode = 'sectium';
    } else if (arg === '--electron') {
      mode = 'electron';
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--version' || arg === '-v') {
      showVersion = true;
    } else if (arg === '--help' || arg === '-h') {
      showHelp = true;
    } else if (!arg.startsWith('-') && workspaceDir === process.cwd()) {
      workspaceDir = resolve(arg);
    } else {
      passthroughArgs.push(arg);
    }
  }

  return { mode, dryRun, showVersion, showHelp, workspaceDir, passthroughArgs };
}

export function formatHelpText(): string {
  return [
    `@awesome-os/theia v${getPackageVersion()}`,
    '',
    'Eclipse Theia IDE adapter over Sectium Browser/Electron, shared b8g-ghost cas-v1 Electron,',
    'Faster Wave 2 TypeScript 6.0.3, B8G_ARENA_V1 zero-copy IPC, and shared Open VSX .vsix cache',
    '(~/.b8g/cas/extensions/) with the 5 default Awesome-OS extensions.',
    '',
    'Usage:',
    '  theia [workspace-dir] [options]',
    '',
    'Options:',
    '  --sectium, --browser   Launch in Sectium Display / sectium-browser mode (default, zero Electron)',
    '  --electron             Launch with shared b8g-ghost cas-v1 Electron + b8g-ghost-abi.node',
    '  --dry-run              Resolve cas-v1 entries and print the JSON launch plan without spawning',
    '  -v, --version          Print adapter version',
    '  -h, --help             Print this help message',
  ].join('\n');
}

function getDefaultSectiumPipe(): string {
  return process.platform === 'win32' ? '\\\\.\\pipe\\sectium-dev' : '/tmp/sectium-dev.sock';
}

export async function buildLaunchPlan(parsed: ParsedCliArgs): Promise<TheiaLaunchPlan> {
  const version = getPackageVersion();
  const extensions = ensureSharedExtensionsDir();
  const cacheDir = getGhostCacheDir();
  const tsAssetKey = getTypeScriptAssetKey();
  const bundledExtensionIds = AWESOME_OS_BUNDLED_EXTENSIONS.map((ext) => ext.id).join(',');

  if (parsed.mode === 'sectium') {
    let tsEntry: GhostCasEntry;
    let tsInstallDir: string;
    let tsdkPath: string;

    if (parsed.dryRun) {
      tsEntry = await resolveTypeScriptEntry(tsAssetKey);
      tsInstallDir = join(cacheDir, 'typescript', tsEntry.sha256);
      tsdkPath = join(tsInstallDir, 'lib');
    } else {
      const tsRes = await ensureFastTypeScript(tsAssetKey);
      tsEntry = tsRes.entry;
      tsInstallDir = tsRes.installDir;
      tsdkPath = tsRes.tsdkPath;
    }

    const displayChannel = process.env.SECTIUM_DEVICE_PIPE ?? getDefaultSectiumPipe();
    return {
      adapter: '@awesome-os/theia',
      version,
      mode: 'sectium',
      zeroElectron: true,
      workspaceDir: parsed.workspaceDir,
      extensionsDir: extensions.extensionsDir,
      bundledExtensions: AWESOME_OS_BUNDLED_EXTENSIONS,
      ipcProtocol: 'B8G_ARENA_V1',
      env: {
        B8G_IPC_PROTOCOL: 'B8G_ARENA_V1',
        THEIA_DEFAULT_PLUGINS: extensions.theiaDefaultPlugins,
        OVSX_REGISTRY_URL: process.env.OVSX_REGISTRY_URL ?? OPEN_VSX_REGISTRY_URL,
        B8G_SHARED_EXTENSIONS_DIR: extensions.extensionsDir,
        AWESOME_OS_BUNDLED_EXTENSIONS: bundledExtensionIds,
        AWESOME_OS_TYPESCRIPT_TSDK: tsdkPath,
        TYPESCRIPT_TSDK: tsdkPath,
        SECTIUM_TARGET: 'sectium-browser',
        SECTIUM_DEVICE_PIPE: displayChannel,
      },
      command: 'sectium-browser',
      args: ['--app=theia', `--workspace=${parsed.workspaceDir}`, ...parsed.passthroughArgs],
      typescript: {
        assetKey: tsAssetKey,
        version: tsEntry.version ?? '6.0.3-wave2',
        sha256: tsEntry.sha256,
        bytes: tsEntry.bytes,
        installDir: tsInstallDir,
        tsdkPath,
        downloadUrl: tsEntry.download_url,
      },
      sectium: {
        target: 'sectium-browser',
        displayChannel,
      },
    };
  }

  const electronAssetKey = getElectronAssetKey();
  const ghostAbiAssetKey = getGhostAbiAssetKey();

  let electronEntry: GhostCasEntry;
  let electronInstallDir: string;
  let electronExecutablePath: string;
  let ghostAbiEntry: GhostCasEntry;
  let ghostAbiAddonPath: string;
  let tsEntry: GhostCasEntry;
  let tsInstallDir: string;
  let tsdkPath: string;

  if (parsed.dryRun) {
    [electronEntry, ghostAbiEntry, tsEntry] = await Promise.all([
      resolveElectronEntry(electronAssetKey),
      resolveGhostAbiEntry(ghostAbiAssetKey),
      resolveTypeScriptEntry(tsAssetKey),
    ]);
    electronInstallDir = join(cacheDir, 'electron', electronEntry.sha256);
    electronExecutablePath = join(electronInstallDir, getElectronExecutableRelPath());
    ghostAbiAddonPath = join(cacheDir, 'ghost-abi', ghostAbiEntry.sha256, ghostAbiEntry.filename);
    tsInstallDir = join(cacheDir, 'typescript', tsEntry.sha256);
    tsdkPath = join(tsInstallDir, 'lib');
  } else {
    const [electronRes, ghostAbiRes, tsRes] = await Promise.all([
      ensureElectronBinary(electronAssetKey),
      ensureGhostAbiAddonPath(ghostAbiAssetKey),
      ensureFastTypeScript(tsAssetKey),
    ]);
    electronEntry = electronRes.entry;
    electronInstallDir = electronRes.installDir;
    electronExecutablePath = electronRes.executablePath;
    ghostAbiEntry = ghostAbiRes.entry;
    ghostAbiAddonPath = ghostAbiRes.addonPath;
    tsEntry = tsRes.entry;
    tsInstallDir = tsRes.installDir;
    tsdkPath = tsRes.tsdkPath;
  }

  return {
    adapter: '@awesome-os/theia',
    version,
    mode: 'electron',
    zeroElectron: false,
    workspaceDir: parsed.workspaceDir,
    extensionsDir: extensions.extensionsDir,
    bundledExtensions: AWESOME_OS_BUNDLED_EXTENSIONS,
    ipcProtocol: 'B8G_ARENA_V1',
    env: {
      B8G_IPC_PROTOCOL: 'B8G_ARENA_V1',
      THEIA_DEFAULT_PLUGINS: extensions.theiaDefaultPlugins,
      OVSX_REGISTRY_URL: process.env.OVSX_REGISTRY_URL ?? OPEN_VSX_REGISTRY_URL,
      B8G_SHARED_EXTENSIONS_DIR: extensions.extensionsDir,
      AWESOME_OS_BUNDLED_EXTENSIONS: bundledExtensionIds,
      AWESOME_OS_TYPESCRIPT_TSDK: tsdkPath,
      TYPESCRIPT_TSDK: tsdkPath,
      B8G_GHOST_ABI_PATH: ghostAbiAddonPath,
      B8G_GHOST_ELECTRON_SHA256: electronEntry.sha256,
    },
    command: electronExecutablePath,
    args: [parsed.workspaceDir, ...parsed.passthroughArgs],
    typescript: {
      assetKey: tsAssetKey,
      version: tsEntry.version ?? '6.0.3-wave2',
      sha256: tsEntry.sha256,
      bytes: tsEntry.bytes,
      installDir: tsInstallDir,
      tsdkPath,
      downloadUrl: tsEntry.download_url,
    },
    electron: {
      assetKey: electronAssetKey,
      sha256: electronEntry.sha256,
      bytes: electronEntry.bytes,
      installDir: electronInstallDir,
      executablePath: electronExecutablePath,
      downloadUrl: electronEntry.download_url,
    },
    ghostAbi: {
      assetKey: ghostAbiAssetKey,
      sha256: ghostAbiEntry.sha256,
      bytes: ghostAbiEntry.bytes,
      addonPath: ghostAbiAddonPath,
      downloadUrl: ghostAbiEntry.download_url,
    },
  };
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<number> {
  const parsed = parseCliArgs(argv);

  if (parsed.showVersion) {
    process.stdout.write(`@awesome-os/theia ${getPackageVersion()}\n`);
    return 0;
  }

  if (parsed.showHelp) {
    process.stdout.write(`${formatHelpText()}\n`);
    return 0;
  }

  const plan = await buildLaunchPlan(parsed);

  if (parsed.dryRun) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return 0;
  }

  const child = spawn(plan.command, plan.args, {
    stdio: 'inherit',
    env: { ...process.env, ...plan.env },
  });

  return await new Promise<number>((resolveExit, rejectExit) => {
    child.on('error', rejectExit);
    child.on('exit', (code) => resolveExit(code ?? 0));
  });
}

const isMainModule =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  runCli().then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[theia] fatal: ${message}\n`);
      process.exitCode = 1;
    },
  );
}
