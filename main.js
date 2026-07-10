'use strict';
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, screen, Notification, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { BacklogClient } = require('./backlog');

const POLL_INTERVAL_MS = 60 * 1000; // Backlog notification poll cadence

let tray = null;
let win = null;
let client = null;
let cachedUserId = null;
let lastShownAt = 0; // guards against the spurious blur that fires right after show
let pollTimer = null;
let lastNotificationId = 0; // highest notification id we've already handled

// Single-instance: focus the existing window instead of launching a duplicate.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win && !win.isDestroyed()) showWindow(); });
}

const configPath = () => path.join(app.getPath('userData'), 'config.json');
const DEFAULT_SPACE = ''; // no default; the user enters their own space in Settings

function readRawConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return {}; }
}

// The API key is encrypted at rest with the OS keychain (Electron safeStorage);
// only decrypted in memory. `apiKey` (plaintext) is read only to migrate old
// configs written before encryption was added.
function loadConfig() {
  const raw = readRawConfig();
  let apiKey = '';
  if (raw.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
    try { apiKey = safeStorage.decryptString(Buffer.from(raw.apiKeyEnc, 'base64')); } catch { apiKey = ''; }
  } else if (typeof raw.apiKey === 'string') {
    apiKey = raw.apiKey; // legacy plaintext (pre-encryption)
  }
  return { spaceDomain: raw.spaceDomain || DEFAULT_SPACE, apiKey };
}

function saveConfig(cfg) {
  const out = { spaceDomain: cfg.spaceDomain || DEFAULT_SPACE };
  if (cfg.apiKey) {
    if (safeStorage.isEncryptionAvailable()) {
      out.apiKeyEnc = safeStorage.encryptString(cfg.apiKey).toString('base64');
    } else {
      out.apiKey = cfg.apiKey; // fallback only if the OS keychain is unavailable
    }
  }
  fs.writeFileSync(configPath(), JSON.stringify(out, null, 2), { mode: 0o600 });
}

// One-time migration: rewrite any legacy plaintext key as encrypted at rest.
function migrateConfigIfNeeded(cfg) {
  const raw = readRawConfig();
  if (raw.apiKey && !raw.apiKeyEnc && cfg.apiKey && safeStorage.isEncryptionAvailable()) {
    saveConfig(cfg);
  }
}

function buildClient() {
  const cfg = loadConfig();
  cachedUserId = null;
  client = cfg.apiKey ? new BacklogClient(cfg) : null;
  return cfg;
}

async function getUserId() {
  if (cachedUserId) return cachedUserId;
  const me = await client.myself();
  cachedUserId = me.id;
  return cachedUserId;
}

// --- notification state (persisted so restarts don't re-notify) ------------
const statePath = () => path.join(app.getPath('userData'), 'notify-state.json');
function loadState() {
  try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch { return {}; }
}
function saveState(s) {
  try { fs.writeFileSync(statePath(), JSON.stringify(s)); } catch {}
}

function issueKeyOfNotification(n) {
  if (n.project && n.issue && n.issue.keyId != null) return `${n.project.projectKey}-${n.issue.keyId}`;
  return null;
}
function reasonText(reason) {
  return ({
    1: 'assigned you to', 2: 'commented on', 3: 'updated', 4: 'added a file to',
    5: 'added you to', 9: 'assigned you to PR', 10: 'commented on PR',
    11: 'updated PR', 17: 'updated PR status',
  })[reason] || 'notified you about';
}

function showNativeNotification(n) {
  if (!Notification.isSupported()) return;
  const key = issueKeyOfNotification(n);
  const sender = n.sender ? n.sender.name : 'Backlog';
  const title = `${sender} ${reasonText(n.reason)}`;
  const body = key
    ? `${key}  ${(n.issue && n.issue.summary) || ''}`.trim()
    : (n.project ? n.project.name : 'Backlog');
  const notif = new Notification({ title, body });
  notif.on('click', () => {
    showWindow();
    if (!win || win.isDestroyed()) return;
    if (key) win.webContents.send('open-issue', key);
    else win.webContents.send('open-notifications');
  });
  notif.show();
}

function updateUnread(count) {
  if (tray && !tray.isDestroyed()) tray.setTitle(count > 0 ? ` ${count}` : '');
  if (win && !win.isDestroyed()) win.webContents.send('notifications:updated', count);
}

async function pollNotifications() {
  if (!client) return;
  try {
    const list = await client.notifications({ count: 50 });
    const maxId = list.reduce((m, n) => Math.max(m, n.id), 0);
    if (lastNotificationId === 0) {
      lastNotificationId = maxId; // first run: establish a baseline without notifying
      saveState({ lastNotificationId });
    } else if (maxId > lastNotificationId) {
      const fresh = list.filter((n) => n.id > lastNotificationId && !n.alreadyRead).reverse();
      for (const n of fresh) showNativeNotification(n);
      lastNotificationId = maxId;
      saveState({ lastNotificationId });
    }
    const res = await client.unreadNotificationCount().catch(() => ({ count: 0 }));
    updateUnread(res.count || 0);
  } catch { /* transient network/API error — try again next tick */ }
}

function startPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (!client) { updateUnread(0); return; }
  pollNotifications();
  pollTimer = setInterval(pollNotifications, POLL_INTERVAL_MS);
}

// Requests need a live client; surface a clear error to the renderer otherwise.
function requireClient() {
  if (!client) {
    const e = new Error('NOT_CONFIGURED');
    e.code = 'NOT_CONFIGURED';
    throw e;
  }
  return client;
}

function createWindow() {
  win = new BrowserWindow({
    width: 420,
    height: 620,
    show: false,
    resizable: true,
    fullscreenable: false,
    alwaysOnTop: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Make the popover appear on the CURRENT Space, including over full-screen apps.
  // Without this an accessory-app window opens on the app's home Space and is
  // invisible when the user is on another Space / a full-screen window.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, 'floating');

  // Surface load/preload failures to stderr (visible when run from a terminal).
  win.webContents.on('did-fail-load', (_e, code, desc) => console.error('did-fail-load', code, desc));
  win.webContents.on('preload-error', (_e, p, error) => console.error('preload-error', p, error));

  // Closing (red traffic-light button) should hide the popover, not destroy the
  // window — otherwise `win` becomes a dangling, destroyed reference and the next
  // tray click throws "Object has been destroyed". Real quit sets app.isQuitting.
  win.on('close', (e) => {
    if (!app.isQuitting) { e.preventDefault(); win.hide(); }
  });

  // Hide instead of quit when it loses focus, so it behaves like a popover.
  // Ignore the blur that can fire immediately after show() on an accessory app,
  // otherwise the window disappears the instant it opens.
  win.on('blur', () => {
    if (win.webContents.isDevToolsOpened()) return;
    if (Date.now() - lastShownAt < 500) return;
    win.hide();
  });
}

function showWindow() {
  if (!win || win.isDestroyed()) return;
  positionWindowNearTray();
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.show();
  win.moveTop();
  // Accessory (dock-hidden) apps don't steal focus on show() by default.
  if (process.platform === 'darwin') app.focus({ steal: true });
  win.focus();
  lastShownAt = Date.now();
  win.webContents.send('window:shown');
}

function positionWindowNearTray() {
  if (!tray || !win) return;
  const trayBounds = tray.getBounds();
  const winBounds = win.getBounds();
  // Clamp the popup fully inside the work area of the display holding the tray,
  // so it can never land off-screen (multi-monitor, notch, etc.).
  const display = screen.getDisplayNearestPoint({
    x: Math.round(trayBounds.x + trayBounds.width / 2),
    y: Math.round(trayBounds.y + trayBounds.height / 2),
  });
  const wa = display.workArea;
  // tray.getBounds() is unreliable on macOS (can report bogus coords at startup),
  // so anchor to just below the menu bar. Use the tray's x only when it looks
  // sane (right half of the screen, where status items live); else pin top-right.
  const trayLooksValid = trayBounds.width > 0 && trayBounds.x > wa.x + wa.width / 2 && trayBounds.y < wa.y + wa.height / 2;
  let x = trayLooksValid
    ? Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2)
    : wa.x + wa.width - winBounds.width - 8;
  let y = wa.y + 4; // menu bar is at the top on macOS
  x = Math.min(Math.max(x, wa.x + 8), wa.x + wa.width - winBounds.width - 8);
  y = Math.min(Math.max(y, wa.y + 4), wa.y + wa.height - winBounds.height - 8);
  win.setPosition(x, y, false);
}

function toggleWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) { win.hide(); return; }
  showWindow();
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Backlog Dashboard');
  tray.on('click', toggleWindow);
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Open', click: toggleWindow },
      { label: 'Refresh', click: () => win && !win.isDestroyed() && win.webContents.send('tasks:refresh') },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
    ]);
    tray.popUpContextMenu(menu);
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide(); // menu-bar-only app
  lastNotificationId = loadState().lastNotificationId || 0;
  const cfg = buildClient();
  migrateConfigIfNeeded(cfg); // encrypt any pre-existing plaintext key at rest
  createWindow();
  createTray();
  startPolling();
  // First run (no API key): pop the window open so setup is discoverable.
  if (!cfg.apiKey) win.once('ready-to-show', () => showWindow());
});

app.on('window-all-closed', (e) => { /* keep running in tray */ });

// ---- IPC: config -----------------------------------------------------------
ipcMain.handle('config:get', () => {
  const cfg = loadConfig();
  return { spaceDomain: cfg.spaceDomain, hasApiKey: !!cfg.apiKey };
});

ipcMain.handle('config:set', async (_e, { spaceDomain, apiKey }) => {
  const cfg = loadConfig();
  cfg.spaceDomain = spaceDomain || cfg.spaceDomain;
  if (typeof apiKey === 'string' && apiKey.length) cfg.apiKey = apiKey;
  saveConfig(cfg);
  buildClient();
  // Validate immediately so the UI can show a helpful error.
  await getUserId();
  startPolling(); // (re)start notification polling for the new credentials
  return { ok: true };
});

// ---- IPC: tasks ------------------------------------------------------------
ipcMain.handle('tasks:mine', async () => {
  requireClient();
  const uid = await getUserId();
  return client.myOpenIssues(uid);
});

ipcMain.handle('issue:detail', async (_e, issueKey) => {
  requireClient();
  const [issue, comments] = await Promise.all([
    client.issue(issueKey),
    client.comments(issueKey),
  ]);
  const statuses = await client.projectStatuses(issue.projectId).catch(() => []);
  return { issue, comments, statuses };
});

ipcMain.handle('issue:comment', async (_e, { issueKey, content }) => {
  requireClient();
  return client.addComment(issueKey, content);
});

ipcMain.handle('issue:status', async (_e, { issueKey, statusId, comment }) => {
  requireClient();
  return client.updateStatus(issueKey, statusId, comment);
});

// ---- IPC: quick add --------------------------------------------------------
ipcMain.handle('form:options', async () => {
  requireClient();
  const [projects, priorities] = await Promise.all([client.projects(), client.priorities()]);
  return { projects, priorities };
});

ipcMain.handle('form:issueTypes', async (_e, projectId) => {
  requireClient();
  return client.issueTypes(projectId);
});

ipcMain.handle('issue:create', async (_e, payload) => {
  requireClient();
  return client.createIssue(payload);
});

// ---- IPC: notifications ----------------------------------------------------
ipcMain.handle('notifications:list', async () => {
  requireClient();
  return client.notifications({ count: 100 });
});

ipcMain.handle('notifications:markRead', async (_e, id) => {
  requireClient();
  const r = await client.markNotificationRead(id);
  pollNotifications(); // refresh unread badge
  return r;
});

ipcMain.handle('notifications:markAllRead', async () => {
  requireClient();
  const r = await client.markAllNotificationsRead();
  updateUnread(0);
  return r;
});

ipcMain.handle('notifications:unread', async () => {
  requireClient();
  const res = await client.unreadNotificationCount().catch(() => ({ count: 0 }));
  return res.count || 0;
});

// ---- IPC: misc -------------------------------------------------------------
// Only ever open http(s) links externally — never file:, javascript:, etc.
ipcMain.handle('open:external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) return shell.openExternal(url);
  return undefined;
});
ipcMain.handle('space:domain', () => loadConfig().spaceDomain);
