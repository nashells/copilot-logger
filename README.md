# Copilot Logger

GitHub Copilotのチャット履歴を自動的にMarkdownファイルに記録するVSCode拡張機能です。

## 機能

- GitHub Copilotのチャット履歴をリアルタイムで記録
- 1日1ファイルのMarkdown形式で保存
- ファイル名: `{workspace-name}-YYYYMMDD.md`
- デフォルト保存先: `~/.copilot-logs/`
- 保存先ディレクトリはカスタマイズ可能

## インストール方法

### ローカルビルドとインストール

1. **依存関係のインストール**

```bash
npm install
```

2. **コンパイル**

```bash
npm run compile
```

3. **VSIXパッケージの作成**

```bash
npm run package
```

4. **VSCodeにインストール**

```bash
code --install-extension copilot-logger-0.0.1.vsix
```

または、VSCodeのコマンドパレット（Ctrl+Shift+P / Cmd+Shift+P）から：
- `Extensions: Install from VSIX...` を選択
- 生成された `.vsix` ファイルを選択

## 使い方

1. VSCodeを再起動
2. 拡張機能は自動的に有効化されます
3. GitHub Copilot Chatを使用すると、自動的にログが記録されます
4. ログファイルは設定されたディレクトリ（デフォルト: `~/.copilot-logs/`）に保存されます

## 設定

VSCodeの設定（`settings.json`）で以下のオプションをカスタマイズできます：

```json
{
  "copilotLogger.logDirectory": "~/.copilot-logs",
  "copilotLogger.enabled": true
}
```

### 設定項目

- `copilotLogger.logDirectory`: ログファイルの保存先ディレクトリ（デフォルト: `~/.copilot-logs`）
- `copilotLogger.enabled`: ログ記録の有効/無効（デフォルト: `true`）

## 開発

### デバッグ実行

1. VSCodeでこのプロジェクトを開く
2. `F5`キーを押すか、「実行とデバッグ」から「Run Extension」を選択
3. 新しいVSCodeウィンドウが開き、拡張機能がロードされます

### ウォッチモード

```bash
npm run watch
```

コードの変更を監視し、自動的にコンパイルします。

## ログファイルの形式

```markdown
## User [14:30:45]

ユーザーの質問内容

---

## Assistant [14:30:50]

アシスタントの回答内容

---
```

## ライセンス

MIT

## 注意事項

- この拡張機能はローカルテスト用です
- Copilotのチャット履歴には機密情報が含まれる可能性があるため、ログファイルの管理には注意してください
- 現在のバージョンはVSCodeのCopilot Chat APIの利用可能性に依存します