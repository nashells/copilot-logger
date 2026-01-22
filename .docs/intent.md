# GitHub Copilotのプロンプトを自動的に記録するVScode拡張

GitHub Copilotのプロンプトを自動的に記録するVScode拡張を開発する。
Chat APIを使って履歴を取得、保存する。
保存のタイミングはリアルタイム。（チャットする度に自動保存）
保存先はグローバルディレクトリ。保存先は設定可能とするが、デフォルトは`~/.copilot-logs/`。
保存形式はMarkdown。
１日１ファイルとし、そこに追記していく。
ファイル名は`{workspace name}-YYYYMMDD.md`形式とする。
