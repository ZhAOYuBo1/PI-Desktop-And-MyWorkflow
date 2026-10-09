/**
 * Transcript search stays renderer-local: it searches the already-loaded
 * session entries and paints browser ranges without mutating React-owned DOM.
 */

export interface TranscriptSearchItem {
	id: string;
	type: string;
	text?: string;
	thinking?: string;
	parts?: Array<{ type: string; text?: string; name?: string; args?: string }>;
	name?: string;
	args?: string;
	summary?: string;
	replacement?: string;
}

export interface TranscriptSearchMatch {
	itemId: string;
	text: string;
}

export function foldTranscriptSearchText(text: string): string {
	return text.toLowerCase();
}

export function transcriptSearchMatchRanges(text: string, query: string): Array<[number, number]> {
	const needle = foldTranscriptSearchText(query.trim());
	if (!needle) return [];
	const folded = foldTranscriptSearchText(text);
	const starts: number[] = [];
	const ends: number[] = [];
	if (folded.length !== text.length) {
		let original = 0;
		for (const character of text) {
			const end = original + character.length;
			for (let index = 0; index < character.toLowerCase().length; index += 1) {
				starts.push(original);
				ends.push(end);
			}
			original = end;
		}
	}
	const ranges: Array<[number, number]> = [];
	let from = 0;
	while (from < folded.length) {
		const index = folded.indexOf(needle, from);
		if (index < 0) break;
		const start = starts.length ? starts[index] : index;
		const end = ends.length ? ends[index + needle.length - 1] : index + needle.length;
		const previous = ranges.at(-1);
		if (previous && start < previous[1]) previous[1] = end;
		else ranges.push([start, end]);
		from = index + needle.length;
	}
	return ranges;
}

export function transcriptItemSearchText(item: TranscriptSearchItem): string {
	const values: string[] = [];
	if (item.text) values.push(item.text);
	if (item.thinking) values.push(item.thinking);
	if (item.name) values.push(item.name);
	if (item.args) values.push(item.args);
	if (item.summary) values.push(item.summary);
	if (item.replacement) values.push(item.replacement);
	for (const part of item.parts ?? []) {
		if (part.text) values.push(part.text);
		if (part.name) values.push(part.name);
		if (part.args) values.push(part.args);
	}
	return values.join("\n");
}

export function transcriptItemMatches(item: TranscriptSearchItem, query: string): boolean {
	const needle = query.trim();
	return needle.length > 0 && transcriptItemSearchText(item).toLowerCase().includes(needle.toLowerCase());
}

export function findTranscriptSearchMatches(items: TranscriptSearchItem[], query: string): TranscriptSearchMatch[] {
	const needle = query.trim();
	if (!needle) return [];
	return items.flatMap((item) =>
		transcriptItemMatches(item, needle) ? [{ itemId: item.id, text: transcriptItemSearchText(item) }] : [],
	);
}
