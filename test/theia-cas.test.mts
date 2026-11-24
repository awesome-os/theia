import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  AWESOME_OS_BUNDLED_EXTENSIONS,
  buildLaunchPlan,
  ensureFastTypeScript,
  ensureGhostAbiAddonPath,
  ensureSharedExtensionsDir,
  fetchGhostIndex,
  getElectronAssetKey,
  getGhostAbiAssetKey,
  getSharedExtensionsDir,
  getTheiaDefaultPluginsEnv,
  getTypeScriptAssetKey,
  parseCliArgs,
  resolveElectronEntry,
  resolveGhostAbiEntry,
  resolveTypeScriptEntry,
  type TheiaLaunchPlan,
} from '../src/index.mts';

const cliPath = fileURLToPath(new URL('../src/cli.mts', import.meta.url));
const tempCacheDir = mkdtempSync(join(tmpdir(), 'b8g-theia-cas-test-'));
const originalCacheDir = process.env.B8G_GHOST_CACHE_DIR;
process.env.B8G_GHOST_CACHE_DIR = tempCacheDir;

after(() => {
  if (originalCacheDir === undefined) {
    delete process.env.B8G_GHOST_CACHE_DIR;
  } else {
    process.env.B8G_GHOST_CACHE_DIR = originalCacheDir;
  }
  rmSync(tempCacheDir, { recursive: true, force: true });
});

describe('@awesome-os/theia cas-v1 hydration & CLI', () => {
  it('resolves live cas-v1 shared Electron entry for win64, linux-x64, and macos-arm64', async () => {
    const index = await fetchGhostIndex(true);
    assert.equal(index.schema, 'b8g-ghost-cas-index-v1');
    assert.ok(index.total_entries > 0, 'cas-v1 index must contain entries');

    const currentElectron = await resolveElectronEntry(getElectronAssetKey(), index);
    assert.match(currentElectron.sha256, /^[0-9a-f]{64}$/);
    assert.ok(currentElectron.bytes > 0);
    assert.ok(currentElectron.download_url.includes('/releases/download/cas-v1/'));

    for (const key of [
      'electron-win64.tar.zst',
      'electron-linux-x64.tar.zst',
      'electron-macos-arm64.tar.zst',
    ]) {
      const entry = await resolveElectronEntry(key, index);
      assert.match(entry.sha256, /^[0-9a-f]{64}$/, `valid sha256 for ${key}`);
      assert.ok(entry.bytes > 0, `non-empty bytes for ${key}`);
    }
  });

  it('resolves and hydrates Faster Wave 2 TypeScript 6.0.3 from live cas-v1 with cache hit', async () => {
    assert.equal(getTypeScriptAssetKey(), 'typescript-6.0.3-programmable.tar.gz');

    const entry = await resolveTypeScriptEntry();
    assert.equal(entry.filename, 'typescript-6.0.3-programmable.tar.gz');
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    assert.ok(entry.bytes > 0);
    assert.ok(entry.download_url.includes('/releases/download/cas-v1/'));

    const first = await ensureFastTypeScript();
    assert.equal(first.cacheHit, false);
    assert.equal(first.entry.sha256, entry.sha256);
    assert.ok(
      first.installDir.includes(join('typescript', entry.sha256)),
      'TypeScript is stored under <cacheDir>/typescript/<sha256>/',
    );
    assert.equal(first.tsdkPath, join(first.installDir, 'lib'));
    assert.ok(existsSync(first.typescriptJsPath), 'hydrated lib/typescript.js exists');

    const second = await ensureFastTypeScript();
    assert.equal(second.cacheHit, true);
    assert.equal(second.tsdkPath, first.tsdkPath);
    assert.equal(second.typescriptJsPath, first.typescriptJsPath);
  });

  it('hydrates b8g-ghost-abi-<os>.node from live cas-v1 with SHA-256 verification and cache hit', async () => {
    const key = getGhostAbiAssetKey();
    const expected = await resolveGhostAbiEntry(key);
    assert.match(expected.sha256, /^[0-9a-f]{64}$/);

    const first = await ensureGhostAbiAddonPath(key);
    assert.equal(first.cacheHit, false);
    assert.equal(first.entry.sha256, expected.sha256);
    assert.ok(existsSync(first.addonPath), `hydrated addon exists at ${first.addonPath}`);
    assert.ok(
      first.addonPath.includes(join('ghost-abi', expected.sha256)),
      'addon is stored under <cacheDir>/ghost-abi/<sha256>/',
    );

    const actualSha = createHash('sha256').update(readFileSync(first.addonPath)).digest('hex');
    assert.equal(actualSha, expected.sha256);

    const second = await ensureGhostAbiAddonPath(key);
    assert.equal(second.cacheHit, true);
    assert.equal(second.addonPath, first.addonPath);
  });

  it('exports all 5 default Awesome-OS bundled extensions and shared ~/.b8g/cas/extensions/ cache', () => {
    assert.equal(AWESOME_OS_BUNDLED_EXTENSIONS.length, 5);
    assert.deepEqual(
      AWESOME_OS_BUNDLED_EXTENSIONS.map((ext) => ({ id: ext.id, repo: ext.repo })),
      [
        { id: 'stealifylang-vscode', repo: 'awesome-os/stealifylang-vscode' },
        { id: 'unreal-ghost', repo: 'awesome-os/unreal-vscode' },
        { id: 'godot-ghost', repo: 'awesome-os/godot-vscode' },
        { id: 'blender-ghost', repo: 'awesome-os/blender-vscode' },
        { id: 'obs-ghost', repo: 'awesome-os/obs-vscode' },
      ],
    );

    const sharedDir = getSharedExtensionsDir();
    assert.equal(sharedDir, join(tempCacheDir, 'extensions'));

    const res = ensureSharedExtensionsDir();
    assert.ok(existsSync(res.extensionsDir));
    assert.equal(res.theiaDefaultPlugins, `local-dir:${sharedDir}`);
    assert.equal(getTheiaDefaultPluginsEnv(), `local-dir:${sharedDir}`);
    assert.equal(res.bundledExtensions.length, 5);

    const sampleVsix = join(sharedDir, 'sample.extension-1.0.0.vsix');
    writeFileSync(sampleVsix, 'vsix-stub', 'utf8');
    const refreshed = ensureSharedExtensionsDir();
    assert.ok(refreshed.entries.includes('sample.extension-1.0.0.vsix'));
  });

  it('supports --dry-run CLI for --sectium / --browser (zero Electron), --electron, and --version', async () => {
    const expectedBundledIds =
      'stealifylang-vscode,unreal-ghost,godot-ghost,blender-ghost,obs-ghost';

    const versionOut = execFileSync(process.execPath, [cliPath, '--version'], {
      encoding: 'utf8',
      env: { ...process.env, B8G_GHOST_CACHE_DIR: tempCacheDir },
    }).trim();
    assert.match(versionOut, /^@awesome-os\/theia \d+\.\d+\.\d+$/);

    const sectiumRaw = execFileSync(process.execPath, [cliPath, '--sectium', '--dry-run'], {
      encoding: 'utf8',
      env: { ...process.env, B8G_GHOST_CACHE_DIR: tempCacheDir },
    });
    const sectiumPlan = JSON.parse(sectiumRaw) as TheiaLaunchPlan;
    assert.equal(sectiumPlan.mode, 'sectium');
    assert.equal(sectiumPlan.zeroElectron, true);
    assert.equal(sectiumPlan.ipcProtocol, 'B8G_ARENA_V1');
    assert.equal(sectiumPlan.sectium?.target, 'sectium-browser');
    assert.equal(
      sectiumPlan.env.THEIA_DEFAULT_PLUGINS,
      `local-dir:${join(tempCacheDir, 'extensions')}`,
    );
    assert.equal(sectiumPlan.typescript.assetKey, 'typescript-6.0.3-programmable.tar.gz');
    assert.match(sectiumPlan.typescript.sha256, /^[0-9a-f]{64}$/);
    assert.ok(
      sectiumPlan.typescript.installDir.includes(join('typescript', sectiumPlan.typescript.sha256)),
    );
    assert.equal(sectiumPlan.env.AWESOME_OS_TYPESCRIPT_TSDK, sectiumPlan.typescript.tsdkPath);
    assert.equal(sectiumPlan.env.TYPESCRIPT_TSDK, sectiumPlan.typescript.tsdkPath);
    assert.equal(sectiumPlan.bundledExtensions.length, 5);
    assert.equal(sectiumPlan.env.AWESOME_OS_BUNDLED_EXTENSIONS, expectedBundledIds);
    assert.equal(sectiumPlan.env.B8G_APP_NAME, 'Awesome-OS Theia');
    assert.equal(sectiumPlan.env.B8G_LIBELECTRON_DIR, join(tempCacheDir, 'libelectron'));

    const browserPlan = await buildLaunchPlan(parseCliArgs(['--browser', '--dry-run']));
    assert.equal(browserPlan.mode, 'sectium');
    assert.equal(browserPlan.zeroElectron, true);
    assert.equal(browserPlan.typescript.assetKey, 'typescript-6.0.3-programmable.tar.gz');
    assert.equal(browserPlan.bundledExtensions.length, 5);

    const electronRaw = execFileSync(process.execPath, [cliPath, '--electron', '--dry-run'], {
      encoding: 'utf8',
      env: { ...process.env, B8G_GHOST_CACHE_DIR: tempCacheDir },
    });
    const electronPlan = JSON.parse(electronRaw) as TheiaLaunchPlan;
    assert.equal(electronPlan.mode, 'electron');
    assert.equal(electronPlan.zeroElectron, false);
    assert.match(electronPlan.electron?.sha256 ?? '', /^[0-9a-f]{64}$/);
    assert.ok(
      electronPlan.electron?.installDir.includes(join('electron', electronPlan.electron.sha256)),
    );
    assert.match(electronPlan.ghostAbi?.sha256 ?? '', /^[0-9a-f]{64}$/);
    assert.equal(electronPlan.env.B8G_GHOST_ABI_PATH, electronPlan.ghostAbi?.addonPath);
    assert.equal(
      electronPlan.env.THEIA_DEFAULT_PLUGINS,
      `local-dir:${join(tempCacheDir, 'extensions')}`,
    );
    assert.equal(electronPlan.typescript.assetKey, 'typescript-6.0.3-programmable.tar.gz');
    assert.match(electronPlan.typescript.sha256, /^[0-9a-f]{64}$/);
    assert.equal(electronPlan.env.AWESOME_OS_TYPESCRIPT_TSDK, electronPlan.typescript.tsdkPath);
    assert.equal(electronPlan.env.TYPESCRIPT_TSDK, electronPlan.typescript.tsdkPath);
    assert.equal(electronPlan.bundledExtensions.length, 5);
    assert.equal(electronPlan.env.AWESOME_OS_BUNDLED_EXTENSIONS, expectedBundledIds);
    assert.equal(electronPlan.env.B8G_APP_NAME, 'Awesome-OS Theia');
    assert.equal(electronPlan.env.B8G_LIBELECTRON_DIR, join(tempCacheDir, 'libelectron'));
  });
});
