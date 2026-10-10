import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
	safeStorage: {
		isEncryptionAvailable: () => false,
		decryptString: () => "",
		encryptString: () => Buffer.from(""),
	},
}));

import { parseToolSettings } from "../src/main/ipc-validation.ts";
import { AppSettingsStore } from "../src/main/settings-store.ts";

describe("tool settings", () => {
	let agentDirectory: string;
	let userDataDirectory: string;

	beforeEach(async () => {
		agentDirectory = await mkdtemp(path.join(tmpdir(), "codepiddy-tools-agent-"));
		userDataDirectory = await mkdtemp(path.join(tmpdir(), "codepiddy-tools-userdata-"));
		process.env.PI_CODING_AGENT_DIR = agentDirectory;
	});

	afterEach(async () => {
		delete process.env.PI_CODING_AGENT_DIR;
		await rm(agentDirectory, { recursive: true, force: true });
		await rm(userDataDirectory, { recursive: true, force: true });
	});

	it("uses the Pi default tool set when settings are absent", async () => {
		const store = new AppSettingsStore(userDataDirectory);
		expect(await store.getToolSettings()).toEqual({ defaultTools: null, advancedDefaultTools: null });
	});

	it("writes defaultTools without dropping unrelated settings", async () => {
		const settingsPath = path.join(agentDirectory, "settings.json");
		await writeFile(settingsPath, JSON.stringify({ theme: "dark", retry: { maxRetries: 4 } }), "utf8");
		const store = new AppSettingsStore(userDataDirectory);
		await store.setToolSettings({ defaultTools: ["read", "powershell", "edit"], advancedDefaultTools: null });
		const written = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
		expect(written).toEqual({
			theme: "dark",
			retry: { maxRetries: 4 },
			defaultTools: ["read", "powershell", "edit"],
		});
	});

	it("removes defaultTools when restoring the Pi default", async () => {
		const settingsPath = path.join(agentDirectory, "settings.json");
		await writeFile(
			settingsPath,
			JSON.stringify({ theme: "dark", defaultTools: ["read", "bash", "edit", "write"] }),
			"utf8",
		);
		const store = new AppSettingsStore(userDataDirectory);
		await store.setToolSettings({ defaultTools: null, advancedDefaultTools: null });
		const written = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
		expect(written).toEqual({ theme: "dark" });
	});

	it("preserves Pi 1.1 advanced defaultTools and resolves built-in exclusions", async () => {
		const settingsPath = path.join(agentDirectory, "settings.json");
		await writeFile(
			settingsPath,
			JSON.stringify({ keep: true, defaultTools: ["+grep", "-write", "+codemode"] }),
			"utf8",
		);
		const store = new AppSettingsStore(userDataDirectory);

		const tools = await store.getToolSettings();
		expect(tools.defaultTools).toEqual(["read", "bash", "edit", "grep"]);
		expect(tools.advancedDefaultTools).toEqual(["+grep", "-write", "+codemode"]);
		expect(await store.getBuiltinToolExclusions()).toEqual(["powershell", "write", "find", "ls"]);

		await store.setToolSettings(
			parseToolSettings({
				defaultTools: ["read", "bash", "edit", "grep"],
				advancedDefaultTools: null,
			}),
		);
		const converted = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
		expect(converted.keep).toBe(true);
		expect(converted.defaultTools).toEqual(["read", "bash", "edit", "grep"]);
	});

	it("writes advanced Pi entries without filtering them", async () => {
		const settingsPath = path.join(agentDirectory, "settings.json");
		const store = new AppSettingsStore(userDataDirectory);
		await store.setToolSettings(
			parseToolSettings({
				defaultTools: null,
				advancedDefaultTools: ["+codemode", "-write"],
			}),
		);

		const written = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
		expect(written.defaultTools).toEqual(["+codemode", "-write"]);
		expect(() => parseToolSettings({ defaultTools: null, advancedDefaultTools: [1] })).toThrow("Pi 高级工具项");
	});

	it("excludes unselected built-ins from the Agent tool registry", async () => {
		const store = new AppSettingsStore(userDataDirectory);
		expect(await store.getBuiltinToolExclusions()).toEqual(["powershell", "grep", "find", "ls"]);

		await store.setToolSettings({
			defaultTools: ["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"],
			advancedDefaultTools: null,
		});
		expect(await store.getBuiltinToolExclusions()).toEqual([]);
	});
	it("treats an explicit empty defaultTools list as no built-in tools", async () => {
		const settingsPath = path.join(agentDirectory, "settings.json");
		await writeFile(settingsPath, JSON.stringify({ defaultTools: [] }), "utf8");
		const store = new AppSettingsStore(userDataDirectory);
		expect(await store.getToolSettings()).toEqual({ defaultTools: [], advancedDefaultTools: null });
		expect(await store.getBuiltinToolExclusions()).toEqual([
			"read",
			"bash",
			"powershell",
			"edit",
			"write",
			"grep",
			"find",
			"ls",
		]);
	});
});
