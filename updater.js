// Self-update for the packaged app (runs in the Electron main process).
//
// Electron's built-in autoUpdater (Squirrel.Mac) can't be used here. This app is
// ad-hoc signed, and an ad-hoc signature's designated requirement is pinned to
// that exact build's cdhash:
//     designated => cdhash H"633d8744df3fba8c419f4b715e1a5652dec53727"
// Squirrel validates an update against the running app's requirement before
// swapping, so every new build would fail that check. Developer ID signing would
// give a build-stable requirement; until then we do the swap ourselves.
//
// What makes that safe enough to do:
//   - the release asset's SHA-256 comes from the GitHub API, and we verify the
//     download against it before anything touches /Applications;
//   - the staged bundle is sanity-checked (right version, launchable layout)
//     while we can still abort with a clear error;
//   - the swap keeps a backup and rolls back if the copy fails, so a half-done
//     update can't leave the user without an app.
'use strict';

const { app } = require('electron');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const execFileAsync = promisify(execFile);

const REPO = 'hsmt/backlog-dashboard';
const LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

// Compare "1.2.3"-style versions. Returns >0 if a is newer than b.
function compareVersions(a, b) {
  const parse = (v) => String(v).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

// The .app bundle we're running from: …/BacklogDashboard.app/Contents/MacOS/exe
function appBundlePath() {
  return path.resolve(app.getPath('exe'), '..', '..', '..');
}

// Updating only makes sense for a packaged .app sitting in a writable location.
// Running from source (npm start) has no bundle to replace.
function canSelfUpdate() {
  if (!app.isPackaged || process.platform !== 'darwin') return false;
  const bundle = appBundlePath();
  if (!bundle.endsWith('.app')) return false;
  try { fs.accessSync(path.dirname(bundle), fs.constants.W_OK); } catch { return false; }
  return true;
}

// Ask GitHub for the newest release. Returns null when we're already current, so
// callers can treat "no update" and "couldn't check" the same way (both quiet).
// The repo is public, so this needs no auth.
async function checkForUpdate() {
  const res = await fetch(LATEST_URL, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': `BacklogDashboard/${app.getVersion()}` },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const rel = await res.json();

  const version = String(rel.tag_name || '').replace(/^v/, '');
  if (!version || compareVersions(version, app.getVersion()) <= 0) return null;

  const asset = (rel.assets || []).find((a) => /\.dmg$/i.test(a.name));
  if (!asset) throw new Error('release has no .dmg asset');
  // GitHub publishes the asset digest ("sha256:…"); without it we can't verify
  // what we downloaded, so refuse rather than install an unchecked binary.
  const digest = String(asset.digest || '');
  if (!digest.startsWith('sha256:')) throw new Error('release asset has no sha256 digest');

  // The checksum comes from this same response, so it guards against a corrupted
  // or truncated download — not against a forged response. Pinning the host is
  // cheap defence in depth so a doctored payload can't point the download
  // somewhere else entirely. (GitHub redirects this to objects.githubusercontent
  // .com; fetch follows that itself, so only the initial host needs checking.)
  const url = new URL(asset.browser_download_url);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
    throw new Error(`unexpected download host: ${url.protocol}//${url.hostname}`);
  }

  return {
    version,
    url: url.href,
    sha256: digest.slice('sha256:'.length),
    size: asset.size,
    pageUrl: rel.html_url,
  };
}

// Shell out rather than use fs.rm: a staged bundle contains `app.asar`, which
// Electron's asar integration makes Node see as a directory, so fs.rm trips over
// it with ENOTDIR. `rm -rf` has no such view of the filesystem.
async function removeTree(dir) {
  await execFileAsync('rm', ['-rf', dir]).catch(() => {});
}

async function sha256File(file) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

// Download the DMG, verify it, and copy the new .app out to a staging dir.
// Everything here is reversible — /Applications is untouched until applyUpdate().
async function downloadAndStage(update, onProgress = () => {}) {
  const work = await fsp.mkdtemp(path.join(os.tmpdir(), 'bldash-update-'));
  const dmg = path.join(work, 'update.dmg');
  const mount = path.join(work, 'mnt');
  const staged = path.join(work, 'BacklogDashboard.app');

  try {
    const res = await fetch(update.url);
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    let received = 0;
    const body = Readable.fromWeb(res.body);
    body.on('data', (chunk) => { received += chunk.length; onProgress(received, update.size); });
    await pipeline(body, fs.createWriteStream(dmg));

    const actual = await sha256File(dmg);
    if (actual !== update.sha256) {
      throw new Error(`checksum mismatch (expected ${update.sha256.slice(0, 12)}…, got ${actual.slice(0, 12)}…)`);
    }

    await fsp.mkdir(mount, { recursive: true });
    await execFileAsync('hdiutil', ['attach', dmg, '-nobrowse', '-readonly', '-mountpoint', mount]);
    try {
      const src = path.join(mount, 'BacklogDashboard.app');
      const plist = path.join(src, 'Contents', 'Info.plist');
      await fsp.access(plist); // a DMG without the expected bundle is not our release
      // Confirm the bundle really is the version the release claimed.
      const { stdout } = await execFileAsync('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', plist]);
      const staleVersion = stdout.trim();
      if (compareVersions(staleVersion, app.getVersion()) <= 0) {
        throw new Error(`DMG contains ${staleVersion}, not newer than ${app.getVersion()}`);
      }
      // `ditto` preserves the bundle's symlinks/permissions/signature.
      await execFileAsync('ditto', [src, staged]);
    } finally {
      await execFileAsync('hdiutil', ['detach', mount, '-quiet']).catch(() => {});
    }

    await fsp.rm(dmg, { force: true });
    return { work, staged };
  } catch (e) {
    await removeTree(work);
    throw e;
  }
}

// The swap itself. Kept as a standalone builder so the exact script that ships
// can be exercised in isolation (including its rollback path) against throwaway
// paths, rather than only ever running for real against /Applications.
//
// `relaunch: false` is used by those tests — a test run must not `open` an app.
function buildSwapScript({ pid, relaunch = true }) {
  return `#!/bin/bash
set -u
# Paths arrive as arguments, never interpolated into the script: bash expands
# "$(…)" and backticks inside double quotes, so a bundle path containing them
# would otherwise be executed rather than used.
TARGET="$1"
STAGED="$2"
WORK="$3"
BACKUP="$TARGET.backup-$$"

# Wait for the old app to exit before touching its bundle (~10s, then proceed).
for _ in $(seq 1 100); do
  kill -0 ${pid} 2>/dev/null || break
  sleep 0.1
done

mv "$TARGET" "$BACKUP" || exit 1
if ditto "$STAGED" "$TARGET"; then
  # The DMG came from the internet, so the copy carries a quarantine flag; the
  # app is only ad-hoc signed, so Gatekeeper would hard-block it otherwise.
  xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null
  rm -rf "$BACKUP"
else
  rm -rf "$TARGET"
  mv "$BACKUP" "$TARGET"   # roll back to the version that was working
  EXIT=1
fi
rm -rf "$WORK"
${relaunch ? 'open "$TARGET"' : '# (relaunch skipped)'}
exit \${EXIT:-0}
`;
}

// Hand the swap to a detached shell script and quit: a running app can't replace
// its own bundle. The script waits for us to exit, keeps a backup, and restores
// it if the copy fails, so a failure can't leave no app installed.
function applyUpdate({ work, staged }) {
  // The script lives outside `work` — it deletes `work` on the way out, and a
  // running bash script must not delete the file it is still reading.
  const script = path.join(os.tmpdir(), `bldash-swap-${process.pid}.sh`);
  fs.writeFileSync(script, buildSwapScript({ pid: process.pid }), { mode: 0o755 });

  const child = spawn('/bin/bash', [script, appBundlePath(), staged, work],
    { detached: true, stdio: 'ignore' });
  child.unref();

  app.isQuitting = true;
  app.quit();
}

module.exports = {
  checkForUpdate, downloadAndStage, applyUpdate, canSelfUpdate,
  compareVersions, buildSwapScript,
};
