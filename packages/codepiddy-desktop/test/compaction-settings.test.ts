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

describe("context compaction settings", () => {
	let agentDirectory: string;
	let userDataDirectory: string;

	beforeEach(async () => {
		agentDirectory = await mkdtemp(path.join(tmpdir(), "codepiddy-compaction-agent-"));
		userDataDirectory = await mkdtemp(path.join(tmpdir(), "codepiddy-compaction-userdata-"));
		process.env.PI_CODING_AGENT_DIR = agentDirectory;
	});

	afterEach(async () => {
		delete process.env.PI_CODING_AGENT_DIR;
		await rm(agentDirectory, { recursive: true, force: true });
		await rm(userDataDirectory, { recursive: true, force: true });
	});

	it("uses Pi defaults when settings are absent", async () => {
		const store = new AppSettingsStore(userDataDirectory);
		expect(await store.getContextCompactionSettings()).toEqual({
			compaction: {
				enabled: true,
				reserveTokens: 16384,
				keepRecentTokens: 20000,
				modelOverrides: {},
			},
			branchSummary: {
				reserveTokens: 16384,
				skipPrompt: false,
			},
		});
	});

	it("writes both sections without dropping unrelated settings", async () => {
		const settingsPath = path.join(agentDirectory, "settings.json");
		await writeFile(
			settingsPath,
			JSON.stringify({
				theme: "dark",
				compaction: { enabled: false, futureField: "keep" },
				branchSummary: { futureField: true },
			}),
			"utf8",
		);
		const store = new AppSettingsStore(userDataDirectory);
		await store.setContextCompactionSettings({
			compaction: {
				enabled: true,
				reserveTokens: 24000,
				keepRecentTokens: 30000,
				modelOverrides: {
					"openai/gpt-5.5": { reserveTokens: 12000 },
				},
			},
			branchSummary: {
				reserveTokens: 18000,
				skipPrompt: true,
			},
		});
		const written = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
		expect(written).toEqual({
			theme: "dark",
			compaction: {
				enabled: true,
				futureField: "keep",
				reserveTokens: 24000,
				keepRecentTokens: 30000,
				modelOverrides: {
					"openai/gpt-5.5": { reserveTokens: 12000 },
				},
			},
			branchSummary: {
				futureField: true,
				reserveTokens: 18000,
				skipPrompt: true,
			},
		});
	});

	it("normalizes invalid values when reading", async () => {
		await writeFile(
			path.join(agentDirectory, "settings.json"),
			JSON.stringify({
				compaction: {
					enabled: false,
					reserveTokens: -1,
					keepRecentTokens: "large",
					modelOverrides: {
						"openai/gpt-5.5": { reserveTokens: 9000, keepRecentTokens: -4 },
						"invalid-model": { reserveTokens: 5000 },
					},
				},
				branchSummary: { reserveTokens: 0, skipPrompt: true },
			}),
			"utf8",
		);
		const store = new AppSettingsStore(userDataDirectory);
		expect(await store.getContextCompactionSettings()).toEqual({
			compaction: {
				enabled: false,
				reserveTokens: 16384,
				keepRecentTokens: 20000,
				modelOverrides: {
					"openai/gpt-5.5": { reserveTokens: 9000 },
				},
			},
			branchSummary: {
				reserveTokens: 0,
				skipPrompt: true,
			},
		});
	});
});
