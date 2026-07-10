# Backlog Dashboard 仕様書

- バージョン: 0.2.2
- 最終更新: 2026-07-11
- 対象プラットフォーム: macOS（Apple Silicon / arm64）

---

## 1. 概要

Backlog の自分のタスクを扱う **macOS メニューバー常駐アプリ**。メニューバーの「b」アイコンをクリックするとポップアップが開き、未完了タスクの確認・更新、新規タスクの起票、Backlog 通知の受信・確認ができる。

- 個人利用向けの単一ユーザーアプリ。各ユーザーは自分の Backlog API キーで接続する。
- Backlog の **REST API v2** を直接呼び出す（MCP や中間サーバーは介さない）。
- Electron 製。UI はフレームワーク非依存の素の HTML/CSS/JS。

---

## 2. 動作要件

| 項目 | 内容 |
|------|------|
| OS | macOS（Apple Silicon 専用ビルド） |
| ランタイム | Electron 32（`.app` に同梱、別途インストール不要） |
| ネットワーク | `https://<space>.backlog.jp`（または `.com`）への HTTPS 通信 |
| 認証情報 | Backlog 個人 API キー（ユーザーが設定画面で入力） |

開発時の要件: Node.js（fetch 使用のため v18+ 相当）、macOS 標準の `iconutil` / `hdiutil`。

---

## 3. 画面仕様

ヘッダー（全画面共通）: `‹ 戻る` / タイトル / `🔔 通知（未読バッジ）` / `+ 新規` / `⟳ 更新` / `⚙ 設定`。
ウィンドウはフォーカスを外す、または閉じるボタンで**非表示**になる（破棄されない）。

### 3.1 タスク一覧（Tasks）
- 自分が担当かつ未完了（`statusId` 1〜3）の課題を表示。
- **並び替え**: 締切日順（既定・締切なしは末尾）／プロジェクト順／タスク名順（日本語対応）。
- **絞り込み**: プロジェクト（課題キーの接頭辞から抽出したドロップダウン）＋タスク名の部分一致（インクリメンタル、件名・課題キー対象）。
- 各カード: 課題種別カラー・課題キー・件名・ステータス・優先度・締切バッジ（超過=赤／間近=橙）。
- 右下に「表示件数 / 全件」を表示。カードのクリックで詳細へ。

### 3.2 課題詳細（Issue）
- 課題キー、「Backlog で開く ↗」（ブラウザ起動）、件名、メタ情報（種別・優先度・締切）。
- **ステータス変更**: プロジェクトのステータス一覧から選択して更新。
- **説明** の表示。
- **コメント一覧**（差出人・日時・本文・変更ログ）。
- **コメント投稿**フォーム。投稿・ステータス変更後は詳細を再取得して再描画。

### 3.3 新規タスク（New Task）
- 入力: プロジェクト（必須）→ 種別（必須・プロジェクト選択後に取得）／件名（必須）／優先度（既定=中）／期限／説明。
- 作成成功でトーストを表示し、一覧へ戻る。

### 3.4 通知一覧（Notifications）
- Backlog の通知（最新 100 件）を新しい順に表示。未読は緑でハイライト。
- 各行: 差出人・種別（コメント/担当設定/更新/PR 等）・対象課題（`プロジェクトキー-keyId`）・日時。
- 行クリック: 対象課題の詳細へ遷移し、その通知を既読化。課題を伴わない通知（PR 等）は Backlog をブラウザで開く。
- 「Mark all read」で全既読化。

### 3.5 設定（Settings）
- スペースドメイン（例: `yourspace.backlog.com`）と API キーを入力し「Save & connect」。
- 保存時に `/users/myself` を叩いて疎通確認。失敗時はトーストでエラー表示。
- 「Open API key settings ↗」で API キー発行ページを開く。

---

## 4. 通知（デスクトップ通知）仕様

- メインプロセスが **60 秒間隔**（`POLL_INTERVAL_MS`）で Backlog 通知 API をポーリング。
- **新着判定**: 保存済みの `lastNotificationId` より大きい ID かつ未読の通知を新着とみなし、macOS ネイティブ通知を表示。
- **初回起動時**は既存通知の最大 ID を基準値として保存するだけで通知は出さない（起動時スパム防止）。
- 通知タイトル = 「差出人 + 種別」、本文 = 「課題キー + 件名」。クリックでアプリを前面化し該当課題を表示。
- **未読数**を `/notifications/count?alreadyRead=false` から取得し、メニューバーアイコン横のタイトルとヘッダーのベルバッジに反映。
- `lastNotificationId` は `notify-state.json` に永続化（再起動後の再通知を防止）。

---

## 5. アーキテクチャ

```
┌─────────────────────────── Main process (main.js) ───────────────────────────┐
│  Tray / BrowserWindow / 単一インスタンス制御 / 設定・状態の永続化              │
│  通知ポーリング（setInterval）→ Notification 表示 / 未読数更新                 │
│  ipcMain.handle(...) ── 各種操作を BacklogClient に委譲                        │
│                    │                                                          │
│              backlog.js（BacklogClient: REST API v2 クライアント）            │
└────────────────────┼─────────────────────────────────────────────────────────┘
                     │ contextBridge 経由の安全な API（preload.js）
┌────────────────────┼─────────────────────────────────────────────────────────┐
│  Renderer（renderer/app.js）: window.api だけを使用（Node/Electron に非依存） │
│  ビュー: list / detail / add / notifications / settings（簡易スタックで遷移） │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **セキュリティ**: `contextIsolation: true` / `nodeIntegration: false`。API キーはメインプロセスのみが保持し、レンダラーには渡さない。CSP で外部リソースを禁止（画像のみ https/data 許可）。
- **ウィンドウ挙動**: dock 非表示のアクセサリアプリ（`LSUIElement`）。ポップアップはメニューバー直下・右寄りに配置（トレイ座標が不正な場合のフォールバック付き）。`setVisibleOnAllWorkspaces` + `alwaysOnTop` で現在の Space／全画面上に表示。閉じる／フォーカス喪失で非表示。終了はトレイ右クリックの Quit のみ。

### ファイル構成
| ファイル | 役割 |
|----------|------|
| `main.js` | メインプロセス（トレイ・ウィンドウ・IPC・設定・通知ポーリング） |
| `preload.js` | contextBridge によるレンダラー向け API 公開 |
| `backlog.js` | Backlog REST API v2 クライアント |
| `renderer/index.html` `styles.css` `app.js` | UI（ビュー・状態・描画） |
| `pnglib.js` | 依存なし PNG エンコーダ |
| `make-backlog-icon.js` | Backlog「b」からトレイ／アプリアイコン（`.icns`）生成 |
| `scripts/make-dmg.js` | `hdiutil` で `.dmg` 作成 |
| `build/extend-info.plist` | `LSUIElement` 等の Info.plist 追記 |
| `assets/` | アイコン類（`backlog-source.png` が元画像、他は生成物） |

---

## 6. データと永続化

- 設定: `~/Library/Application Support/backlog-dashboard/config.json`（`{ spaceDomain, apiKeyEnc }`、パーミッション 600）。
- **API キーは macOS Keychain で暗号化して保存**（Electron `safeStorage`）。ディスク上には暗号文（`apiKeyEnc`）のみが置かれ、復号はメモリ上でのみ行う。旧バージョンの平文 `apiKey` は起動時に自動で暗号化へ移行する。
- 通知状態: 同ディレクトリの `notify-state.json`（`{ lastNotificationId }`）。
- 外部送信は Backlog API のみ。API キーが外部サービスに送られることはない。`open:external` は `http(s)` の URL のみを開く。

---

## 7. Backlog REST API v2 の利用

- ベース URL: `https://<spaceDomain>/api/v2`。認証は `apiKey` クエリパラメータ。
- 書き込みは `application/x-www-form-urlencoded`（配列は `key[]` 形式）。

| 目的 | メソッド / パス |
|------|-----------------|
| 自分の情報 | `GET /users/myself` |
| 未完了タスク | `GET /issues?assigneeId[]=<me>&statusId[]=1..3&sort=dueDate&order=asc&count=100` |
| 課題取得 | `GET /issues/:key` |
| コメント一覧 | `GET /issues/:key/comments` |
| コメント投稿 | `POST /issues/:key/comments` |
| ステータス変更 | `PATCH /issues/:key`（`statusId`, `comment`） |
| プロジェクト一覧 | `GET /projects?archived=false` |
| ステータス一覧 | `GET /projects/:id/statuses` |
| 種別一覧 | `GET /projects/:id/issueTypes` |
| 優先度一覧 | `GET /priorities` |
| 課題作成 | `POST /issues` |
| 通知一覧 | `GET /notifications?count=100&order=desc` |
| 未読数 | `GET /notifications/count?alreadyRead=false` |
| 通知既読 | `POST /notifications/:id/markAsRead` |
| 全既読 | `POST /notifications/markAsRead` |

### IPC チャンネル
`config:get` / `config:set` / `tasks:mine` / `issue:detail` / `issue:comment` / `issue:status` / `form:options` / `form:issueTypes` / `issue:create` / `notifications:list` / `notifications:markRead` / `notifications:markAllRead` / `notifications:unread` / `open:external` / `space:domain`。
メイン→レンダラーのイベント: `window:shown` / `tasks:refresh` / `notifications:updated` / `open-issue` / `open-notifications`。

---

## 8. ビルドと配布

| コマンド | 内容 |
|----------|------|
| `npm start` | 開発起動（`electron .`） |
| `npm run icons` | `make-backlog-icon.js` でトレイ＋アプリアイコンを再生成 |
| `npm run package` | `@electron/packager` で `.app`（arm64・`LSUIElement`）を生成 |
| `npm run dist` | 上記＋ `.dmg`（Applications ショートカット同梱、ドラッグインストール）を生成 |

- バージョンは `package.json` の `version` が唯一の情報源（`.dmg` 名・バンドル version に反映）。
- 署名は **ad-hoc のみ**（Developer ID 署名・公証なし）。他 Mac での初回起動時は quarantine 属性の削除が必要:
  `xattr -dr com.apple.quarantine /Applications/BacklogDashboard.app`

---

## 9. 既知の制約 / 非対応

- **Apple Silicon 専用**（Intel Mac 非対応。ユニバーサルビルドは未対応）。
- **未署名**のため配布時に Gatekeeper の手当てが必要。
- 未完了タスクは `statusId` 1〜3 のみ対象（プロジェクト独自の完了系カスタムステータスは想定外）。
- タスク・通知とも最大 100 件（ページングなし）。
- PR 等・課題を伴わない通知はアプリ内詳細に遷移せず Backlog をブラウザで開く。
- 自動起動（ログイン項目）は手動設定。Slack 連携は未実装。

---

## 10. 今後の候補

- Slack 連携（自分宛メンション・未読の取り込み）
- ユニバーサルビルド（Intel 対応）
- Developer ID 署名＋公証（配布の摩擦解消）
- ログイン項目への自動登録
- ページング／全ステータス対応の強化
