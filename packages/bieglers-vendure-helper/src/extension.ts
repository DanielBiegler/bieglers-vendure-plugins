import * as vscode from 'vscode';

type CustomQuickPickItem = vscode.QuickPickItem & {
	id?: string
	uri: vscode.Uri
};

function quickPickItemsFromMarkdown(md: string): CustomQuickPickItem[] {
	if (md === "") return [];

	const lines = md.split('\n');
	const items: CustomQuickPickItem[] = [];

	for (const line of lines) {
		const match = line.match(/\[(.+?)\]\((https?:\/\/[^\s)]+)\): (.*)/);
		if (!match) continue;

		const [, label, url, description] = match;
		const uri = vscode.Uri.parse(url, true);

		items.push({
			label: label,
			description: url,
			detail: label === description ? undefined : description,
			uri,
			/**
			 * Important: Currently its impossible to disable matching on the label,
			 * this is an issue because it hides items when the filter contains a space for example.
			 * By always showing everything we can get around this and custom filter the items.
			 * @see https://github.com/microsoft/vscode/issues/90521
			 */
			alwaysShow: true,
		});
	}

	return items;
}

async function fetchLlmMarkdown(): Promise<string> {
	const res = await fetch("https://docs.vendure.io/llms.txt");

	if (res.ok) return res.text()
	else {
		vscode.window.showErrorMessage("Failed to fetch documentation.");
		return "";
	}
}

export async function activate(context: vscode.ExtensionContext) {
	const ID_DIRECT_SEARCH = "direct_search";
	const markdown = await fetchLlmMarkdown();
	const items = quickPickItemsFromMarkdown(markdown);
	items.push({
		id: ID_DIRECT_SEARCH,
		label: "Search directly for input",
		alwaysShow: true,
		uri: vscode.Uri.parse("https://docs.vendure.io/search", true),
		description: "https://docs.vendure.io/search",
	});

	const disposable = vscode.commands.registerCommand("bieglers-vendure-helper.docSearch", async (args) => {

		// Tried moving the quick pick creation outside the command, but it doesn't work as expected,
		// the selectable items just disappear after the first use, fair enough we can still leave the 
		// expensive call to generate the items outside, that seems to work.
		const quickPick = vscode.window.createQuickPick<CustomQuickPickItem>();
		quickPick.title = "Search for Vendure Docs";
		quickPick.placeholder = "Type to filter...";
		quickPick.ignoreFocusOut = true;
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.items = items;

		// Consider debouncing if the list gets large
		// Tested on my 8 year old laptop and search is snappy for 765 links
		// Debouncing doesnt seem necessary (yet)
		quickPick.onDidChangeValue((value) => {
			if (!value) return quickPick.items = items;
			quickPick.busy = true;

			const searchTerms = value.toLowerCase().split(/\s+/).filter(t => t !== '');

			const customFiltered = items.filter(item => {
				if (item.id === ID_DIRECT_SEARCH) return true;

				const allMatchLabel = searchTerms.every(term => item.label.toLowerCase().includes(term));
				if (allMatchLabel) return true;

				// We prefer matching detail over descr. because we put the URL in the descr.
				const allMatchDetail = searchTerms.every(term => item.detail?.toLowerCase().includes(term));
				if (allMatchDetail) return true;

				const allMatchDescription = searchTerms.every(term => item.description?.toLowerCase().includes(term));
				if (allMatchDescription) return true;
			});

			quickPick.busy = false;
			quickPick.items = customFiltered;
		});

		quickPick.onDidAccept(() => {
			const selected = quickPick.selectedItems[0];
			if (selected) {
				const uri = selected.id === ID_DIRECT_SEARCH
					? selected.uri.with({ query: `q=${quickPick.value}` })
					: selected.uri;
				vscode.env.openExternal(uri);
			}
			quickPick.hide();
		});

		quickPick.onDidHide(() => {
			quickPick.dispose();
		});

		const editor = vscode.window.activeTextEditor;
		if (editor) {
			quickPick.value = editor.document.getText(editor.selection);
		}

		quickPick.show();
	});

	context.subscriptions.push(disposable);
}

export function deactivate() { }
