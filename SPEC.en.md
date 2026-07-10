# Backlog Dashboard — Specification

- Version: 0.2.2
- Last updated: 2026-07-11
- Target platform: macOS (Apple Silicon / arm64)

---

## 1. Overview

A **macOS menu-bar resident app** for working with your own Backlog tasks. Clicking the "b" icon in the menu bar opens a popover where you can review and update open tasks, create new tasks, and receive/review Backlog notifications.

- Single-user, personal-use app. Each user connects with their own Backlog API key.
- Calls the **Backlog REST API v2** directly (no MCP, no intermediary server).
- Built with Electron. The UI is plain HTML/CSS/JS with no framework.

---

## 2. Requirements

| Item | Detail |
|------|--------|
| OS | macOS (Apple Silicon build) |
| Runtime | Electron 32 (bundled in the `.app`, no separate install) |
| Network | HTTPS to `https://<space>.backlog.jp` (or `.com`) |
| Credentials | Personal Backlog API key (entered by the user in Settings) |

Build-time requirements: Node.js (v18+ for global `fetch`), macOS `iconutil` and `hdiutil`.

---

## 3. Screens

Common header: `‹ Back` / title / `🔔 Notifications (unread badge)` / `+ New` / `⟳ Refresh` / `⚙ Settings`.
The window **hides** (is not destroyed) on losing focus or on pressing the close button.

### 3.1 Task list (Tasks)
- Shows issues assigned to you that are open (`statusId` 1–3).
- **Sort**: due date (default; no-due sorts last) / project / task name (Japanese-aware).
- **Filter**: project (dropdown derived from the issue-key prefix) + incremental task-name substring match (summary and issue key).
- Each card: issue-type color, issue key, summary, status, priority, due badge (overdue = red / soon = orange).
- Shows "visible / total" count at the bottom right. Click a card to open detail.

### 3.2 Issue detail (Issue)
- Issue key, "Open in Backlog ↗" (launches browser), summary, meta (type / priority / due).
- **Status change**: pick from the project's status list and update.
- **Description** display.
- **Comment list** (author, timestamp, body, change log).
- **Comment form**. After posting or a status change, the detail is refetched and re-rendered.

### 3.3 New Task
- Inputs: project (required) → issue type (required; fetched after project selection) / summary (required) / priority (default: Normal) / due date / description.
- On success, shows a toast and returns to the list.

### 3.4 Notifications
- Lists Backlog notifications (latest 100) newest-first. Unread items are highlighted in green.
- Each row: sender, reason (comment / assignment / update / PR, etc.), target issue (`ProjectKey-keyId`), timestamp.
- Row click: navigate to the target issue's detail and mark that notification read. Notifications without an issue (e.g. PRs) open Backlog in the browser.
- "Mark all read" clears all unread.

### 3.5 Settings
- Enter the space domain (e.g. `yourspace.backlog.com`) and API key, then "Save & connect".
- On save, `/users/myself` is called to verify connectivity. Failures are shown via a toast.
- "Open API key settings ↗" opens the API key issuance page.

---

## 4. Desktop notifications

- The main process polls the Backlog notifications API every **60 seconds** (`POLL_INTERVAL_MS`).
- **New-item detection**: notifications with an ID greater than the stored `lastNotificationId` and still unread are treated as new and shown as native macOS notifications.
- **On first launch**, only the current max ID is stored as a baseline — no notifications are fired (prevents startup spam).
- Notification title = "sender + reason", body = "issue key + summary". Clicking brings the app to the front and opens the related issue.
- The **unread count** from `/notifications/count?alreadyRead=false` is reflected in the menu-bar icon title and the header bell badge.
- `lastNotificationId` is persisted to `notify-state.json` (prevents re-notifying after a restart).

---

## 5. Architecture

```
┌─────────────────────────── Main process (main.js) ───────────────────────────┐
│  Tray / BrowserWindow / single-instance control / config & state persistence   │
│  Notification polling (setInterval) → show Notification / update unread count   │
│  ipcMain.handle(...) ── delegates each operation to BacklogClient               │
│                    │                                                             │
│              backlog.js (BacklogClient: REST API v2 client)                     │
└────────────────────┼─────────────────────────────────────────────────────────┘
                     │ safe API via contextBridge (preload.js)
┌────────────────────┼─────────────────────────────────────────────────────────┐
│  Renderer (renderer/app.js): uses only window.api (no Node/Electron access)     │
│  Views: list / detail / add / notifications / settings (simple nav stack)       │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Security**: `contextIsolation: true` / `nodeIntegration: false`. The API key is held only by the main process and never passed to the renderer. CSP forbids external resources (only https/data images allowed).
- **Window behavior**: dock-hidden accessory app (`LSUIElement`). The popover is anchored just below the menu bar, toward the right (with a fallback when tray coordinates are invalid). `setVisibleOnAllWorkspaces` + `alwaysOnTop` make it appear over the current Space / full-screen apps. It hides on close / focus loss. The app truly quits only from the tray's right-click Quit.

### File layout
| File | Role |
|------|------|
| `main.js` | Main process (tray, window, IPC, config, notification polling) |
| `preload.js` | Exposes a safe API to the renderer via contextBridge |
| `backlog.js` | Backlog REST API v2 client |
| `renderer/index.html` `styles.css` `app.js` | UI (views, state, rendering) |
| `pnglib.js` | Dependency-free PNG encoder |
| `make-backlog-icon.js` | Generates tray/app icons (`.icns`) from the Backlog "b" |
| `scripts/make-dmg.js` | Builds the `.dmg` via `hdiutil` |
| `build/extend-info.plist` | Info.plist additions (`LSUIElement`, etc.) |
| `assets/` | Icons (`backlog-source.png` is the source image; the rest are generated) |

---

## 6. Data & persistence

- Config: `~/Library/Application Support/backlog-dashboard/config.json` (`{ spaceDomain, apiKeyEnc }`, permission 600).
- **The API key is encrypted at rest via the macOS Keychain** (Electron `safeStorage`). Only the ciphertext (`apiKeyEnc`) is written to disk; it is decrypted only in memory. Legacy plaintext `apiKey` from older versions is auto-migrated to encrypted on launch.
- Notification state: `notify-state.json` in the same directory (`{ lastNotificationId }`).
- The only outbound traffic is to the Backlog API. The API key is never sent to any external service. `open:external` opens only `http(s)` URLs.

---

## 7. Backlog REST API v2 usage

- Base URL: `https://<spaceDomain>/api/v2`. Auth via the `apiKey` query parameter.
- Writes use `application/x-www-form-urlencoded` (arrays as `key[]`).

| Purpose | Method / path |
|---------|---------------|
| Own user | `GET /users/myself` |
| Open tasks | `GET /issues?assigneeId[]=<me>&statusId[]=1..3&sort=dueDate&order=asc&count=100` |
| Get issue | `GET /issues/:key` |
| Comments | `GET /issues/:key/comments` |
| Post comment | `POST /issues/:key/comments` |
| Change status | `PATCH /issues/:key` (`statusId`, `comment`) |
| Projects | `GET /projects?archived=false` |
| Statuses | `GET /projects/:id/statuses` |
| Issue types | `GET /projects/:id/issueTypes` |
| Priorities | `GET /priorities` |
| Create issue | `POST /issues` |
| Notifications | `GET /notifications?count=100&order=desc` |
| Unread count | `GET /notifications/count?alreadyRead=false` |
| Mark read | `POST /notifications/:id/markAsRead` |
| Mark all read | `POST /notifications/markAsRead` |

### IPC channels
`config:get` / `config:set` / `tasks:mine` / `issue:detail` / `issue:comment` / `issue:status` / `form:options` / `form:issueTypes` / `issue:create` / `notifications:list` / `notifications:markRead` / `notifications:markAllRead` / `notifications:unread` / `open:external` / `space:domain`.
Main → renderer events: `window:shown` / `tasks:refresh` / `notifications:updated` / `open-issue` / `open-notifications`.

---

## 8. Build & distribution

| Command | Description |
|---------|-------------|
| `npm start` | Dev launch (`electron .`) |
| `npm run icons` | Regenerate tray + app icons via `make-backlog-icon.js` |
| `npm run package` | Build the `.app` (arm64, `LSUIElement`) via `@electron/packager` |
| `npm run dist` | The above + a `.dmg` (with an Applications shortcut for drag-install) |

- The version in `package.json` is the single source of truth (reflected in the `.dmg` name and bundle version).
- Signing is **ad-hoc only** (no Developer ID signing or notarization). On first launch on another Mac, remove the quarantine attribute:
  `xattr -dr com.apple.quarantine /Applications/BacklogDashboard.app`

---

## 9. Known limitations / not supported

- **Apple Silicon only** (no Intel Mac; universal build not supported).
- **Unsigned**, so distribution needs a Gatekeeper workaround.
- Open tasks cover only `statusId` 1–3 (project-specific custom "closed-like" statuses are out of scope).
- Both tasks and notifications are capped at 100 items (no pagination).
- Notifications without an issue (PRs, etc.) open Backlog in the browser rather than an in-app detail.
- Auto-start (login item) is configured manually. Slack integration is not implemented.

---

## 10. Future candidates

- Slack integration (pull in your mentions / unreads)
- Universal build (Intel support)
- Developer ID signing + notarization (smoother distribution)
- Auto-registration as a login item
- Pagination / full-status support
