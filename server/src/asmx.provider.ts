import * as vscode from "vscode";

export const ASMX_MODE: vscode.DocumentSelector = { scheme: 'file', language: 'AsmX'  };

export class AsmXCompletionProvider implements vscode.CompletionItemProvider {
	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
		const lineText = document.lineAt(position.line).text;
		const completionItems: vscode.CompletionItem[] = [];

		if (lineText.startsWith('@set')) {
			const variableInfo = this.extractVariableInfo(lineText);
			const completionItem = new vscode.CompletionItem(variableInfo.name, vscode.CompletionItemKind.Variable);
			completionItem.detail = `Type ${variableInfo.type}, Value: ${variableInfo.value}`;

			// detail.command = {
			// 	title: ''
			// }

			// completionItems.push(completionItem);
			return [completionItem];
		}

		return completionItems;
	}

	// provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {

	// }

	private extractVariableInfo(lineText: string) {
		const params = lineText.split(' ');
		const name = params[1];
		const type = params[2];
		const value = params.slice(3).join(' ');
		return { name, type, value };
	}

	resolveCompletionItem?(item: vscode.CompletionItem, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem> {
		throw new Error('');
	}
}