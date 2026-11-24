import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildLaunchPlan,
  ensureGhostAbiAddonPath,
  ensureSharedExtensionsDir,
  fetchGhostIndex,
  getElectronAssetKey,
  getGhostAbiAssetKey,
  getSharedExtensionsDir,
  getTheiaDefaultPluginsEnv,
  parseCliArgs,
  resolveElectronEntry,
  resolveGhostAbiEntry,
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

  it('provisions shared ~/.b8g/cas/extensions/ directory compatible with awesome-os/code-oss', () => {
    const sharedDir = getSharedExtensionsDir();
    assert.equal(sharedDir, join(tempCacheDir, 'extensions'));

    const res = ensureSharedExtensionsDir();
    assert.ok(existsSync(res.extensionsDir));
    assert.equal(res.theiaDefaultPlugins, `local-dir:${sharedDir}`);
    assert.equal(getTheiaDefaultPluginsEnv(), `local-dir:${sharedDir}`);

    const sampleVsix = join(sharedDir, 'sample.extension-1.0.0.vsix');
    writeFileSync(sampleVsix, 'vsix-stub', 'utf8');
    const refreshed = ensureSharedExtensionsDir();
    assert.ok(refreshed.entries.includes('sample.extension-1.0.0.vsix'));
  });

  it('supports --dry-run CLI for --sectium / --browser (zero Electron), --electron, and --version', async () => {
    const versionOut = execFileSync(process.execPath, [cliPath, '--version'], {
      encoding: 'utf8',
      env: { ...process.env, B8G_GHOST_CACHE_DIR: tempCacheDir },
    }).trim();
    assert.match(versionOut, /^@awesome-os\/theia \d+\.\d+\.\d+$/);

    const sectiumRaw = execFileSync(process.execPath, [cliPath, '--sectium', '--dry-run'], {
      encoding: 'utf8',
      env: { ...process.env, B8G_GHOST_CACHE_DIR: tempCacheDir },
    });
    const sectiumPlan = JSON.parse(sectiumRaw) as {
      mode: string;
      zeroElectron: boolean;
      ipcProtocol: string;
      extensionsDir: string;
      env: Record<string, string>;
      sectium?: { target: string };
    };
    assert.equal(sectiumPlan.mode, 'sectium');
    assert.equal(sectiumPlan.zeroElectron, true);
    assert.equal(sectiumPlan.ipcProtocol, 'B8G_ARENA_V1');
    assert.equal(sectiumPlan.sectium?.target, 'sectium-browser');
    assert.equal(sectiumPlan.env.THEIA_DEFAULT_PLUGINS, `local-dir:${join(tempCacheDir, 'extensions')}`);

    const browserPlan = await buildLaunchPlan(parseCliArgs(['--browser', '--dry-run']));
    assert.equal(browserPlan.mode, 'sectium');
    assert.equal(browserPlan.zeroElectron, true);

    const electronRaw = execFileSync(process.execPath, [cliPath, '--electron', '--dry-run'], {
      encoding: 'utf8',
      env: { ...process.env, B8G_GHOST_CACHE_DIR: tempCacheDir },
    });
    const electronPlan = JSON.parse(electronRaw) as {
      mode: string;
      zeroElectron: boolean;
      env: Record<string, string>;
      electron?: { sha256: string; installDir: string };
      ghostAbi?: { sha256: string; addonPath: string };
    };
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
  });
});
