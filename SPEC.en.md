# Backlog Dashboard — Specification

- Version: 0.8.0
- Last updated: 2026-07-30
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

Common header: `‹ Back` / title / **unread-count badge** (opens notifications) / `+ New` / `⟳ Refresh` / `⚙ Settings`.
The window **hides** (is not destroyed) on losing focus or on pressing the close button.

### 3.1 Task list (Tasks)
- Shows issues assigned to you that are open (`statusId` 1–3).
- **Sort**: due date (default; no-due sorts last) / project / task name (Japanese-aware).
- **Filter**: project (dropdown derived from the issue-key prefix) + incremental task-name substring match (summary and issue key).
- Each card: issue-type color, issue key, summary, status badge (**colored per Backlog's own status color**), priority, due badge (overdue = red / soon = orange).
- Shows "visible / total" count at the bottom right. Click a card to open detail.

### 3.2 Issue detail (Issue)
- Issue key, **status badge** (colored per Backlog's own status color), "Open in Backlog ↗" (launches browser), summary, meta (type / priority / due).
- **Status change**: pick from the project's status list and update.
- **Description** display.
- **Comment list** (author, timestamp, body, change log).
- **Comment form**. After posting or a status change, the detail is refetched and re-rendered.
- **@mention notifications (お知らせ)**: typing `@` in the comment body (or the `@` button) shows project members; picking one inserts `@Name` into the text and adds the user to the notify set. The notify set is shown as removable **chips** below the box and is the single source of truth (editing the text never changes it). On post, `notifiedUserId[]` is sent so Backlog notifies those users. The `@Name` in the body is plain readable text (not a clickable Backlog mention link).

### 3.3 New Task
- Inputs: project (required) → issue type (required; fetched after project selection) / summary (required) / assignee / priority (default: Normal) / due date / description.
- **Assignee**: after picking a project, fetches its members (sorted by name); defaults to "Unassigned". A **"Myself" button** sets the assignee to you (if you're not a member of that project, it shows a toast and leaves the selection unchanged).
- **Project picker is ordered "recently used first"**: projects you've created issues in from this form are remembered most-recent-first (up to 5) and surfaced at the top under a `Recent` group, with the rest under `All projects` in Backlog's original order (a flat list when there's no history). History entries for projects that no longer exist (e.g. archived) are ignored automatically.
- On success, shows a toast and returns to the list.

### 3.4 Notifications
- Lists Backlog notifications (latest 100) newest-first. Unread items are highlighted in green.
- Each row: sender, reason (comment / assignment / update / PR, etc.), target issue (`ProjectKey-keyId`), timestamp.
- Row click: navigate to the target issue's detail and mark that notification read. Notifications without an issue (e.g. PRs) open Backlog in the browser.
- A per-row **"Mark read" button** (shown only while unread) marks just that notification read. It updates the row in place and decrements the unread badge by one, without triggering the row's navigation.
- "Mark all read" clears all unread.
- **Background refresh**: while the notifications list is open, newly detected activity refreshes the list automatically (no spinner, no manual refresh needed).
- **Instant paint (cache)**: reopening the list or returning from a detail view paints instantly from the last fetch (a session cache) and revalidates quietly in the background (stale-while-revalidate). If nothing changed, it skips the repaint and preserves scroll position. The cache is warmed at startup and whenever new activity is detected while the list is closed, so even the first open rarely waits.

### 3.5 Settings
- Enter the space domain (e.g. `yourspace.backlog.com`) and API key, then "Save & connect".
- On save, `/users/myself` is called to verify connectivity. Failures are shown via a toast.
- "Open API key settings ↗" opens the API key issuance page.

---

## 4. Desktop notifications

- The main process polls the Backlog notifications API every **60 seconds** (`POLL_INTERVAL_MS`).
- **New-item detection**: notifications with an ID greater than the stored `lastNotificationId` and still unread are treated as new and shown as native macOS notifications.
- **On first launch**, only the current max ID is stored as a baseline — no notifications are fired (prevents startup spam).
- Notification title = "sender + reason", body = "issue key + summary". **Clicking opens the issue on Backlog's web page** (`https://<space>/view/<issue-key>`) in the browser (notifications without an issue open the space's home page). The app's popover is not opened.
- The **unread count** from `/notifications/count?alreadyRead=false` is reflected in the menu-bar icon title and the header unread-count badge. The main process keeps the latest count (`unreadCount`) as its source of truth.
- **Header unread-count badge** (the only entry point to the notifications list):
  - An **18px circle** showing the count. 1–9 exact, **`9+` for 10 or more** (keeps the circle round). Digits use `tabular-nums` so the width doesn't jitter.
  - **Red while unread** (`--unread` `#c84553`) / **grey "0" at zero** (`--zero`: `#6b7280` light, `#565d6b` dark), and it is **always visible** — hiding it would leave no way to open the notifications list.
  - Both fills are dedicated tokens meeting 4.5:1 against the `#fff` label. They're kept separate from `--danger`, which is used as a *text* color elsewhere and would lose dark-mode contrast if darkened to match.
  - Tooltip reads `Notifications (N unread)` when unread, `Notifications` at zero.
- **Badge update on read is optimistic**: Backlog's unread-count endpoint can return a stale value right after `markAsRead`, so a read action decrements the main-side count by one immediately (updating both badges) and the next scheduled poll reconciles the exact value.
- **Background refresh on new activity**: when new items are detected, the main process sends `notifications:new` to the renderer, which re-renders the notifications list in the background if it's open.
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
- The quick-add form's "recently used projects" history is stored in the renderer's `localStorage` (key `recentProjectIds`, project ids most-recent-first, capped at 5). It's a UI convenience and does not go through the main process.
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
| Post comment | `POST /issues/:key/comments` (`content`, `notifiedUserId[]`) |
| Change status | `PATCH /issues/:key` (`statusId`, `comment`) |
| Projects | `GET /projects?archived=false` |
| Statuses | `GET /projects/:id/statuses` |
| Project members | `GET /projects/:id/users` (@mention candidates; also assignee candidates for New Task) |
| My user id | `GET /users/myself` (cached; powers the "Myself" button) |
| Issue types | `GET /projects/:id/issueTypes` |
| Priorities | `GET /priorities` |
| Create issue | `POST /issues` (`assigneeId` optional) |
| Notifications | `GET /notifications?count=100&order=desc` |
| Unread count | `GET /notifications/count?alreadyRead=false` |
| Mark read | `POST /notifications/:id/markAsRead` |
| Mark all read | `POST /notifications/markAsRead` |

### IPC channels
`config:get` / `config:set` / `me:id` / `tasks:mine` / `issue:detail` / `issue:comment` / `issue:status` / `form:options` / `form:issueTypes` / `form:projectUsers` / `issue:create` / `notifications:list` / `notifications:markRead` / `notifications:markAllRead` / `notifications:unread` / `open:external` / `space:domain`.
Main → renderer events: `window:shown` / `tasks:refresh` / `notifications:updated` / `notifications:new`.

---

## 8. Build & distribution

| Command | Description |
|---------|-------------|
| `npm start` | Dev launch (`electron .`) |
| `npm run icons` | Regenerate tray + app icons via `make-backlog-icon.js` |
| `npm run package` | Build the `.app` (arm64, `LSUIElement`) via `@electron/packager` |
| `npm run dist` | The above + a `.dmg` (with an Applications shortcut for drag-install) |

- The version in `package.json` is the single source of truth (reflected in the `.dmg` name and bundle version).
- Signing is **ad-hoc only** (no Developer ID signing or notarization). After packaging, `npm run package` runs
  `codesign --sign - --identifier com.masanorihashimoto.backlogdashboard` to **explicitly stamp the app's own bundle id**
  onto the signature. Without this, `@electron/packager`'s output keeps Electron's own generic signature identifier
  (`Electron`), which makes macOS unable to reliably distinguish this app for per-app permissions like notifications
  (it can collide with other unsigned Electron apps built locally).
- On first launch on another Mac, remove the quarantine attribute:
  `xattr -dr com.apple.quarantine /Applications/BacklogDashboard.app`

---

## 9. Known limitations / not supported

- **Apple Silicon only** (no Intel Mac; universal build not supported).
- **Unsigned**, so distribution needs a Gatekeeper workaround.
- Open tasks cover only `statusId` 1–3 (project-specific custom "closed-like" statuses are out of scope).
- Both tasks and notifications are capped at 100 items (no pagination).
- Notifications without an issue (PRs, etc.) open Backlog in the browser rather than an in-app detail.
- Auto-start (login item) is configured manually. Slack integration is not implemented.
- **"Mark read" does not guarantee the sender-visible green checkmark from Backlog's お知らせ (notification) feature**: the app's "Mark read" / "Mark all read" call the documented read APIs (`POST /notifications/:id/markAsRead`, `POST /notifications/markAsRead`), but testing against a real account showed no observable change to the target notification's `alreadyRead` or to the unread-count endpoint even 50 seconds after the call. Per [Backlog's お知らせ機能の概要](https://support-ja.backlog.com/hc/ja/articles/360035642454), the sender-side green checkmark is described as tied to viewing via the global bar (Backlog's web UI bell), which the public REST API may not be able to reproduce reliably.

---

## 10. Future candidates

- Slack integration (pull in your mentions / unreads)
- Universal build (Intel support)
- Developer ID signing + notarization (smoother distribution)
- Auto-registration as a login item
- Pagination / full-status support
