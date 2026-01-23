/**
 * リアルタイム監視テストスクリプト
 * chokidarでWSL環境のworkspaceStorageを監視
 */

const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const os = require('os');

// WSL環境のパスを取得
function getWorkspaceStoragePath() {
    const usersPath = '/mnt/c/Users';
    if (!fs.existsSync(usersPath)) {
        console.error('Not a WSL environment');
        return null;
    }
    
    const entries = fs.readdirSync(usersPath, { withFileTypes: true });
    const excludeDirs = ['Public', 'Default', 'Default User', 'All Users'];
    
    for (const entry of entries) {
        if (entry.isDirectory() && !excludeDirs.includes(entry.name)) {
            const codePath = path.join(usersPath, entry.name, 'AppData/Roaming/Code');
            if (fs.existsSync(codePath)) {
                return path.join(codePath, 'User/workspaceStorage');
            }
        }
    }
    return null;
}

const basePath = getWorkspaceStoragePath();
console.log(`Watching: ${basePath}`);
console.log('Press Ctrl+C to stop...\n');

const logDir = path.join(os.homedir(), '.copilot-logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// 処理済みセッション追跡
const processedSessions = new Map();

// chokidar で監視
const watcher = chokidar.watch(path.join(basePath, '**/chatSessions/*.json'), {
    persistent: true,
    usePolling: true,
    interval: 1000,
    ignoreInitial: false,
    awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
    }
});

watcher.on('add', (filePath) => {
    console.log(`[ADD] ${path.basename(filePath)}`);
    processSessionFile(filePath);
});

watcher.on('change', (filePath) => {
    console.log(`[CHANGE] ${path.basename(filePath)} at ${new Date().toLocaleTimeString()}`);
    processSessionFile(filePath);
});

watcher.on('error', (error) => {
    console.error('Watcher error:', error);
});

watcher.on('ready', () => {
    console.log('Initial scan complete. Ready for changes.\n');
});

function processSessionFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const session = JSON.parse(content);
        
        if (!session.requests || !Array.isArray(session.requests)) {
            return;
        }
        
        const sessionKey = filePath;
        const processed = processedSessions.get(sessionKey);
        const currentRequestCount = session.requests.length;
        
        if (processed && processed.lastRequestCount >= currentRequestCount) {
            return;
        }
        
        const startIndex = processed?.lastRequestCount || 0;
        const newRequests = session.requests.slice(startIndex);
        
        if (newRequests.length > 0) {
            console.log(`  -> ${newRequests.length} new request(s)`);
            
            for (const req of newRequests) {
                const userText = req.message?.text || '';
                console.log(`  User: ${userText.substring(0, 80)}...`);
                
                // ログファイルに書き込み
                const logEntry = formatLogEntry(req);
                const logFile = getLogFilePath();
                fs.appendFileSync(logFile, logEntry, 'utf8');
                console.log(`  -> Logged to: ${path.basename(logFile)}`);
            }
            
            processedSessions.set(sessionKey, {
                lastRequestCount: currentRequestCount
            });
        }
    } catch (error) {
        // 無視
    }
}

function formatLogEntry(req) {
    const timestamp = req.timestamp ? new Date(req.timestamp) : new Date();
    const time = timestamp.toLocaleTimeString('ja-JP');
    
    let entry = '';
    
    // ユーザーメッセージ
    const userText = req.message?.text || '';
    if (userText) {
        entry += `\n## 👤 User [${time}]\n\n${userText}\n\n---\n`;
    }
    
    // アシスタント応答
    const responses = req.response || [];
    const assistantTexts = [];
    
    for (const resp of responses) {
        if (!resp.kind && typeof resp.value === 'string' && resp.value.trim()) {
            assistantTexts.push(resp.value);
        } else if (resp.kind === 'markdownContent' && resp.content?.value) {
            assistantTexts.push(resp.content.value);
        }
    }
    
    if (assistantTexts.length > 0) {
        const modelId = req.modelId || 'unknown';
        entry += `\n## 🤖 Assistant [${time}]\n> Model: ${modelId}\n\n`;
        entry += assistantTexts.join('\n\n');
        entry += '\n\n---\n';
    }
    
    return entry;
}

function getLogFilePath() {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    return path.join(logDir, `copilot-logger-${dateStr}.md`);
}

console.log('Watcher started...');
