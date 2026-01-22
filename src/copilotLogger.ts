import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class CopilotLogger {
    private disposables: vscode.Disposable[] = [];
    private logDirectory: string;
    private enabled: boolean;

    constructor(private context: vscode.ExtensionContext) {
        // 設定を読み込む
        const config = vscode.workspace.getConfiguration('copilotLogger');
        this.logDirectory = this.expandPath(config.get<string>('logDirectory', '~/.copilot-logs'));
        this.enabled = config.get<boolean>('enabled', true);

        if (this.enabled) {
            this.initialize();
        }
    }

    private initialize() {
        // ログディレクトリを作成
        this.ensureLogDirectory();

        // Copilot Chatの履歴を監視
        this.watchCopilotChat();
    }

    private expandPath(filePath: string): string {
        if (filePath.startsWith('~')) {
            return path.join(os.homedir(), filePath.slice(1));
        }
        return filePath;
    }

    private ensureLogDirectory() {
        try {
            if (!fs.existsSync(this.logDirectory)) {
                fs.mkdirSync(this.logDirectory, { recursive: true });
                console.log(`Created log directory: ${this.logDirectory}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create log directory: ${error}`);
        }
    }

    private watchCopilotChat() {
        // GitHub Copilot Chatの履歴にアクセス
        // VSCode APIでCopilot Chat履歴を取得する方法を実装
        
        // 注: 現時点でVSCode APIに公式なCopilot Chat履歴APIがない可能性があります
        // 利用可能なAPIを調査し、以下のいずれかを使用:
        // 1. vscode.chat API (利用可能な場合)
        // 2. vscode.lm API
        // 3. Chat Participantsを監視
        
        try {
            // Chat Participantが利用可能かチェック
            if ('chat' in vscode && 'createChatParticipant' in (vscode as any).chat) {
                this.setupChatParticipant();
            } else {
                // 代替案: Language Model APIを使用
                this.setupLanguageModelMonitoring();
            }
        } catch (error) {
            console.error('Failed to setup Copilot monitoring:', error);
            vscode.window.showWarningMessage(
                'Copilot Logger: Copilot Chat APIへのアクセスに失敗しました。機能が制限される可能性があります。'
            );
        }
    }

    private setupChatParticipant() {
        // Chat Participant APIを使用して履歴を監視
        // この実装は実際のAPIに応じて調整が必要
        console.log('Setting up Chat Participant monitoring...');
        
        // 将来的な実装のためのプレースホルダー
        // 実際のAPIドキュメントに基づいて実装
    }

    private setupLanguageModelMonitoring() {
        // Language Model APIを使用した代替実装
        console.log('Setting up Language Model monitoring...');
        
        // Chat viewが開かれたときの処理
        // 実際のイベントリスナーを実装
    }

    private async logChatMessage(message: {
        role: 'user' | 'assistant';
        content: string;
        timestamp: Date;
    }) {
        if (!this.enabled) {
            return;
        }

        try {
            const logFile = this.getLogFilePath();
            const formattedMessage = this.formatMessage(message);
            
            // ファイルに追記
            fs.appendFileSync(logFile, formattedMessage, 'utf8');
            console.log(`Logged message to: ${logFile}`);
        } catch (error) {
            console.error('Failed to log message:', error);
        }
    }

    private getLogFilePath(): string {
        const workspaceName = this.getWorkspaceName();
        const dateStr = this.getDateString();
        const fileName = `${workspaceName}-${dateStr}.md`;
        return path.join(this.logDirectory, fileName);
    }

    private getWorkspaceName(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return path.basename(workspaceFolders[0].uri.fsPath);
        }
        return 'untitled';
    }

    private getDateString(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    private formatMessage(message: {
        role: 'user' | 'assistant';
        content: string;
        timestamp: Date;
    }): string {
        const time = message.timestamp.toLocaleTimeString('ja-JP');
        const role = message.role === 'user' ? 'User' : 'Assistant';
        
        return `\n## ${role} [${time}]\n\n${message.content}\n\n---\n`;
    }

    public dispose() {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
