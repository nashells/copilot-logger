import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/** Copilot Chatレスポンスアイテムの構造 */
interface ChatResponseItem {
    kind?: string;  // 'thinking', 'markdownContent', 'textEditGroup', null など
    value?: string | {
        content?: Array<{ value?: string }>;
    };
    content?: {
        value?: string;
    };
}

/** Copilot Chatセッションのリクエスト構造 */
interface ChatRequest {
    message?: {
        text?: string;
    };
    response?: ChatResponseItem[];
    timestamp?: number;
    modelId?: string;
    agent?: {
        name?: string;
    };
}

/** Copilot Chatセッションファイルの構造 */
interface ChatSession {
    requests?: ChatRequest[];
    creationDate?: string;
    sessionId?: string;
}

/** 処理済みセッションの追跡用 */
interface ProcessedSession {
    lastRequestCount: number;
    lastTimestamp: number;
}

export class CopilotLogger {
    private disposables: vscode.Disposable[] = [];
    private logDirectory: string;
    private enabled: boolean;
    private processedSessions: Map<string, ProcessedSession> = new Map();
    private fileWatcher: fs.FSWatcher | null = null;
    private watchedPaths: Set<string> = new Set();

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

    /**
     * WSL環境かどうかを判定
     */
    private isWSL(): boolean {
        return process.platform === 'linux' && fs.existsSync('/mnt/c/Users');
    }

    /**
     * Windowsユーザー名を取得（WSL環境用）
     */
    private getWindowsUsername(): string | null {
        try {
            const usersPath = '/mnt/c/Users';
            if (!fs.existsSync(usersPath)) {
                return null;
            }
            
            const entries = fs.readdirSync(usersPath, { withFileTypes: true });
            // 一般的なシステムフォルダを除外
            const excludeDirs = ['Public', 'Default', 'Default User', 'All Users'];
            
            for (const entry of entries) {
                if (entry.isDirectory() && !excludeDirs.includes(entry.name)) {
                    // AppData/Roaming/Code が存在するユーザーを探す
                    const codePath = path.join(usersPath, entry.name, 'AppData/Roaming/Code');
                    if (fs.existsSync(codePath)) {
                        return entry.name;
                    }
                }
            }
            return null;
        } catch (error) {
            console.error('Failed to get Windows username:', error);
            return null;
        }
    }

    /**
     * VS Code workspaceStorage のパスを取得
     */
    private getWorkspaceStoragePath(): string | null {
        if (this.isWSL()) {
            const windowsUser = this.getWindowsUsername();
            if (windowsUser) {
                return `/mnt/c/Users/${windowsUser}/AppData/Roaming/Code/User/workspaceStorage`;
            }
            console.warn('Could not detect Windows username for WSL');
            return null;
        }
        
        // Linux ネイティブ
        return path.join(os.homedir(), '.config/Code/User/workspaceStorage');
    }

    /**
     * chatSessions ディレクトリのパスを検索
     */
    private findChatSessionsPaths(): string[] {
        const workspaceStoragePath = this.getWorkspaceStoragePath();
        if (!workspaceStoragePath || !fs.existsSync(workspaceStoragePath)) {
            console.warn(`workspaceStorage not found: ${workspaceStoragePath}`);
            return [];
        }

        const chatSessionsPaths: string[] = [];
        
        try {
            const workspaceDirs = fs.readdirSync(workspaceStoragePath, { withFileTypes: true });
            
            for (const dir of workspaceDirs) {
                if (dir.isDirectory()) {
                    // state.vscdb 内の chatSessions や直接の chatSessions フォルダを探す
                    const chatSessionsPath = path.join(workspaceStoragePath, dir.name, 'state.vscdb');
                    const directChatPath = path.join(workspaceStoragePath, dir.name);
                    
                    // state.vscdb が存在する場合（これはSQLiteDB、直接監視は難しい）
                    // 代わりに workspaceStorage 全体を監視
                    if (fs.existsSync(directChatPath)) {
                        chatSessionsPaths.push(directChatPath);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to find chatSessions paths:', error);
        }

        return chatSessionsPaths;
    }

    /**
     * Copilot Chat履歴ファイルを監視
     */
    private watchCopilotChat() {
        const workspaceStoragePath = this.getWorkspaceStoragePath();
        
        if (!workspaceStoragePath) {
            vscode.window.showWarningMessage(
                'Copilot Logger: workspaceStorageパスを検出できませんでした。'
            );
            return;
        }

        console.log(`Watching workspaceStorage: ${workspaceStoragePath}`);
        
        // 初回スキャン：既存のセッションファイルを処理
        this.scanExistingSessions(workspaceStoragePath);
        
        // ファイル監視を設定
        this.setupFileWatcher(workspaceStoragePath);
    }

    /**
     * 既存のセッションファイルをスキャン
     */
    private scanExistingSessions(basePath: string) {
        try {
            if (!fs.existsSync(basePath)) {
                return;
            }

            const scanDir = (dirPath: string) => {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);
                    
                    if (entry.isDirectory()) {
                        // state.vscdb は SQLite なのでスキップ、JSON ファイルを探す
                        scanDir(fullPath);
                    } else if (entry.isFile() && entry.name.endsWith('.json')) {
                        // チャットセッションらしきJSONファイルを処理
                        this.processSessionFile(fullPath);
                    }
                }
            };

            scanDir(basePath);
        } catch (error) {
            console.error('Failed to scan existing sessions:', error);
        }
    }

    /**
     * ファイル監視を設定
     */
    private setupFileWatcher(basePath: string) {
        try {
            // fs.watch を使用（再帰的監視）
            // 注: WSLでは /mnt/c 配下の監視が不安定な場合がある
            const watchOptions = { recursive: true };
            
            this.fileWatcher = fs.watch(basePath, watchOptions, (eventType, filename) => {
                if (filename && filename.endsWith('.json')) {
                    const fullPath = path.join(basePath, filename);
                    
                    // デバウンス処理（同じファイルへの連続アクセスを防ぐ）
                    setTimeout(() => {
                        if (fs.existsSync(fullPath)) {
                            this.processSessionFile(fullPath);
                        }
                    }, 100);
                }
            });

            console.log('File watcher setup complete');
            vscode.window.showInformationMessage(
                `Copilot Logger: ${this.isWSL() ? 'WSL' : 'Linux'}環境でチャット履歴の監視を開始しました`
            );
        } catch (error) {
            console.error('Failed to setup file watcher:', error);
            vscode.window.showErrorMessage(
                `Copilot Logger: ファイル監視の設定に失敗しました: ${error}`
            );
        }
    }

    /**
     * セッションファイルを処理
     */
    private processSessionFile(filePath: string) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            let session: ChatSession;
            
            try {
                session = JSON.parse(content);
            } catch {
                // JSONパースに失敗した場合はスキップ
                return;
            }

            // Copilot Chatセッションかどうかを判定
            if (!session.requests || !Array.isArray(session.requests)) {
                return;
            }

            // 既に処理済みのリクエストをスキップ
            const sessionKey = filePath;
            const processed = this.processedSessions.get(sessionKey);
            const currentRequestCount = session.requests.length;
            
            if (processed && processed.lastRequestCount >= currentRequestCount) {
                return; // 新しいリクエストがない
            }

            // 新しいリクエストのみ処理
            const startIndex = processed?.lastRequestCount || 0;
            const newRequests = session.requests.slice(startIndex);

            if (newRequests.length > 0) {
                this.logNewRequests(newRequests, session);
                
                // 処理状態を更新
                this.processedSessions.set(sessionKey, {
                    lastRequestCount: currentRequestCount,
                    lastTimestamp: Date.now()
                });
            }
        } catch (error) {
            // ファイル読み込みエラーは静かに無視（他のプロセスがロック中など）
            console.debug(`Could not process session file: ${filePath}`, error);
        }
    }

    /**
     * 新しいリクエストをログに記録
     */
    private logNewRequests(requests: ChatRequest[], session: ChatSession) {
        for (const request of requests) {
            // ユーザーメッセージ
            const userMessage = request.message?.text;
            if (userMessage) {
                this.logChatMessage({
                    role: 'user',
                    content: userMessage,
                    timestamp: new Date(request.timestamp || Date.now()),
                    modelId: request.modelId,
                    agent: request.agent?.name
                });
            }

            // アシスタントレスポンスを収集
            const responses = request.response;
            if (responses && Array.isArray(responses)) {
                const assistantTexts: string[] = [];
                
                for (const resp of responses) {
                    // kind が null/undefined で value が文字列の場合（メインのテキスト応答）
                    if (!resp.kind && typeof resp.value === 'string' && resp.value.trim()) {
                        assistantTexts.push(resp.value);
                    }
                    // kind === 'markdownContent' の場合
                    else if (resp.kind === 'markdownContent' && resp.content?.value) {
                        assistantTexts.push(resp.content.value);
                    }
                    // kind === 'thinking' の場合（オプション：思考プロセスも記録する場合）
                    // else if (resp.kind === 'thinking' && typeof resp.value === 'string' && resp.value.trim()) {
                    //     assistantTexts.push(`> **Thinking:** ${resp.value}`);
                    // }
                }
                
                // 収集したテキストを結合してログ
                if (assistantTexts.length > 0) {
                    const combinedContent = assistantTexts.join('\n\n');
                    if (combinedContent.trim()) {
                        this.logChatMessage({
                            role: 'assistant',
                            content: combinedContent,
                            timestamp: new Date(request.timestamp || Date.now()),
                            modelId: request.modelId,
                            agent: request.agent?.name
                        });
                    }
                }
            }
        }
    }

    /**
     * チャットメッセージをログに記録
     */
    private async logChatMessage(message: {
        role: 'user' | 'assistant';
        content: string;
        timestamp: Date;
        modelId?: string;
        agent?: string;
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

    /**
     * メッセージをMarkdown形式にフォーマット
     */
    private formatMessage(message: {
        role: 'user' | 'assistant';
        content: string;
        timestamp: Date;
        modelId?: string;
        agent?: string;
    }): string {
        const time = message.timestamp.toLocaleTimeString('ja-JP');
        const role = message.role === 'user' ? '👤 User' : '🤖 Assistant';
        
        let header = `\n## ${role} [${time}]`;
        
        // メタ情報を追加
        const meta: string[] = [];
        if (message.modelId) {
            meta.push(`Model: ${message.modelId}`);
        }
        if (message.agent) {
            meta.push(`Agent: ${message.agent}`);
        }
        if (meta.length > 0) {
            header += `\n> ${meta.join(' | ')}`;
        }
        
        return `${header}\n\n${message.content}\n\n---\n`;
    }

    public dispose() {
        // ファイル監視を停止
        if (this.fileWatcher) {
            this.fileWatcher.close();
            this.fileWatcher = null;
        }
        
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this.processedSessions.clear();
        this.watchedPaths.clear();
    }
}
