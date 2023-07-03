import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import { AsmXCompletionProvider } from './asmx.provider';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);

	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);

	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			completionProvider: {
				resolveProvider: true
			}
		}
	};

	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}

	return result;
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}

	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});


// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}


// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();


connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <ExampleSettings>(
			(change.settings.AsmXLanguageServer || defaultSettings)
		);
	}

	// Revalidate all open text documents
	documents.all().forEach(validateTextDocument);
});


function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) return Promise.resolve(globalSettings);
	let result = documentSettings.get(resource);

	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'AsmXLanguageServer'
		});

		documentSettings.set(resource, result);
	}

	return result;
}


// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	validateTextDocument(change.document);
	referenceCompletion(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	// In this simple example we get the settings for every validate run.
	const settings = await getDocumentSettings(textDocument.uri);

	// The validator creates diagnostics for all uppercase words length 2 and more
	const text = textDocument.getText();
	let m: RegExpExecArray | null;
	let problems = 0;
	const diagnostics: Diagnostic[] = [];


	let patternValidVariableName = /(?<=@set|@Set|@SET)\s+(\b[A-Z0-9_]*\b)/g;
	let patternValidVariableNameTest = /(?<=@set|@Set|@SET)\s([^a-z][A-Z0-9_]*)/;

	while (patternValidVariableNameTest.test(text) && (m = patternValidVariableName.exec(text)) && problems < settings.maxNumberOfProblems) {
		problems++;

		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Warning,

			range: {
				start: textDocument.positionAt(m.index + 1),
				end: textDocument.positionAt(m.index + m[0].length)
			},
	
			message: `${m[0].trim()} is all uppercase.`,
			source: 'AsmX',
			code: textDocument.getText()
		};

		
		if (hasDiagnosticRelatedInformationCapability) {
			diagnostic.relatedInformation = [
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, {
							start: {
								character: diagnostic.range.start.character,
								line: textDocument.lineCount,
							},

							end: {
								character: diagnostic.range.end.character,
								line: textDocument.lineCount,
							}
						}),
						
					},
					message: 'You should make the variable name in lower case or lower style.'
				}
			];
		}

		diagnostics.push(diagnostic);
	}
	
	if (problems == 0) {
		for (let index = 0; index < diagnostics.length; index++) {
			diagnostics.pop();
		}
	}

	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}


let completions: CompletionItem[] = [];

// This is Elon Musk
async function referenceCompletion(textDocument: TextDocument): Promise<void> {
	// In this simple example we get the settings for every validate run.
	const settings = await getDocumentSettings(textDocument.uri);
	const text = textDocument.getText();
	let m: RegExpExecArray | null;

	const patterns = {
		variable: {
			test: /(?<=@set|@Set|@SET)\s+([a-z-ZA0-9_]*)/,
			exec: /(?<=@set|@Set|@SET)\s+([a-z-ZA0-9_]*)/g
		},

		constant: {
			test: /(?<=@define|@Define|@DEFINE)\s+([A-Z0-9_]*)/,
			exec: /(?<=@define|@Define|@DEFINE)\s+([A-Z0-9_]*)/g
		}
	}


	while (patterns.variable.test.test(text) && (m = patterns.variable.exec.exec(text))) {
		let reference = CompletionItem.create(m[1].trim());
		reference.kind = CompletionItemKind.Variable;
		reference.label = m[1].trim();
		completions.push(reference);
		connection.onCompletion((): CompletionItem[] => { return [reference] });
		// completionProvider.provideCompletionItems(, textDocument.positionAt(textDocument.lineCount),  m[1].trim(), textDocument);
		// break;
	}


	while (patterns.constant.test.test(text) && (m = patterns.constant.exec.exec(text))) {
		let reference = CompletionItem.create(m[1].trim());
		reference.kind = CompletionItemKind.Constant;
		connection.onCompletion((): CompletionItem[] => { return [reference] });
		// break;
	}
}


connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

const completionProvider = new AsmXCompletionProvider();

connection.onDidOpenTextDocument((params) => {
	const document = documents.get(params.textDocument.uri);
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		// const  completionItems = completionProvider.provideCompletionItems(textDocument, textDocument.positionAt(_textDocumentPosition.position))
		// The pass parameter contains the position of the text document in
		// which code complete got requested. For the example we ignore this
		// info and always provide the same completion items.
		return [
			{
				label: '$ret',
				kind: CompletionItemKind.Constant,
				data: 1
			},

			{
				label: '$urt',
				kind: CompletionItemKind.Constant,
				data: 2
			}

			// ...completions
		];
	}
);




// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		switch (item.data) {
			case 1:
				item.detail = 'Register details'
				item.documentation = 'This register is the value that the instruction changes during or at the beginning of its execution.';
				break;

			case 2:
				item.detail = 'Register details';
				item.documentation = 'This register is the value that the function returns at the time or beginning of its execution.';
				break;
		
			default:
				break;
		}

		return item;
	}
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();