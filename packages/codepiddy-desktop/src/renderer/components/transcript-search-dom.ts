import { transcriptSearchMatchRanges } from "./transcript-search.ts";

const NON_CONTENT_SELECTOR = "button, textarea, input, [aria-hidden='true'], .transcript-search-bar";

function textNodes(root: HTMLElement): Array<{ node: Text; start: number; end: number }> {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode: (node) =>
			node.parentElement?.closest(NON_CONTENT_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
	});
	const nodes: Array<{ node: Text; start: number; end: number }> = [];
	let text = "";
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const start = text.length;
		text += node.textContent ?? "";
		nodes.push({ node: node as Text, start, end: text.length });
	}
	return nodes;
}

export function transcriptSearchRanges(root: HTMLElement, query: string): Range[] {
	const nodes = textNodes(root);
	const text = nodes.map((entry) => entry.node.textContent ?? "").join("");
	return transcriptSearchMatchRanges(text, query).flatMap(([start, end]) => {
		const first = nodes.find((part) => part.end > start);
		const last = nodes.find((part) => part.end >= end && part.start < end);
		if (!first || !last) return [];
		const range = document.createRange();
		range.setStart(first.node, start - first.start);
		range.setEnd(last.node, end - last.start);
		return [range];
	});
}
