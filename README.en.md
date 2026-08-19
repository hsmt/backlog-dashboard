# Backlog Dashboard

*[日本語](README.md) | [English](README.en.md)*

A personal, menu-bar-resident Backlog task dashboard for Mac.

## Documentation

- Spec: [SPEC.ja.md](SPEC.ja.md) (Japanese) / [SPEC.en.md](SPEC.en.md) (English)
- Spec web page (JA/EN toggle, light/dark support): [docs/spec.html](docs/spec.html)
- Changelog: [CHANGELOG.md](CHANGELOG.md)

## Install

1. Download `BacklogDashboard-<version>-arm64.dmg` from the [latest release](https://github.com/hsmt/backlog-dashboard/releases/latest) (macOS / Apple Silicon only)
2. Open the DMG and drag **Backlog Dashboard** into **Applications**
3. **The app is unsigned, so Gatekeeper will warn on first launch.** In `Applications`, **right-click `Backlog Dashboard.app` → Open** (or allow it under System Settings > Privacy & Security)
4. On launch, a Backlog "b" icon appears in the menu bar and the settings screen opens — follow "Setup" below to enter your space domain and API key

Once installed, **the app detects and announces later updates itself** — no need to download again by hand (confirm, and it replaces itself and relaunches).

## Features

- **Open task list** — shows your assigned open issues (click the menu-bar icon to open the popover). Status badges mirror **Backlog's own status colors**
- **Sorting** — by due date / project / task name
- **Filtering** — by project, and by task name (substring, incremental)
- **Issue detail** — selecting a task shows its description and comment history, with inline **comment posting** and **status changes**. Comments can `@`-mention project members to send Backlog **notifications (お知らせ)**
- **Quick-add form** — pick a project and summary from the menu bar's `+` to file a task fast. The project picker is **recently-used-first** (your most recent picks lead a `Recent` group). You can also pick an **assignee**, with a `Myself` button for one-click self-assignment
- **Self-update** — new releases are detected automatically and announced. Confirm, and the app downloads, verifies the checksum, replaces itself and relaunches (it restores the previous version if anything fails, so it can't break your install)
- **Notifications** — receive new activity as native macOS notifications, with the unread count shown in the menu bar. The header carries a **red circle with the unread count** (`9+` past 10, a grey "0" at zero). In the notifications list, each row's `Mark read` clears it individually (the badge drops immediately); an open list **refreshes in the background** when new activity arrives; reopening or returning from detail **paints instantly from cache** (and revalidates quietly)

## Setup

The first launch (whether installed from the DMG or run from source) opens the settings screen:

1. **Space domain**: your Backlog space's domain (e.g. `yourspace.backlog.com` / `yourspace.backlog.jp`)
2. **API key**: issue one from your Backlog personal settings and paste it in
   - Issuance page: `https://<your-space>/EditApiSettings.action`
   - Also reachable via "Open API key settings ↗" on the settings screen
3. Click "Save & connect" to verify the connection and show the task list

The API key is **encrypted at rest via the macOS Keychain** (Electron `safeStorage`) and stored in `~/Library/Application Support/backlog-dashboard/config.json` (permission 600). Only ciphertext is written to disk, and nothing is sent anywhere outside Backlog.

## Running from source (for developers)

You can also run the app directly from the repository instead of using the installer:

```bash
git clone https://github.com/hsmt/backlog-dashboard.git
cd backlog-dashboard
npm install        # fetch Electron (first time only)
npm start          # launch
```

First-run setup is the same as described above.

## Usage

| Action | How |
|---|---|
| Open the list | Click the menu-bar icon |
| Refresh | `⟳` at the top-right of the list, or right-click → Refresh |
| New task | `+` at the top-right |
| Open an issue | Click a card in the list |
| Open in Backlog | "Open in Backlog ↗" on the detail screen |
| Settings | `⚙` at the top-right |
| Quit | Right-click the menu-bar icon → Quit |

The window auto-hides when it loses focus (popover behavior).

## Definition of "open"

Shows assigned issues whose status is **Open / In Progress / Resolved** (`statusId` 1–3). "Closed" is excluded. If you need to handle a project's custom statuses strictly, adjust `myOpenIssues()` in `backlog.js`.

## Structure

```
main.js          Electron main process (tray / window / IPC)
preload.js       API bridge safely exposed to the renderer
backlog.js       Backlog REST API v2 client
renderer/        UI (index.html / styles.css / app.js)
generate-icon.js Generates the menu-bar template icon
```

## Icon generation

```bash
npm run icons   # regenerate the menu-bar template + app icon (.icns)
```

`generate-icon.js` (menu bar) and `make-appicon.js` (the app itself — a white checklist on green) generate PNGs with no dependencies, and `iconutil` builds `assets/icon.icns`.

## Building a distributable package

```bash
npm run package   # produces dist/BacklogDashboard-darwin-arm64/BacklogDashboard.app
npm run dist      # the above, plus dist/BacklogDashboard-<version>-arm64.dmg
```

- `@electron/packager` builds the `.app` (Apple Silicon / arm64), with `LSUIElement` enabled so it runs as a menu-bar-resident app. After packaging, it's ad-hoc-signed with `codesign --sign - --identifier com.masanorihashimoto.backlogdashboard` (see SPEC.en.md §8 for why).
- The `.dmg` is built with macOS's standard `hdiutil`. It includes a shortcut to `Applications`, so it installs via drag-and-drop.
- **Signing is ad-hoc only** (no Developer ID or notarization). See "Install" above for getting past Gatekeeper's first-launch warning.
- To auto-start at login, add the `.app` under System Settings > General > Login Items.
