# Copilot Chat ログ機能 調査報告書

**調査日**: 2026年1月22日

## 目的

VS Code拡張機能として、GitHub Copilot Chatの全ての会話履歴を自動的にマークダウンファイルとして保存する機能の実現可能性を調査する。

## 結論

**技術的に実現不可能**

現時点のVS Code APIおよびGitHub Copilot Chatの実装では、拡張機能から全てのCopilot Chat会話を自動的にキャプチャしてログに保存することはできない。

---

## 調査内容

### 1. Language Model API (`vscode.lm`)

#### 概要
VS Codeが提供するLanguage Model APIを調査。

#### 結果
- ❌ **自分の拡張機能から**LLMにリクエストを送ることは可能
- ❌ **他の拡張機能（Copilot Chat）のリクエスト/レスポンスを傍受する機能は存在しない**

```typescript
// これは可能
const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
const response = await model.sendRequest(messages, options, token);

// これは不可能
// vscode.lm.onRequest() のようなグローバルフックは存在しない
```

### 2. Chat Participant API

#### 概要
カスタムチャットパーティシパント（`@logger`など）を作成するAPI。

#### 結果
- ✅ `@logger` として呼び出されたときの会話はログ可能
- ❌ 通常のCopilot Chat（`@` なし）の会話はキャプチャ不可
- ❌ 他のパーティシパント（`@workspace`等）の会話にはアクセス不可

```typescript
// ChatContext.history は自分のパーティシパントの履歴のみ
export interface ChatContext {
    readonly history: ReadonlyArray<ChatRequestTurn | ChatResponseTurn>;
    // "Currently, only chat messages for the current participant are included."
}
```

### 3. ローカルストレージ/ファイル監視

#### 調査した場所

| パス | 内容 |
|------|------|
| `~/.vscode-server/data/User/globalStorage/github.copilot-chat/` | 拡張機能データ |
| `api.json` | APIドキュメントのembeddings（会話履歴ではない） |
| `logContextRecordings/` | 空のディレクトリ |
| `workspaceRecordings/` | ワークスペースアクティビティのみ |
| `~/.vscode-server/data/logs/.../GitHub.copilot-chat/` | メタデータのみ |

#### 結果
- ❌ 会話内容はローカルファイルに永続化されていない
- ❌ `ccreq:*.copilotmd` はバーチャルファイルシステムスキームで直接アクセス不可

### 4. 設定による記録機能

#### 調査した設定

```json
{
  "github.copilot.chat.localWorkspaceRecording.enabled": true,
  "github.copilot.chat.editRecording.enabled": true
}
```

#### 結果
- ❌ `localWorkspaceRecording` はワークスペースアクティビティのみ記録
- ❌ `editRecording` は編集操作のみ記録
- ❌ 会話内容（質問と回答のテキスト）は含まれない

### 5. Copilot Chatログファイル

#### ログの内容例
```
2026-01-22 14:50:17.762 [info] ccreq:df24ffdc.copilotmd | success | claude-opus-4.5 | 4137ms | [panel/editAgent]
```

#### 結果
- ✅ リクエストID、モデル名、レスポンス時間は記録される
- ❌ 会話内容（プロンプト、レスポンステキスト）は含まれない

---

## 技術的障壁

| 障壁 | 説明 |
|------|------|
| API制限 | VS Code APIは拡張機能間の通信傍受手段を提供していない |
| セキュリティ設計 | 拡張機能間のデータ分離はVS Codeのセキュリティポリシー |
| プライバシー保護 | 会話内容のローカル保存は意図的に制限されている可能性 |

---

## 代替案

### 実装可能だが要件を満たさない

1. **Chat Participant API**
   - `@logger` で明示的に呼び出す形式
   - 通常のCopilot Chatは対象外

### 拡張機能外のアプローチ

1. **GitHub Enterprise監査ログ**
   - 企業向け機能として提供される可能性

2. **GitHub公式機能**
   - 将来的なエクスポート機能の追加を待つ

3. **ネットワークプロキシ（mitmproxy等）**
   - HTTPSトラフィックを傍受
   - 証明書の問題があり複雑

4. **機能リクエスト**
   - GitHub/Microsoftに要望を出す

---

## 参考: 調査で発見したCopilot Chat関連設定

```json
{
  "github.copilot.chat.localWorkspaceRecording.enabled": false,
  "github.copilot.chat.editRecording.enabled": false,
  "github.copilot.chat.debug.requestLogger.maxEntries": 100
}
```

### デバッグコマンド

- `github.copilot.debug.showChatLogView` - チャットデバッグビューを表示
- `github.copilot.chat.debug.exportAllPromptLogsAsJson` - プロンプトログをJSONでエクスポート
- `github.copilot.chat.debug.exportPromptArchive` - プロンプトアーカイブをエクスポート

※これらはVS Code内でのみ利用可能で、自動化やファイル出力には対応していない

---

## 最終判断

このプロジェクトの当初の要件「全てのCopilot Chat会話を自動的にマークダウンファイルとして保存する」は、現在のVS Code APIおよびGitHub Copilot Chatの実装では**技術的に実現不可能**である。
