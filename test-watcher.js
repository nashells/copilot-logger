/**
 * chokidarベースの監視テスト - 実際のログ記録まで行う
 */
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 設定
const LOG_DIR = path.join(os.homedir(), '.copilot-logs');
const BASE_PATH = '/mnt/c/Users/sato/AppData/Roaming/Code/User/workspaceStorage';

// 処理済みセッション追跡
const processedSessions = new Map();

// ログディレクトリ作成
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    console.log('ログディレクトリ作成:', LOG_DIR);
}

/**
 * セッションファイルを処理
 */
function processSessionFile(filePath) {
    if (!filePath.includes('chatSessions') || !filePath.endsWith('.json')) {
        return;
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const session = JSON.parse(content);
        
        if (!session.requests || session.requests.length === 0) {
            return;
        }

        const sessionId = session.sessionId || path.basename(filePath, '.json');
        const existingCount = processedSessions.get(sessionId) || 0;
        
        if (session.requests.length <= existingCount) {
            return;
        }

        // 新しいリクエストのみ処理
        const newRequests = session.requests.slice(existingCount);
        console.log(`\n新しいリクエスト ${newRequests.length} 件を検出 (sessionId: ${sessionId.substring(0, 8)}...)`);

        logNewRequests(session, newRequests);
        processedSessions.set(sessionId, session.requests.length);

    } catch (error) {
        console.error('ファイル処理エラー:', error.message);
    }
}

/**
 * 新しいリクエストをログに記録
 */
function logNewRequests(session, requests) {
    // ワークスペース名を取得
    const sessionId = session.sessionId || 'unknown';
    let workspaceName = 'chat';
    
    if (session.workspaceFolder) {
        workspaceName = path.basename(session.workspaceFolder);
    }

    // 日付ごとのログファイル
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const logFile = path.join(LOG_DIR, `${workspaceName}-${today}.md`);

    let logContent = '';
    
    for (const request of requests) {
        const timestamp = request.timestamp 
            ? new Date(request.timestamp).toLocaleString('ja-JP')
            : new Date().toLocaleString('ja-JP');

        // モデル・エージェント情報
        let metaInfo = '';
        if (request.model) {
            metaInfo += `Model: ${request.model}`;
        }
        if (request.agent) {
            metaInfo += metaInfo ? ` | Agent: ${request.agent}` : `Agent: ${request.agent}`;
        }

        // ユーザーメッセージ
        const userMessage = request.message?.text || '';
        
        // アシスタントレスポンス
        let assistantResponse = '';
        if (request.response && Array.isArray(request.response)) {
            for (const part of request.response) {
                if (part.kind === null && part.value) {
                    assistantResponse += part.value;
                }
            }
        }

        // Markdown形式で記録
        logContent += `\n---\n`;
        logContent += `### ${timestamp}\n`;
        if (metaInfo) {
            logContent += `*${metaInfo}*\n\n`;
        }
        logContent += `**User:**\n${userMessage}\n\n`;
        logContent += `**Assistant:**\n${assistantResponse}\n`;
    }

    // ファイルに追記
    if (logContent) {
        // 新規ファイルの場合はヘッダー追加
        if (!fs.existsSync(logFile)) {
            const header = `# Copilot Chat Log - ${workspaceName}\n\nGenerated: ${new Date().toISOString()}\n`;
            fs.writeFileSync(logFile, header, 'utf-8');
        }
        
        fs.appendFileSync(logFile, logContent, 'utf-8');
        console.log(`ログ記録完了: ${logFile}`);
    }
}

/**
 * 既存のセッションを処理（起動時）
 */
function processExistingSessions() {
    console.log('既存セッションをスキャン中...');
    
    const dirs = fs.readdirSync(BASE_PATH);
    let totalSessions = 0;
    
    for (const dir of dirs) {
        const chatSessionsPath = path.join(BASE_PATH, dir, 'chatSessions');
        if (fs.existsSync(chatSessionsPath)) {
            const jsonFiles = fs.readdirSync(chatSessionsPath)
                .filter(f => f.endsWith('.json'));
            
            for (const jsonFile of jsonFiles) {
                const fullPath = path.join(chatSessionsPath, jsonFile);
                try {
                    const content = fs.readFileSync(fullPath, 'utf-8');
                    const session = JSON.parse(content);
                    
                    if (session.requests && session.requests.length > 0) {
                        const sessionId = session.sessionId || path.basename(fullPath, '.json');
                        // 既存のリクエスト数を記録（再処理しないため）
                        processedSessions.set(sessionId, session.requests.length);
                        totalSessions++;
                    }
                } catch (e) {
                    // 無視
                }
            }
        }
    }
    
    console.log(`${totalSessions} 件の既存セッションを検出`);
}

// メイン
console.log('='.repeat(50));
console.log('Copilot Logger テスト (chokidar)');
console.log('='.repeat(50));
console.log('ログディレクトリ:', LOG_DIR);
console.log('監視パス:', BASE_PATH);
console.log('');

// 既存セッションをスキャン
processExistingSessions();

// chokidarで監視開始
const watcher = chokidar.watch(
    path.join(BASE_PATH, '**/*.json'),
    {
        persistent: true,
        ignoreInitial: true,
        usePolling: true,
        interval: 1000,
        awaitWriteFinish: {
            stabilityThreshold: 500,
            pollInterval: 100
        }
    }
);

watcher.on('change', processSessionFile);
watcher.on('add', processSessionFile);
watcher.on('error', (err) => console.error('Watcher error:', err));

watcher.on('ready', () => {
    console.log('\n監視開始！VS Codeでチャットを送信してください。');
    console.log('Ctrl+C で終了\n');
});

// 終了ハンドラ
process.on('SIGINT', () => {
    console.log('\n終了します...');
    watcher.close();
    process.exit(0);
});
