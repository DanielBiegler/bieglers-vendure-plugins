import * as vscode from 'vscode';

type CustomQuickPickItem = vscode.QuickPickItem & {
	id?: string
	uri?: vscode.Uri
};

type RecentResults = Set<CustomQuickPickItem>;

const ID_DIRECT_SEARCH = "direct_search";
const URI_SEARCH = vscode.Uri.parse("https://docs.vendure.io/search", true);
// Since VSCode needs to restart entirely we can use these globally
const TOOLTIP_REMOVE_RECENT = vscode.l10n.t("Remove from recently picked list");
const TOOLTIP_COPY_URL = vscode.l10n.t("Copy URL to clipboard (CTRL/CMD+C)");

const buttonRecentResult: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon("close"), tooltip: TOOLTIP_REMOVE_RECENT };
const buttonCopyUri: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon("copy"), tooltip: TOOLTIP_COPY_URL };

// Appearantly in the year 2025 there is no such advanced alien technology
// to let extensions display file-icons in a quickpicker, eventhough
// the same icons are already being rendered in the quick-open file picker,
// so we have to fallback to using default codicon icons for now.
// See https://github.com/microsoft/vscode/issues/59826
const iconApiGql = new vscode.ThemeIcon("type-hierarchy-sub");
const iconApiTs = new vscode.ThemeIcon("json");
const iconDashboard = new vscode.ThemeIcon("dashboard");
const iconFallback = new vscode.ThemeIcon("circle-small");
const iconGuides = new vscode.ThemeIcon("mortar-board");
const iconReference = new vscode.ThemeIcon("file-code");
const iconSearch = new vscode.ThemeIcon("search-fuzzy");

function getIconByUri(uri: vscode.Uri): vscode.IconPath {
	if (uri.path.includes("/typescript-api")) return iconApiTs;
	if (uri.path.includes("/graphql-api")) return iconApiGql;
	if (uri.path.includes("/guides")) return iconGuides;
	if (uri.path.includes("/dashboard/")) return iconDashboard;
	if (uri.path.includes("/reference")) return iconReference;
	if (uri.path.includes("/user-guide")) return iconGuides;

	return iconFallback;
}

function quickPickItemsFromMarkdown(md: string): CustomQuickPickItem[] {
	if (md === "") return [];

	const lines = md.split('\n');
	const items: CustomQuickPickItem[] = [];

	for (const line of lines) {
		const match = line.match(/\[(.+?)\]\((https?:\/\/[^\s)]+)\): (.*)/);
		if (!match) continue;

		const [, label, url, description] = match;
		const uri = vscode.Uri.parse(url, true);
		// Sometimes the description is just the label, no need to include this
		const hasDescription = label.trim().toLowerCase() !== description.trim().toLowerCase();

		items.push({
			label: label,
			description: url,
			detail: hasDescription ? description : undefined,
			uri,
			buttons: [buttonCopyUri],
			iconPath: getIconByUri(uri),
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
		label: vscode.l10n.t("Search directly for input"),
		alwaysShow: true,
		uri: URI_SEARCH,
		description: URI_SEARCH.toString(),
		buttons: [buttonCopyUri],
		iconPath: iconSearch,
	});

	return items;
}

async function fetchLlmMarkdown(): Promise<string> {
	const res = await fetch(`https://${URI_SEARCH.authority}/llms.txt`);

	if (res.ok) return res.text()
	else {
		vscode.window.showErrorMessage(vscode.l10n.t(
			`Failed to fetch documentation from {domain}. Try reloading the extension.`,
			{ domain: URI_SEARCH.authority }
		));
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
			label: vscode.l10n.t("Recently picked"),
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
	if (!item.uri)
		return void await vscode.window.showErrorMessage(`Undefined URI from QuickPick Item: ${item}`);

	const toCopyUri = item.id === ID_DIRECT_SEARCH ? genSearchUri(item.uri, quickPick.value) : item.uri;

	await vscode.env.clipboard.writeText(toCopyUri.toString());
	vscode.window.showInformationMessage(vscode.l10n.t(
		'Copied "{label}"-URL to clipboard!',
		{ label: item.label }
	));
	quickPick.hide();
	await handleAddToRecentResult(recentResults, item);
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

function genSearchUri(uri: vscode.Uri, value: string): vscode.Uri {
	return uri.with({ query: `q=${value}` });
}

function shouldOpenInternally() {
	return vscode.workspace.getConfiguration('bieglers-vendure-helper-vscode-extension').get<boolean>("openInternally");
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
		quickPick.title = vscode.l10n.t("Search for Vendure Docs");
		quickPick.placeholder = vscode.l10n.t("Type to filter...");
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
				if (item.detail) {
					const allMatchDetail = searchTerms.every(term => item.detail?.toLowerCase().includes(term));
					if (allMatchDetail) return true;
				}

				if (item.description) {
					const allMatchDescription = searchTerms.every(term => item.description?.toLowerCase().includes(term));
					if (allMatchDescription) return true;
				}
			});

			quickPick.busy = false;
			quickPick.items = customFiltered;
		});

		quickPick.onDidAccept(() => {
			const selected = quickPick.selectedItems[0];
			if (selected) {
				handleAddToRecentResult(recentResults, selected);

				const uri = selected.id === ID_DIRECT_SEARCH && selected.uri
					? genSearchUri(selected.uri, quickPick.value)
					: selected.uri;

				if (uri) {
					if (shouldOpenInternally()) vscode.commands.executeCommand("simpleBrowser.show", uri)
					else vscode.env.openExternal(uri)
				}
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

	context.subscriptions.push(
		disposableSearch,
		disposableCopy,
	);
}

export function deactivate() { }
