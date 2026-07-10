// Builds a distributable .dmg from the packaged .app using macOS `hdiutil`.
// Run after `npm run package` (or via `npm run dist`).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const appDir = path.join(root, 'dist', 'BacklogDashboard-darwin-arm64');
const app = path.join(appDir, 'BacklogDashboard.app');
const version = require(path.join(root, 'package.json')).version;
const dmg = path.join(root, 'dist', `BacklogDashboard-${version}-arm64.dmg`);

if (!fs.existsSync(app)) {
  console.error('Packaged app not found:', app, '\nRun `npm run package` first.');
  process.exit(1);
}

// Stage a folder containing the app + an /Applications symlink (drag-to-install).
const stage = path.join(root, 'dist', 'dmg-stage');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
execFileSync('cp', ['-R', app, path.join(stage, 'BacklogDashboard.app')]);
execFileSync('ln', ['-s', '/Applications', path.join(stage, 'Applications')]);

try { fs.unlinkSync(dmg); } catch {}
execFileSync('hdiutil', [
  'create', '-volname', 'Backlog Dashboard',
  '-srcfolder', stage, '-ov', '-format', 'UDZO', dmg,
], { stdio: 'inherit' });

fs.rmSync(stage, { recursive: true, force: true });
console.log('\nWrote', path.relative(root, dmg));
