# GitHub Copilot Chat プロンプト記録の自動保存に関する調査

## 調査目的

VSCodeでGitHub Copilotを使用した際のプロンプト（入出力）を自動的に記録し、Markdown形式のファイルに保存する方法を調査する。

---

## 1. 既存ソリューション

### SpecStory 拡張機能

GitHub Copilotのチャット履歴を自動保存する拡張機能が存在する。

**特徴：**
- インストール後、自動的にチャット履歴を `.specstory/history/` に Markdown 形式で保存
- ローカルファースト（明示的に共有しない限りデータは外部に送信されない）
- カスタム指示の自動生成機能あり

**制限：**
- 保存先をワークスペース外の任意のディレクトリに変更できない
- プロジェクトルートの `.specstory/history/` に固定

**インストール：**
1. VSCodeで拡張機能マーケットプレイスを開く（`Ctrl+Shift+X`）
2. 「SpecStory」を検索してインストール

---

## 2. VSCode Extension API による実装可能性

### 結論：直接的なAPIは存在しない

VSCode Extension APIには、GitHub Copilot Chatの入出力を**直接監視**するAPIは提供されていない。

### 利用可能なAPI

| API | 説明 | Copilot監視への適用 |
|-----|------|-------------------|
| Chat Participant API | 独自のChat Participantを作成 | 自分のParticipantのみ処理可能。他のParticipant（@copilot等）は傍受不可 |
| `context.history` | Chat Participantの過去メッセージ履歴 | 自分のParticipant内でのみ利用可能 |
| ファイルシステムAPI | ファイルの読み書き・監視 | ✅ チャット履歴ファイルの監視に利用可能 |

---

## 3. チャット履歴のローカル保存場所

### 保存パス（環境別）

| 環境 | パス |
|------|------|
| Windows | `%APPDATA%\Code\User\workspaceStorage\<workspace-id>\chatSessions\` |
| Linux | `~/.config/Code/User/workspaceStorage/<workspace-id>/chatSessions/` |
| macOS | `~/Library/Application Support/Code/User/workspaceStorage/<workspace-id>/chatSessions/` |
| WSL（Windows VSCode使用時） | `/mnt/c/Users/<username>/AppData/Roaming/Code/User/workspaceStorage/<workspace-id>/chatSessions/` |
| Snap版 Linux | `~/snap/code/current/.config/Code/User/workspaceStorage/<workspace-id>/chatSessions/` |
| Flatpak版 Linux | `~/.var/app/com.visualstudio.code/config/Code/User/workspaceStorage/<workspace-id>/chatSessions/` |

### globalStorage（Copilot関連設定）

- Windows: `%APPDATA%\Code\User\globalStorage\github.copilot-chat\`
- Linux: `~/.config/Code/User/globalStorage/github.copilot-chat/`

---

## 4. チャット履歴JSONの構造

### ファイル形式

- 場所: `workspaceStorage/<workspace-id>/chatSessions/<session-uuid>.json`
- ワークスペースごとに異なるディレクトリに保存
- セッションごとにUUID付きのJSONファイル

### JSON構造

```json
{
  "version": 3,
  "requesterUsername": "GitHubユーザー名",
  "requesterAvatarIconUri": { ... },
  "responderUsername": "GitHub Copilot",
  "responderAvatarIconUri": { "id": "copilot" },
  "initialLocation": "panel",
  "requests": [
    {
      "requestId": "request_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "message": {
        "text": "ユーザーのプロンプト（入力）",
        "parts": [ ... ]
      },
      "variableData": { "variables": [] },
      "response": [
        {
          "kind": "markdownContent",
          "content": { "value": "Copilotの応答（出力）" }
        }
      ],
      "agent": {
        "name": "agent",
        "fullName": "GitHub Copilot",
        "id": "github.copilot.editsAgent"
      },
      "timestamp": 1765941069923,
      "modelId": "copilot/gpt-5.1",
      "responseId": "response_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    }
  ],
  "sessionId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "creationDate": 1754970499507,
  "lastMessageDate": 1754970499507
}
```

### 取得可能なデータ

| データ | JSONパス | 説明 |
|--------|----------|------|
| ユーザープロンプト | `requests[].message.text` | ユーザーの入力テキスト |
| Copilot応答 | `requests[].response[]` | 応答内容（複数要素の場合あり） |
| タイムスタンプ | `requests[].timestamp` | Unixタイムスタンプ（ミリ秒） |
| 使用モデル | `requests[].modelId` | 例: `copilot/gpt-5.1` |
| エージェント | `requests[].agent.name` | 例: `agent`, `ask`, `edit` |
| セッションID | `sessionId` | セッション識別子 |

---

## 5. 独自実装の推奨アプローチ

### ファイル監視方式

Copilot Chatの入出力を直接傍受するAPIがないため、**保存されたJSONファイルを監視**するアプローチが現実的。

```
┌─────────────────────────────────────────────────────────────┐
│  VSCode + GitHub Copilot Chat                               │
│                                                             │
│  ユーザー ←→ Copilot Chat ←→ chatSessions/*.json に保存    │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────────────────┐
                    │  独自拡張機能        │
                    │  1. ファイル監視     │
                    │  2. JSON パース      │
                    │  3. Markdown 変換    │
                    │  4. 指定先に保存     │
                    └─────────────────────┘
                              ↓
                    ┌─────────────────────┐
                    │  任意のディレクトリ   │
                    │  ~/copilot-logs/    │
                    │  ├── 2025-01-22.md  │
                    │  └── ...            │
                    └─────────────────────┘
```

### 実装の骨格（TypeScript）

```typescript
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    // 設定から保存先パスを取得
    const config = vscode.workspace.getConfiguration('copilotLogger');
    const outputDir = config.get<string>('outputDirectory', '~/copilot-logs');
    
    // workspaceStorageのパスを取得
    const workspaceStoragePath = getWorkspaceStoragePath();
    
    // chatSessionsディレクトリを監視
    const watcher = fs.watch(
        path.join(workspaceStoragePath, 'chatSessions'),
        { recursive: true },
        (eventType, filename) => {
            if (filename?.endsWith('.json')) {
                processChangedFile(filename, outputDir);
            }
        }
    );
    
    context.subscriptions.push({ dispose: () => watcher.close() });
}

function processChangedFile(filename: string, outputDir: string) {
    // 1. JSONファイルを読み込み
    // 2. requests配列をパース
    // 3. Markdown形式に変換
    // 4. outputDirに保存
}

function convertToMarkdown(session: any): string {
    let md = `# Copilot Chat Session\n\n`;
    md += `- Session ID: ${session.sessionId}\n`;
    md += `- Created: ${new Date(session.creationDate).toISOString()}\n\n`;
    
    for (const req of session.requests) {
        const timestamp = new Date(req.timestamp).toISOString();
        md += `## [${timestamp}] User\n\n`;
        md += `${req.message.text}\n\n`;
        
        md += `## [${timestamp}] Copilot (${req.modelId})\n\n`;
        // response配列を処理
        for (const resp of req.response) {
            if (resp.kind === 'markdownContent') {
                md += `${resp.content.value}\n\n`;
            }
        }
        md += `---\n\n`;
    }
    
    return md;
}
```

---

## 6. 実装上の考慮事項

### WSL環境での注意点

- Windows側のVSCodeを使用している場合、履歴ファイルは `/mnt/c/Users/<username>/AppData/Roaming/Code/` に保存される
- 拡張機能からはWindows側のパスにアクセスする必要がある

### ワークスペースIDの特定

- `workspaceStorage` 内のディレクトリ名（例: `d670286bf01d7e030de7b55cc4e5f7ff`）はワークスペースのハッシュ
- 現在のワークスペースに対応するディレクトリを特定するには、`workspace.json` ファイルを参照するか、全ディレクトリを監視する

### ファイルサイズ

- 長い会話セッションは数MBになることがある（調査で最大4.6MBを確認）
- 大きなファイルの処理には注意が必要

---

## 7. 参考リンク

- [VSCode Chat Participant API](https://code.visualstudio.com/api/extension-guides/ai/chat)
- [SpecStory 拡張機能](https://marketplace.visualstudio.com/items?itemName=SpecStory.specstory-vscode)
- [SpecStory ドキュメント](https://docs.specstory.com/integrations/vscode)
- [GitHub Copilot Chat リポジトリ](https://github.com/microsoft/vscode-copilot-chat)
- [VSCode Extension API リファレンス](https://code.visualstudio.com/api/references/vscode-api)

---

## 8. 次のステップ

1. **SpecStoryで十分な場合**: インストールして使用開始
2. **カスタム保存先が必要な場合**: 
   - VSCode拡張機能を自作
   - ファイル監視方式で実装
   - 設定で保存先ディレクトリを指定可能にする

---

*調査日: 2026年1月22日*