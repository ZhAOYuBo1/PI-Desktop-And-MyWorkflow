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

import { parseShellCommandPrefix } from "../src/main/ipc-validation.ts";
import { AppSettingsStore } from "../src/main/settings-store.ts";

describe("shell command prefix settings", () => {
	let agentDirectory: string;
	let userDataDirectory: string;

	beforeEach(async () => {
		agentDirectory = await mkdtemp(path.join(tmpdir(), "codepiddy-shell-prefix-agent-"));
		userDataDirectory = await mkdtemp(path.join(tmpdir(), "codepiddy-shell-prefix-userdata-"));
		process.env.PI_CODING_AGENT_DIR = agentDirectory;
	});

	afterEach(async () => {
		delete process.env.PI_CODING_AGENT_DIR;
		await rm(agentDirectory, { recursive: true, force: true });
		await rm(userDataDirectory, { recursive: true, force: true });
	});

	it("returns null when no command prefix is configured", async () => {
		const store = new AppSettingsStore(userDataDirectory);
		expect(await store.getShellCommandPrefix()).toBeNull();
	});

	it("writes shellCommandPrefix without dropping unrelated settings", async () => {
		const settingsPath = path.join(agentDirectory, "settings.json");
		await writeFile(settingsPath, JSON.stringify({ theme: "dark", shellPath: "/usr/bin/bash" }), "utf8");
		const store = new AppSettingsStore(userDataDirectory);

		await store.setShellCommandPrefix("shopt -s expand_aliases\nsource ~/.bashrc");

		const written = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
		expect(written).toEqual({
			theme: "dark",
			shellPath: "/usr/bin/bash",
			shellCommandPrefix: "shopt -s expand_aliases\nsource ~/.bashrc",
		});
	});

	it("clears the field while preserving unrelated settings", async () => {
		const settingsPath = path.join(agentDirectory, "settings.json");
		await writeFile(
			settingsPath,
			JSON.stringify({
				theme: "dark",
				shellCommandPrefix: "shopt -s expand_aliases",
				cacheWarming: "idle",
			}),
			"utf8",
		);
		const store = new AppSettingsStore(userDataDirectory);

		await store.setShellCommandPrefix("   ");

		const written = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
		expect(written).toEqual({ theme: "dark", cacheWarming: "idle" });
	});

	it("normalizes line endings and rejects NUL input", () => {
		expect(parseShellCommandPrefix("shopt -s expand_aliases\r\nsource ~/.bashrc\r")).toBe(
			"shopt -s expand_aliases\nsource ~/.bashrc\n",
		);
		expect(() => parseShellCommandPrefix("echo\0bad")).toThrow("非法字符");
	});
});
