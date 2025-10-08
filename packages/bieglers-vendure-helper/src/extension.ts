import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('bieglers-vendure-helper.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from Bieglers Vendure Helper!');
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
