import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WORKSPACE_TRASH_DIR_NAME } from "@codepiddy/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { searchProjectFiles } from "../../codepiddy-core/src/file-search.ts";
import {
	copyWorkspaceEntry,
	createWorkspaceEntry,
	deleteWorkspaceEntry,
	listWorkspaceDir,
	readWorkspaceFile,
	renameWorkspaceEntry,
	statWorkspaceFile,
	writeWorkspaceFile,
} from "../../codepiddy-core/src/workspace-fs.ts";

describe("workspace file operations", () => {
	let projectRoot: string;

	beforeEach(async () => {
		projectRoot = await mkdtemp(path.join(tmpdir(), "codepiddy-workspace-"));
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("creates, writes, renames and deletes entries", async () => {
		await createWorkspaceEntry(projectRoot, "notes.txt", "file");
		await writeWorkspaceFile(projectRoot, "notes.txt", "hello");
		expect((await readWorkspaceFile(projectRoot, "notes.txt")).content).toBe("hello");

		await renameWorkspaceEntry(projectRoot, "notes.txt", "renamed.txt");
		expect((await listWorkspaceDir(projectRoot, "")).map((entry) => entry.name)).toEqual(["renamed.txt"]);

		await deleteWorkspaceEntry(projectRoot, "renamed.txt");
		await expect(statWorkspaceFile(projectRoot, "renamed.txt")).rejects.toThrow();
	});

	it("copies files and reports a destination collision", async () => {
		await writeFile(path.join(projectRoot, "source.txt"), "source", "utf8");
		await writeFile(path.join(projectRoot, "target.txt"), "target", "utf8");

		const collision = await copyWorkspaceEntry(projectRoot, "source.txt", "target.txt", false);
		expect(collision.exists).toBe(true);
		expect(await readFile(path.join(projectRoot, "target.txt"), "utf8")).toBe("target");

		const copied = await copyWorkspaceEntry(projectRoot, "source.txt", "copy.txt", false);
		expect(copied.relativePath).toBe("copy.txt");
		expect(await readFile(path.join(projectRoot, "copy.txt"), "utf8")).toBe("source");
	});

	it("rejects path traversal", async () => {
		await expect(writeWorkspaceFile(projectRoot, "../escape.txt", "nope")).rejects.toThrow("路径超出项目范围");
	});

	it("returns file metadata", async () => {
		await writeFile(path.join(projectRoot, "meta.txt"), "meta", "utf8");
		const metadata = await statWorkspaceFile(projectRoot, "meta.txt");
		const fileStat = await stat(path.join(projectRoot, "meta.txt"));
		expect(metadata.size).toBe(fileStat.size);
		expect(metadata.mtimeMs).toBe(fileStat.mtimeMs);
	});

	it("hides the workspace trash directory from listings and search", async () => {
		await createWorkspaceEntry(projectRoot, WORKSPACE_TRASH_DIR_NAME, "dir");
		await writeFile(path.join(projectRoot, WORKSPACE_TRASH_DIR_NAME, "deleted.txt"), "hidden", "utf8");
		await writeFile(path.join(projectRoot, "visible.txt"), "visible", "utf8");

		expect((await listWorkspaceDir(projectRoot, "")).map((entry) => entry.name)).toEqual(["visible.txt"]);
		expect(await searchProjectFiles(projectRoot, "deleted")).toEqual([]);
		expect(await searchProjectFiles(projectRoot, "visible")).toEqual(["visible.txt"]);
	});
});
