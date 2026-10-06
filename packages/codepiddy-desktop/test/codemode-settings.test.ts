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

describe("codemode settings", () => {
	let agentDirectory: string;
	let userDataDirectory: string;

	beforeEach(async () => {
		agentDirectory = await mkdtemp(path.join(tmpdir(), "codepiddy-codemode-agent-"));
		userDataDirectory = await mkdtemp(path.join(tmpdir(), "codepiddy-codemode-userdata-"));
		process.env.PI_CODING_AGENT_DIR = agentDirectory;
	});

	afterEach(async () => {
		delete process.env.PI_CODING_AGENT_DIR;
		await rm(agentDirectory, { recursive: true, force: true });
		await rm(userDataDirectory, { recursive: true, force: true });
	});

	it("uses Pi defaults when settings are absent", async () => {
		const store = new AppSettingsStore(userDataDirectory);
		expect(await store.getCodemodeSettings()).toEqual({
			mode: "on",
			inlineBudget: null,
		});
	});

	it("writes codemode fields without dropping unrelated settings", async () => {
		const settingsPath = path.join(agentDirectory, "settings.json");
		await writeFile(
			settingsPath,
			JSON.stringify({
				theme: "dark",
				codemode: { futureField: "keep" },
			}),
			"utf8",
		);
		const store = new AppSettingsStore(userDataDirectory);
		await store.setCodemodeSettings({
			mode: "only",
			inlineBudget: 6000,
		});
		const written = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
		expect(written).toEqual({
			theme: "dark",
			codemode: {
				futureField: "keep",
				mode: "only",
				inlineBudget: 6000,
			},
		});
	});

	it("removes default values instead of writing redundant fields", async () => {
		const settingsPath = path.join(agentDirectory, "settings.json");
		await writeFile(
			settingsPath,
			JSON.stringify({
				theme: "dark",
				codemode: { mode: "only", inlineBudget: 6000 },
			}),
			"utf8",
		);
		const store = new AppSettingsStore(userDataDirectory);
		await store.setCodemodeSettings({
			mode: "on",
			inlineBudget: null,
		});
		const written = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
		expect(written).toEqual({ theme: "dark" });
	});
});
