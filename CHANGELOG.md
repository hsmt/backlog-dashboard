# Changelog

All notable changes to Backlog Dashboard are documented here. / このプロジェクトの変更履歴です。

Format based on [Keep a Changelog](https://keepachangelog.com/). Dates are JST.

---

## [0.2.2] - 2026-07-11

### Security / セキュリティ
- **EN:** The Backlog API key is now **encrypted at rest via the macOS Keychain** (Electron `safeStorage`) instead of being stored in plaintext. Only ciphertext (`apiKeyEnc`) is written to `config.json`; existing plaintext keys are auto-migrated to encrypted on launch.
- **JA:** Backlog API キーを平文保存から、**macOS Keychain による暗号化保存**（Electron `safeStorage`）に変更。`config.json` には暗号文（`apiKeyEnc`）のみを保存し、既存の平文キーは起動時に自動で暗号化へ移行します。
- **EN:** Hardened external-link opening — `open:external` now opens only `http(s)` URLs (blocks `file:`, `javascript:`, etc.).
- **JA:** 外部リンクを開く処理を厳格化 — `open:external` は `http(s)` の URL のみを開くようにしました（`file:` や `javascript:` 等を遮断）。
- **EN:** Removed an unused `innerHTML` code path from the renderer's element helper, so Backlog-sourced text can never inject markup (defense-in-depth against XSS).
- **JA:** レンダラーの要素生成ヘルパーから未使用の `innerHTML` 経路を削除。Backlog 由来のテキストがマークアップを注入できないようにしました（XSS 対策の多層防御）。

---

## [0.2.1] - 2026-07-07

### Fixed / 修正
- **EN:** Fixed a crash (`TypeError: Object has been destroyed`) that occurred when the window's close (red) button was pressed and the app was then reopened from the menu bar. The close button now hides the window instead of destroying it; the app only truly quits from the tray menu's **Quit**. Added destroyed-window guards on the tray, poller, and notification handlers as a safety net.
- **JA:** ウィンドウの閉じる（赤）ボタンを押した後にメニューバーから開き直すとクラッシュする不具合（`TypeError: Object has been destroyed`）を修正。閉じるボタンはウィンドウを破棄せず非表示にするようにし、本当の終了はトレイメニューの **Quit** のみとしました。トレイ・ポーリング・通知処理にも破棄済みチェックを追加（保険）。

---

## [0.2.0] - 2026-07-07

First internal release. / 最初の社内リリース。

### Added / 追加
- **EN:** Menu-bar resident app for macOS (Apple Silicon) that lists your open Backlog tasks. Click the "b" icon to open a popover.
- **JA:** macOS（Apple Silicon）のメニューバー常駐アプリ。自分の未完了 Backlog タスクを一覧表示。「b」アイコンのクリックでポップアップ表示。
- **EN:** Sorting (due date / project / task name) and filtering (by project and incremental task-name search) in the task list.
- **JA:** タスク一覧の並び替え（締切日／プロジェクト／タスク名）と絞り込み（プロジェクト、タスク名のインクリメンタル検索）。
- **EN:** Issue detail view — description and comment history, with inline comment posting and status changes.
- **JA:** 課題詳細画面 — 説明・コメント履歴の表示、その場でのコメント投稿とステータス変更。
- **EN:** Quick-add form to create a new issue (project, type, summary, priority, due date, description).
- **JA:** 新規課題を作成するクイック追加フォーム（プロジェクト・種別・件名・優先度・期限・説明）。
- **EN:** Desktop notifications — polls the Backlog notifications API every 60s, shows native macOS alerts for new items, and displays an unread count next to the menu-bar icon. Clicking an alert opens the related issue.
- **JA:** デスクトップ通知 — Backlog の通知 API を 60 秒ごとにポーリングし、新着を macOS のネイティブ通知で表示。メニューバーアイコン横に未読数を表示。通知クリックで該当課題を開きます。
- **EN:** Notifications view (bell icon with unread badge) listing recent notifications (sender, reason, target issue, time); click a row to open the issue, plus "Mark all read".
- **JA:** 通知一覧画面（未読バッジ付きベルアイコン）。差出人・種別・対象課題・日時を一覧表示し、行クリックで課題へ。「Mark all read」で全既読化。
- **EN:** English UI throughout.
- **JA:** UI を全面英語化。
- **EN:** App icon and menu-bar icon based on the official Backlog "b" mark.
- **JA:** アプリアイコン・メニューバーアイコンを Backlog 公式の「b」マークに。
- **EN:** Distribution packaging: `npm run dist` builds an ad-hoc-signed `.app` (arm64, menu-bar agent) and a drag-to-install `.dmg`.
- **JA:** 配布パッケージ: `npm run dist` で ad-hoc 署名済みの `.app`（arm64・メニューバー常駐）とドラッグインストール用 `.dmg` を生成。

### Notes / 補足
- **EN:** The app is unsigned (ad-hoc only). On first launch on another Mac, run `xattr -dr com.apple.quarantine /Applications/BacklogDashboard.app`. Each user enters their own Backlog API key, stored locally only.
- **JA:** 本アプリは未署名（ad-hoc のみ）です。他の Mac での初回起動時は `xattr -dr com.apple.quarantine /Applications/BacklogDashboard.app` を実行してください。API キーは各自のものを使い、端末内にのみ保存されます。
