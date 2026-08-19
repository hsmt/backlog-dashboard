# Changelog

All notable changes to Backlog Dashboard are documented here. / このプロジェクトの変更履歴です。

Format based on [Keep a Changelog](https://keepachangelog.com/). Dates are JST.

---

## [0.9.0] - 2026-07-31

### Added / 追加
- **EN:** **Self-update.** The app now checks GitHub for a newer release on launch and every 6 hours, announces it once via a native notification, and keeps an `Update to vX.Y.Z…` item in the tray menu. Confirming it downloads the DMG, **verifies its SHA-256 against the digest published by the GitHub API** (a release without a digest is refused rather than installed unverified), checks the mounted bundle's version, then replaces the installed app and relaunches. The swap **backs up the existing bundle and restores it if the copy fails**, so a partial failure can't leave you without an app. Installing always waits for explicit confirmation, since it quits and restarts the app. Self-update is skipped entirely when running from source (`npm start`).
- **JA:** **自動アップデート**を追加しました。起動時と 6 時間ごとに GitHub の最新リリースを確認し、macOS 通知で 1 度だけ知らせ、トレイメニューに `Update to vX.Y.Z…` を常設します。承諾すると DMG をダウンロードし、**GitHub API が公開する digest と SHA-256 を照合**（digest の無いリリースは未検証でインストールせず拒否）、マウントしたバンドルのバージョンも確認したうえで、インストール済みアプリを置き換えて再起動します。置き換えは**元のバンドルをバックアップし、コピーに失敗したら復元**するため、中途半端な失敗でアプリが消えることはありません。終了・再起動を伴うため、適用は常に明示的な確認後です。ソースから実行（`npm start`）している場合は自動更新を行いません。

### Notes / 補足
- **EN:** Electron's built-in `autoUpdater` (Squirrel.Mac) can't be used while the app is ad-hoc signed: the signature's designated requirement is pinned to that build's cdhash, so every update would fail Squirrel's validation. Adopting Developer ID signing would make the requirement build-stable and let the standard updater replace this in-house swap.
- **JA:** ad-hoc 署名のままでは Electron 標準の `autoUpdater`（Squirrel.Mac）は利用できません。署名の指定要件がそのビルド固有の cdhash に固定されるため、更新は必ず Squirrel の検証に失敗します。Developer ID 署名を導入すれば要件がビルドをまたいで安定し、標準の自動更新でこの自前実装を置き換えられます。

---

## [0.8.0] - 2026-07-30

### Changed / 変更
- **EN:** The header's 🔔 bell (with a small overlay badge) is replaced by a **red circle showing the unread count itself**. 18px circle, exact number for 1–9 and `9+` past 10 so it stays round; digits use `tabular-nums` so the width doesn't jitter. At zero it stays in place as a **grey "0"** rather than hiding — this button is the only way into the notifications list. Tooltip reads `Notifications (N unread)`. Added dedicated `--unread` / `--zero` fill tokens: both clear 4.5:1 against their white label, and they're kept separate from `--danger` (a *text* color elsewhere, which would lose dark-mode contrast if darkened to match).
- **JA:** ヘッダーの 🔔 ベル（＋小さなオーバーレイバッジ）を、**未読件数そのものを表示する赤い丸**に置き換えました。18px の円で、1〜9 は実数・10 件以上は `9+` として円形を保ち、数字は `tabular-nums` で桁が揺れません。0 件のときは非表示にせず**グレーの「0」**として同じ位置に残します（このボタンが通知一覧への唯一の入り口のため）。ツールチップは `Notifications (N unread)`。塗り円専用の `--unread` / `--zero` トークンを追加し、いずれも白文字に対し 4.5:1 以上を確保しています（テキスト色として使う `--danger` とは分離。`--danger` を暗くするとダークモードの文字用途が劣化するため）。

---

## [0.7.1] - 2026-07-29

### Changed / 変更
- **EN:** Clicking a macOS native notification now **opens the item on Backlog's web page in the browser** (`https://<space>/view/<issue-key>`, same target as the in-app "Open in Backlog ↗" link) instead of opening the app's own popover. Notifications without an issue (e.g. PRs) open the space's home page, matching how the in-app notifications list already handles that case. Removed the now-unused `open-issue` / `open-notifications` IPC events.
- **JA:** macOS のネイティブ通知をクリックしたときの挙動を変更し、アプリのポップオーバーを開く代わりに**該当課題を Backlog のブラウザページで開く**（`https://<space>/view/<課題キー>`、アプリ内の「Open in Backlog ↗」と同じ遷移先）ようにしました。課題を伴わない通知（PR 等）はスペースのトップページを開き、アプリ内通知一覧の既存の挙動と揃えています。不要になった IPC イベント `open-issue` / `open-notifications` は削除しました。

---

## [0.7.0] - 2026-07-28

### Changed / 変更
- **EN:** Reworked the visual design to look more like Backlog itself. The accent color is now `#4cba95`, sampled directly from the official Backlog "b" mark bundled in the app (`assets/backlog-source.png`), replacing the previous approximate green. Status badges (in the task list and issue detail) now use **Backlog's own per-status color** (e.g. Open = salmon, In Progress = blue, Resolved = teal), returned by the API, instead of a single flat green for every status — with automatic black/white text selection for readability against each background.
- **JA:** 見た目を Backlog 本家により近づけるようデザインを刷新しました。アクセントカラーをアプリ同梱の Backlog 公式「b」ロゴ画像（`assets/backlog-source.png`）から実測した `#4cba95` に変更（従来の近似的な緑から置き換え）。タスク一覧・課題詳細のステータスバッジは、API が返す **Backlog 本家のステータスごとの色**（例: Open=サーモン、In Progress=青、Resolved=ティール）をそのまま反映するようにし、全ステータス一律の緑バッジをやめました。背景色に応じて文字色（黒/白）を自動選択し、可読性を確保しています。

---

## [0.6.1] - 2026-07-27

### Fixed / 修正
- **EN:** macOS native notifications (Notification Center) weren't reliably reaching users because the packaged `.app` kept Electron's own generic ad-hoc signature identifier (`Electron`) instead of this app's bundle id — macOS couldn't stably associate per-app permissions like notifications with it. `npm run package` now explicitly ad-hoc-signs the built app with `--identifier com.masanorihashimoto.backlogdashboard` after packaging, so macOS can consistently identify it across rebuilds. The notification-sending code itself (`showNativeNotification` in `main.js`, using Electron's `Notification` API) was already correct and unchanged.
- **JA:** macOS のネイティブ通知（通知センター）が安定して届かない不具合を修正しました。原因は、パッケージ済み `.app` の署名識別子が独自のバンドルIDではなく、Electron 本体標準の汎用 ad-hoc 識別子（`Electron`）のままだったこと — これにより macOS が通知許可などアプリ単位の権限を安定して紐づけられていませんでした。`npm run package` がパッケージング後に `--identifier com.masanorihashimoto.backlogdashboard` で明示的に ad-hoc 署名するようにし、再ビルドをまたいでも macOS が一貫してアプリを識別できるようにしました。通知送信自体のコード（`main.js` の `showNativeNotification`、Electron `Notification` API 使用）はもともと正しく、変更していません。

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
