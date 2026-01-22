import * as vscode from 'vscode';
import { CopilotLogger } from './copilotLogger';

let logger: CopilotLogger | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Copilot Logger is now active');

    // ロガーを初期化
    logger = new CopilotLogger(context);

    // 設定変更時にロガーを再初期化
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('copilotLogger')) {
                logger?.dispose();
                logger = new CopilotLogger(context);
            }
        })
    );

    // 手動でログを保存するコマンド（オプション）
    const saveLogsCommand = vscode.commands.registerCommand('copilotLogger.saveLogs', () => {
        vscode.window.showInformationMessage('Copilotログは自動的に保存されています');
    });

    context.subscriptions.push(saveLogsCommand);
}

export function deactivate() {
    logger?.dispose();
}
