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

describe("cache warming settings", () => {
	let agentDirectory: string;
	let userDataDirectory: string;

	beforeEach(async () => {
		agentDirectory = await mkdtemp(path.join(tmpdir(), "codepiddy-cache-warming-agent-"));
		userDataDirectory = await mkdtemp(path.join(tmpdir(), "codepiddy-cache-warming-userdata-"));
		process.env.PI_CODING_AGENT_DIR = agentDirectory;
	});

	afterEach(async () => {
		delete process.env.PI_CODING_AGENT_DIR;
		await rm(agentDirectory, { recursive: true, force: true });
		await rm(userDataDirectory, { recursive: true, force: true });
	});

	it("defaults to streaming with cache miss notices off", async () => {
		const store = new AppSettingsStore(userDataDirectory);
		expect(await store.getCacheWarmingSettings()).toEqual({ mode: "streaming", showCacheMissNotices: false });
	});

	it("writes both fields without dropping unrelated settings", async () => {
		const settingsPath = path.join(agentDirectory, "settings.json");
		await writeFile(settingsPath, JSON.stringify({ theme: "dark", cacheWarming: "idle" }), "utf8");
		const store = new AppSettingsStore(userDataDirectory);
		await store.setCacheWarmingSettings({ mode: "off", showCacheMissNotices: true });
		const written = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
		expect(written).toEqual({ theme: "dark", cacheWarming: "off", showCacheMissNotices: true });
	});

	it("falls back to streaming when the stored mode is invalid", async () => {
		await writeFile(
			path.join(agentDirectory, "settings.json"),
			JSON.stringify({ cacheWarming: "turbo", showCacheMissNotices: true }),
			"utf8",
		);
		const store = new AppSettingsStore(userDataDirectory);
		expect(await store.getCacheWarmingSettings()).toEqual({ mode: "streaming", showCacheMissNotices: true });
	});
});
