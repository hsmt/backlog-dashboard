# Backlog Dashboard

Mac のメニューバーに常駐する、個人用の Backlog タスクダッシュボード。

## 機能

- **未完了タスク一覧** — 自分が担当の未完了課題を表示（メニューバーアイコンをクリックでポップアップ）
- **並び替え** — 締切日順 / プロジェクト順 / タスク名順
- **絞り込み** — プロジェクト、およびタスク名（部分一致・インクリメンタル）
- **課題の詳細** — タスクを選ぶと説明・コメント履歴を表示し、その場で **コメント投稿** と **ステータス変更** ができる
- **クイック追加フォーム** — メニューバーの `＋` からプロジェクト・件名を選んでサッと起票

## セットアップ

```bash
cd /Users/masa/Projects/backlog-dashboard
npm install        # Electron を取得（初回のみ）
npm start          # 起動
```

起動するとメニューバーに Backlog の「b」アイコンが出ます。初回は設定画面が開くので:

1. **スペース ドメイン**: 自分の Backlog スペースのドメイン（例: `yourspace.backlog.com` / `yourspace.backlog.jp`）
2. **API キー**: Backlog の個人設定で発行して貼り付け
   - 発行ページ: `https://<自分のスペース>/EditApiSettings.action`
   - 設定画面の「Open API key settings ↗」からも開けます
3. 「Save & connect」を押すと接続確認され、タスク一覧が表示されます

API キーは **macOS Keychain で暗号化**（Electron `safeStorage`）して `~/Library/Application Support/backlog-dashboard/config.json`（パーミッション 600）に保存されます。ディスク上には暗号文のみが置かれ、Backlog 以外の外部には一切送信されません。

## 使い方

| 操作 | 方法 |
|------|------|
| 一覧を開く | メニューバーアイコンをクリック |
| 更新 | 一覧右上の `⟳`、または右クリック → Refresh |
| 新規タスク | 右上の `＋` |
| 課題を開く | 一覧のカードをクリック |
| Backlog で開く | 詳細画面の「Backlogで開く ↗」 |
| 設定 | 右上の `⚙` |
| 終了 | メニューバーアイコンを右クリック → Quit |

ウィンドウはフォーカスを外すと自動的に隠れます（ポップオーバー動作）。

## 「未完了」の定義

担当課題のうちステータスが **未対応 / 処理中 / 処理済み**（`statusId` 1〜3）のものを表示します。「完了(Closed)」は除外。プロジェクトごとのカスタムステータスを厳密に扱いたい場合は `backlog.js` の `myOpenIssues()` を調整してください。

## 構成

```
main.js          Electron メインプロセス（トレイ / ウィンドウ / IPC）
preload.js       レンダラーへ安全に公開する API ブリッジ
backlog.js       Backlog REST API v2 クライアント
renderer/        UI（index.html / styles.css / app.js）
generate-icon.js メニューバー用テンプレートアイコンを生成
```

## アイコン生成

```bash
npm run icons   # メニューバー用テンプレート + アプリアイコン(.icns) を再生成
```

`generate-icon.js`（メニューバー）と `make-appicon.js`（アプリ本体、緑地に白いチェックリスト）が
依存ライブラリなしで PNG を生成し、`iconutil` で `assets/icon.icns` をビルドします。

## 配布用パッケージのビルド

```bash
npm run package   # dist/BacklogDashboard-darwin-arm64/BacklogDashboard.app を生成
npm run dist      # 上記 + dist/BacklogDashboard-<version>-arm64.dmg を生成
```

- `@electron/packager` で `.app` を作成（Apple Silicon / arm64）。`LSUIElement` を有効にした
  メニューバー常駐アプリとしてビルドされます。
- `.dmg` は macOS 標準の `hdiutil` で作成。中に `Applications` へのショートカットを含むので、
  ドラッグ＆ドロップでインストールできます。
- **コード署名はしていません。** 初回起動時は Gatekeeper の警告が出るため、`.app` を
  **右クリック → 開く**（または「システム設定 > プライバシーとセキュリティ」で許可）してください。
- ログイン時に自動起動したい場合は「システム設定 > 一般 > ログイン項目」に `.app` を追加します。
