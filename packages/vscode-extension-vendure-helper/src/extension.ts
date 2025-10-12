import * as vscode from 'vscode';

const ID_DIRECT_SEARCH = "direct_search";
const URI_SEARCH = vscode.Uri.parse("https://docs.vendure.io/search", true);
const TOOLTIP_REMOVE_RECENT = "Remove from recently picked list";
const TOOLTIP_COPY_URL = "Copy URL to clipboard (CTRL+C)";

const buttonRecentResult: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon("close"), tooltip: TOOLTIP_REMOVE_RECENT };
const buttonCopyUri: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon("copy"), tooltip: TOOLTIP_COPY_URL };

type CustomQuickPickItem = vscode.QuickPickItem & {
	id?: string
	uri?: vscode.Uri
};

type RecentResults = Set<CustomQuickPickItem>;

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
			buttons: [buttonCopyUri],
			/**
			 * Important: Currently its impossible to disable matching on the label,
			 * this is an issue because it hides items when the filter contains a space for example.
			 * By always showing everything we can get around this and custom filter the items.
			 * @see https://github.com/microsoft/vscode/issues/90521
			 */
			alwaysShow: true,
		});
	}

	items.push({
		id: ID_DIRECT_SEARCH,
		label: "Search directly for input",
		alwaysShow: true,
		uri: URI_SEARCH,
		description: URI_SEARCH.toString(),
		buttons: [buttonCopyUri]
	});

	return items;
}

async function fetchLlmMarkdown(): Promise<string> {
	const res = await fetch("https://docs.vendure.io/llms.txt");

	if (res.ok) return res.text()
	else {
		vscode.window.showErrorMessage(`Failed to fetch documentation from ${URI_SEARCH.authority}. Try reloading the extension.`);
		return "";
	}
}

function genQuickPickItems(
	recent: Set<CustomQuickPickItem>,
	items: CustomQuickPickItem[]
): CustomQuickPickItem[] {
	// Could allocate with a size
	const output: CustomQuickPickItem[] = [];

	if (recent.size > 0) {
		output.push({
			label: "Recently picked",
			kind: vscode.QuickPickItemKind.Separator,
		});

		// Reversing allows us to show last inserted items first because Sets iterate in insertion-order
		output.push(...[...recent].reverse());

		output.push({
			label: "",
			kind: vscode.QuickPickItemKind.Separator,
		});
	}

	output.push(...items);

	return output;
}

async function handleCopyCommand(
	quickPick: vscode.QuickPick<CustomQuickPickItem>,
	item: CustomQuickPickItem,
	recentResults: RecentResults
) {
	if (item.uri) {
		await vscode.env.clipboard.writeText(item.uri.toString());
		vscode.window.showInformationMessage(`Copied "${item.label}"-URL to clipboard!`);
		quickPick.hide();
		await handleAddToRecentResult(recentResults, item);
	} else {
		vscode.window.showErrorMessage(`Undefined URI from QuickPick Item: ${item}`);
	}
}

async function handleAddToRecentResult(
	recentResults: RecentResults,
	item: CustomQuickPickItem
) {
	// Delete + Add because Sets iterate in insertion-order, see `genQuickPickItems`
	recentResults.delete(item);
	recentResults.add(item);
	// Once added, needs to be removed in `onDidTriggerItemButton`
	if (!item.buttons?.find(b => b.tooltip === TOOLTIP_REMOVE_RECENT))
		item.buttons = item.buttons?.concat(buttonRecentResult);
}

export async function activate(context: vscode.ExtensionContext) {
	const recentResults: RecentResults = new Set();
	const markdown = await fetchLlmMarkdown();
	const items = quickPickItemsFromMarkdown(markdown);
	let currentQuickPick: vscode.QuickPick<CustomQuickPickItem> | null = null;

	const disposableSearch = vscode.commands.registerCommand("bieglers-vendure-helper.docSearch", async (args) => {

		// Tried moving the quick pick creation outside the command, but it doesn't work as expected,
		// the selectable items just disappear after the first use, fair enough we can still leave the 
		// expensive call to generate the items outside, that seems to work.
		const quickPick = vscode.window.createQuickPick<CustomQuickPickItem>();
		quickPick.title = "Search for Vendure Docs";
		quickPick.placeholder = "Type to filter...";
		quickPick.ignoreFocusOut = true;
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.items = genQuickPickItems(recentResults, items);
		currentQuickPick = quickPick;

		// Consider debouncing if the list gets large
		// Tested on my 8 year old laptop and search is snappy for 765 links
		// Debouncing doesnt seem necessary (yet)
		quickPick.onDidChangeValue((value) => {
			if (!value) return quickPick.items = genQuickPickItems(recentResults, items);
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
				handleAddToRecentResult(recentResults, selected);

				const uri = selected.id === ID_DIRECT_SEARCH
					? selected.uri?.with({ query: `q=${quickPick.value}` })
					: selected.uri;

				if (uri) vscode.env.openExternal(uri)
				else vscode.window.showErrorMessage("Selected item has no configured URI");
			}
			quickPick.hide();
		});

		quickPick.onDidTriggerItemButton(async e => {
			switch (e.button.tooltip) {
				case TOOLTIP_REMOVE_RECENT:
					recentResults.delete(e.item);
					if (e.item.buttons) e.item.buttons = e.item.buttons.filter(b => b.tooltip !== TOOLTIP_REMOVE_RECENT);
					quickPick.items = genQuickPickItems(recentResults, items);
					break;

				case TOOLTIP_COPY_URL:
					handleCopyCommand(quickPick, e.item, recentResults);
					break;

				default:
					vscode.window.showErrorMessage(`Unimplemented Trigger For Item Button: ${e.button}`);
			}
		});

		quickPick.onDidHide(() => {
			currentQuickPick = null;
			quickPick.dispose();
		});

		const editor = vscode.window.activeTextEditor;
		if (editor) {
			quickPick.value = editor.document.getText(editor.selection);
		}

		quickPick.show();
	});

	const disposableCopy = vscode.commands.registerCommand('bieglers-vendure-helper.copyDocUri', async () => {
		if (currentQuickPick && currentQuickPick.activeItems.length > 0) {
			const item = currentQuickPick.activeItems[0];
			handleCopyCommand(currentQuickPick, item, recentResults);
		}
	});

	context.subscriptions.push(disposableSearch);
	context.subscriptions.push(disposableCopy);
}

export function deactivate() { }
