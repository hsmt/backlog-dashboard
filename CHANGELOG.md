# Changelog

All notable changes to Backlog Dashboard are documented here. / このプロジェクトの変更履歴です。

Format based on [Keep a Changelog](https://keepachangelog.com/). Dates are JST.

---

## [0.6.0] - 2026-07-26

### Added / 追加
- **EN:** The New Task form now has an **Assignee** field. After picking a project, its members are fetched (sorted by name) with "Unassigned" as the default. A **"Myself" button** sets the assignee to you in one click (if you're not a member of that project, it shows a toast and leaves the selection unchanged instead of failing silently).
- **JA:** 新規タスクフォームに **担当者** 欄を追加しました。プロジェクトを選ぶと参加ユーザー（名前順）を取得し、既定は「Unassigned」です。**「Myself」ボタン**でワンクリックで自分を担当者に設定できます（自分がそのプロジェクトの参加者でない場合はトーストで案内し、選択は変更しません）。

---

## [0.5.0] - 2026-07-25

### Added / 追加
- **EN:** **@mention notifications in comments.** Typing `@` in the comment box (or the `@` button) opens a project-member picker; picking a user inserts `@Name` into the text and adds them to a notify set shown as removable chips. On post, the ids are sent as `notifiedUserId[]` so Backlog sends its お知らせ notification to those users. The chips are the source of truth for who gets notified, so editing the text never changes it. (Project members are fetched via `GET /projects/:id/users`; the `@Name` in the body is plain readable text, not a clickable Backlog mention link.)
- **JA:** **コメントの＠メンション通知（お知らせ）**。コメント欄で `@`（または `@` ボタン）を入力するとプロジェクト参加ユーザーの候補が表示され、選ぶと本文に `@名前` を挿入し、通知対象（削除可能なチップ表示）に追加します。投稿時に `notifiedUserId[]` として送信し、指定ユーザーへ Backlog のお知らせが届きます。通知対象はチップが唯一の情報源で、本文を編集しても変わりません。（候補は `GET /projects/:id/users` で取得。本文中の `@名前` は可読性用のプレーンテキストで、クリック可能な Backlog メンションリンクにはなりません。）

---

## [0.4.1] - 2026-07-24

### Fixed / 修正
- **EN:** Going back from an issue opened via a notification now returns to the **notifications list** instead of the task list. The back-navigation dispatch was missing the `notifications` view and fell through to the task list.
- **JA:** 通知から開いた課題詳細で「戻る」を押したとき、タスク一覧ではなく**お知らせ一覧**に戻るよう修正しました。戻る処理の振り分けに `notifications` が無く、タスク一覧にフォールバックしていました。

### Changed / 変更
- **EN:** The notifications list no longer reloads with a spinner every time it opens. It now paints instantly from a session cache and revalidates quietly in the background (stale-while-revalidate): reopening the list or returning from an issue detail is immediate and preserves scroll position, unchanged data skips the repaint, and the cache is warmed at startup and on new activity while the list is closed. "Mark all read" now reflects locally instead of refetching.
- **JA:** 通知一覧を開くたびにスピナー付きで再ロードしていた挙動を変更。直近取得結果のセッションキャッシュから即描画し、裏で静かに最新化する Stale-While-Revalidate 方式にしました。一覧の再オープンや課題詳細からの復帰が即座になり（スクロール位置も維持）、内容に変化が無ければ再描画をスキップします。キャッシュは起動時と、一覧非表示中の新着検知時に裏で温めます。「Mark all read」も再取得せずローカルに反映するようにしました。

---

## [0.4.0] - 2026-07-23

### Added / 追加
- **EN:** Each notification now has a per-row **"Mark read" button** (shown only while unread). It marks just that notification read, updates the row in place, and decrements the unread badge — without triggering the row's navigation to the issue.
- **JA:** 通知一覧の各行に **「Mark read」ボタン**（未読時のみ表示）を追加。その通知だけを既読化し、行をその場で既読表示にして未読バッジを減らします（行クリックの課題遷移は発火しません）。
- **EN:** **Background refresh** — while the notifications list is open, newly detected activity refreshes the list automatically (no spinner, no manual refresh). The main-process poller signals the renderer via a new `notifications:new` event.
- **JA:** **背景更新** — 通知一覧を開いている間に新着を検知すると、スピナーを出さずに一覧を自動更新します（手動更新不要）。メインプロセスのポーラーが新設の `notifications:new` イベントでレンダラーに通知します。

### Fixed / 修正
- **EN:** The unread badge (menu-bar count and header bell) now **decrements immediately when a notification is marked read.** Backlog's unread-count endpoint can lag right after `markAsRead`, so the count is now updated optimistically on the main side and reconciled by the next scheduled poll.
- **JA:** 通知を既読にしたときに、**未読バッジ（メニューバーの数字・ヘッダーのベル）が即座に減る**ようにしました。Backlog の未読数 API は `markAsRead` 直後に反映が遅れるため、メイン側で楽観的に更新し、次回の定期ポーリングで正確な値へ整合させます。

---

## [0.3.0] - 2026-07-23

### Added / 追加
- **EN:** The quick-add form's **project picker is now ordered "recently used first."** Projects you've created issues in from the form are remembered most-recent-first (up to 5) and shown at the top under a `Recent` group, with the rest under `All projects` in Backlog's original order. History is stored in the renderer's `localStorage` (`recentProjectIds`); entries for projects that no longer exist (e.g. archived) are ignored.
- **JA:** クイック追加フォームの**プロジェクト選択を「最近使った順」に対応**。本フォームから起票したプロジェクトを最新順（最大 5 件）で記録し、`Recent` グループの先頭に、残りは `All projects` グループに Backlog の返却順で表示します。履歴はレンダラーの `localStorage`（`recentProjectIds`）に保存し、現存しないプロジェクト（アーカイブ済み等）の履歴は無視します。

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
