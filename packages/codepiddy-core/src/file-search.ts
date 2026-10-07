import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { WORKSPACE_TRASH_DIR_NAME } from "@codepiddy/shared";

const ignoredDirectories = new Set([
	".git",
	"node_modules",
	"dist",
	"build",
	"coverage",
	".next",
	".cache",
	WORKSPACE_TRASH_DIR_NAME,
]);

export async function searchProjectFiles(projectRoot: string, query: string, limit = 50): Promise<string[]> {
	const root = path.resolve(projectRoot);
	const normalizedQuery = query.trim().toLowerCase();
	const results: string[] = [];
	const pending = [root];
	let visited = 0;
	while (pending.length > 0 && results.length < limit && visited < 5000) {
		const directory = pending.shift();
		if (!directory) break;
		let entries: Dirent[];
		try {
			entries = await readdir(directory, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			visited += 1;
			if (entry.isDirectory()) {
				if (!ignoredDirectories.has(entry.name)) pending.push(path.join(directory, entry.name));
				continue;
			}
			if (!entry.isFile()) continue;
			const relativePath = path.relative(root, path.join(directory, entry.name)).split(path.sep).join("/");
			if (!normalizedQuery || relativePath.toLowerCase().includes(normalizedQuery)) results.push(relativePath);
			if (results.length >= limit) break;
		}
	}
	return results.sort((left, right) => {
		const leftName = path.posix.basename(left).toLowerCase();
		const rightName = path.posix.basename(right).toLowerCase();
		const leftStarts = leftName.startsWith(normalizedQuery) ? 0 : 1;
		const rightStarts = rightName.startsWith(normalizedQuery) ? 0 : 1;
		return leftStarts - rightStarts || left.length - right.length || left.localeCompare(right);
	});
}
