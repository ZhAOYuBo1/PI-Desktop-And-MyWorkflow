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

import { parseInstallTelemetryEnabled } from "../src/main/ipc-validation.ts";
import { AppSettingsStore } from "../src/main/settings-store.ts";

describe("install telemetry settings", () => {
	let agentDirectory: string;
	let userDataDirectory: string;

	beforeEach(async () => {
		agentDirectory = await mkdtemp(path.join(tmpdir(), "codepiddy-telemetry-agent-"));
		userDataDirectory = await mkdtemp(path.join(tmpdir(), "codepiddy-telemetry-userdata-"));
		process.env.PI_CODING_AGENT_DIR = agentDirectory;
		delete process.env.PI_TELEMETRY;
	});

	afterEach(async () => {
		delete process.env.PI_CODING_AGENT_DIR;
		delete process.env.PI_TELEMETRY;
		await rm(agentDirectory, { recursive: true, force: true });
		await rm(userDataDirectory, { recursive: true, force: true });
	});

	it("uses Pi's default when the setting is absent", async () => {
		const store = new AppSettingsStore(userDataDirectory);
		expect(await store.getInstallTelemetrySettings()).toEqual({
			enabled: true,
			effectiveEnabled: true,
			environmentOverride: null,
		});
	});

	it("writes enableInstallTelemetry without dropping unrelated settings", async () => {
		const settingsPath = path.join(agentDirectory, "settings.json");
		await writeFile(settingsPath, JSON.stringify({ theme: "dark", shellPath: "/usr/bin/bash" }), "utf8");
		const store = new AppSettingsStore(userDataDirectory);

		await store.setInstallTelemetrySettings(false);

		const written = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
		expect(written).toEqual({
			theme: "dark",
			shellPath: "/usr/bin/bash",
			enableInstallTelemetry: false,
		});
	});

	it("lets PI_TELEMETRY override the persisted setting", async () => {
		const settingsPath = path.join(agentDirectory, "settings.json");
		await writeFile(settingsPath, JSON.stringify({ enableInstallTelemetry: false }), "utf8");
		process.env.PI_TELEMETRY = "yes";
		const store = new AppSettingsStore(userDataDirectory);

		expect(await store.getInstallTelemetrySettings()).toEqual({
			enabled: false,
			effectiveEnabled: true,
			environmentOverride: "enabled",
		});
	});

	it("treats any existing PI_TELEMETRY value outside the true set as disabled", async () => {
		process.env.PI_TELEMETRY = "0";
		const store = new AppSettingsStore(userDataDirectory);

		expect(await store.getInstallTelemetrySettings()).toEqual({
			enabled: true,
			effectiveEnabled: false,
			environmentOverride: "disabled",
		});
	});

	it("rejects non-boolean IPC input", () => {
		expect(parseInstallTelemetryEnabled(true)).toBe(true);
		expect(parseInstallTelemetryEnabled(false)).toBe(false);
		expect(() => parseInstallTelemetryEnabled("false")).toThrow("布尔值");
	});
});
