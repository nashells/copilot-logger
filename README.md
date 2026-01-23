# Copilot Logger

GitHub Copilotのチャット履歴を自動的にMarkdownファイルに記録するVS Code拡張機能です。

## 機能

- GitHub Copilot Chatの会話履歴をリアルタイムで記録
- chokidarによるファイル監視で新しい会話を自動検出
- 1日1ファイルのMarkdown形式で保存
- ファイル名: `{workspace-name}-YYYYMMDD.md`
- デフォルト保存先: `~/.copilot-logs/`
- 保存先ディレクトリはカスタマイズ可能
- WSL環境とLinuxネイティブ環境の両方に対応

## 対応環境

- **Linux (ネイティブ)**: `~/.config/Code/User/workspaceStorage` を監視
- **WSL**: `/mnt/c/Users/{username}/AppData/Roaming/Code/User/workspaceStorage` を自動検出

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

4. **VS Codeにインストール**

```bash
code --install-extension copilot-logger-0.0.1.vsix
```

または、VS Codeのコマンドパレット（Ctrl+Shift+P）から：
- `Extensions: Install from VSIX...` を選択
- 生成された `.vsix` ファイルを選択

## 使い方

1. VS Codeを再起動（または拡張機能を有効化）
2. 拡張機能はVS Code起動完了後に自動的に有効化されます
3. GitHub Copilot Chatを使用すると、自動的にログが記録されます
4. ログファイルは設定されたディレクトリ（デフォルト: `~/.copilot-logs/`）に保存されます
5. 出力パネル「Copilot Logger」で動作状況を確認できます

## 設定

VS Codeの設定（`settings.json`）で以下のオプションをカスタマイズできます：

```json
{
  "copilotLogger.logDirectory": "~/.copilot-logs",
  "copilotLogger.enabled": true
}
```

### 設定項目

| 設定 | 説明 | デフォルト |
|------|------|-----------|
| `copilotLogger.logDirectory` | ログファイルの保存先ディレクトリ | `~/.copilot-logs` |
| `copilotLogger.enabled` | ログ記録の有効/無効 | `true` |

## 開発

### デバッグ実行

1. VS Codeでこのプロジェクトを開く
2. `F5`キーを押すか、「実行とデバッグ」から「Run Extension」を選択
3. 新しいVS Codeウィンドウが開き、拡張機能がロードされます

### ウォッチモード

```bash
npm run watch
```

コードの変更を監視し、自動的にコンパイルします。

## ログファイルの形式

```markdown
# Copilot Chat Log - 2026-01-23

## User [14:30:45]

ユーザーの質問内容

---

## Assistant (claude-sonnet-4) [14:30:50]

アシスタントの回答内容

---
```

## 技術的な詳細

- VS Codeの `workspaceStorage` 内の `chatSessions/*.json` ファイルを監視
- chokidarによるポーリング監視（WSL環境での互換性のため）
- セッションごとに処理済みリクエスト数を追跡し、重複記録を防止

## ライセンス

MIT

## 注意事項

- この拡張機能はローカルテスト用です
- Copilotのチャット履歴には機密情報が含まれる可能性があるため、ログファイルの管理には注意してください
- 現在のバージョンはVSCodeのCopilot Chat APIの利用可能性に依存します