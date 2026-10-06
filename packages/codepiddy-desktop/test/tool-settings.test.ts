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
		expect(await store.getToolSettings()).toEqual({ defaultTools: null });
	});

	it("writes defaultTools without dropping unrelated settings", async () => {
		const settingsPath = path.join(agentDirectory, "settings.json");
		await writeFile(settingsPath, JSON.stringify({ theme: "dark", retry: { maxRetries: 4 } }), "utf8");
		const store = new AppSettingsStore(userDataDirectory);
		await store.setToolSettings({ defaultTools: ["read", "powershell", "edit"] });
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
		await store.setToolSettings({ defaultTools: null });
		const written = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
		expect(written).toEqual({ theme: "dark" });
	});

	it("filters unknown names when reading an existing config", async () => {
		await writeFile(
			path.join(agentDirectory, "settings.json"),
			JSON.stringify({ defaultTools: ["read", "unknown", "read", "ls"] }),
			"utf8",
		);
		const store = new AppSettingsStore(userDataDirectory);
		expect(await store.getToolSettings()).toEqual({ defaultTools: ["read", "ls"] });
	});

	it("excludes unselected built-ins from the Agent tool registry", async () => {
		const store = new AppSettingsStore(userDataDirectory);
		expect(await store.getBuiltinToolExclusions()).toEqual(["powershell", "grep", "find", "ls"]);

		await store.setToolSettings({
			defaultTools: ["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"],
		});
		expect(await store.getBuiltinToolExclusions()).toEqual([]);
	});
});
