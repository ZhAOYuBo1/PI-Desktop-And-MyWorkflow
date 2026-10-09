import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { type InstalledPiRuntime, PiRuntimeUpdater } from "../src/main/pi-runtime-updater.ts";

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function writeRuntimePackage(stagingRoot: string, version: string): Promise<void> {
	const packageDir = path.join(stagingRoot, "node_modules", "@earendil-works", "pi-coding-agent");
	const files = [
		["package.json", JSON.stringify({ name: "@earendil-works/pi-coding-agent", version })],
		["dist/bundle/cli.js", "// pi cli"],
		["dist/index.js", "// pi index"],
		["dist/core/slash-commands.js", "// slash commands"],
		["node_modules/@earendil-works/pi-agent-core/dist/index.js", "// agent core"],
		["node_modules/@earendil-works/pi-ai/dist/compat.js", "// pi ai"],
		["node_modules/@earendil-works/pi-tui/dist/index.js", "// pi tui"],
		["node_modules/@earendil-works/chord/dist/index.js", "// chord"],
		["node_modules/quickjs-wasi/quickjs.wasm", "wasm"],
	] as const;
	for (const [relativePath, content] of files) {
		const target = path.join(packageDir, relativePath);
		await mkdir(path.dirname(target), { recursive: true });
		await writeFile(target, content);
	}
}

async function fixture(
	overrides: { bundledVersion?: string; latest?: string; probe?: (runtime: InstalledPiRuntime) => Promise<void> } = {},
) {
	const userDataPath = await mkdtemp(path.join(tmpdir(), "codepiddy-update-"));
	directories.push(userDataPath);
	const bundledVersion = overrides.bundledVersion ?? "1.0.0";
	const latest = overrides.latest ?? "1.1.0";
	const options = {
		userDataPath,
		bundledVersion,
		nodeExecutable: process.execPath,
		requestLatest: async () => latest,
		installPackage: writeRuntimePackage,
		probe: async (runtime: InstalledPiRuntime) => {
			await overrides.probe?.(runtime);
		},
	};
	const updater = new PiRuntimeUpdater(options);
	await updater.initialize();
	return { updater, options, userDataPath };
}

describe("Pi runtime update", () => {
	test("checking again does not change the pending version or restart state", async () => {
		const { updater } = await fixture();
		await updater.checkLatest();
		expect(await updater.installLatest("1.1.0")).toMatchObject({
			currentVersion: "1.1.0",
			runningVersion: "1.0.0",
			restartRequired: true,
			updateAvailable: false,
		});
		expect(await updater.checkLatest()).toMatchObject({
			currentVersion: "1.1.0",
			runningVersion: "1.0.0",
			restartRequired: true,
			updateAvailable: false,
		});
	});

	test("rollback is idempotent after the active record has already been cleared", async () => {
		const { updater, options } = await fixture();
		await updater.checkLatest();
		await updater.installLatest("1.1.0");

		const running = new PiRuntimeUpdater(options);
		await running.initialize();
		expect(running.getLaunchRuntime()?.version).toBe("1.1.0");
		expect(await running.rollback()).toMatchObject({
			currentVersion: "1.0.0",
			runningVersion: "1.1.0",
			rollbackVersion: null,
			restartRequired: true,
		});
		expect(await running.rollback()).toMatchObject({
			currentVersion: "1.0.0",
			runningVersion: "1.1.0",
			rollbackVersion: null,
			restartRequired: true,
		});

		const restarted = new PiRuntimeUpdater(options);
		await restarted.initialize();
		expect(restarted.getLaunchRuntime()).toBeNull();
		expect(restarted.status()).toMatchObject({
			currentVersion: "1.0.0",
			runningVersion: "1.0.0",
			restartRequired: false,
		});
	});

	test("rolls back to the immediately preceding installed version", async () => {
		const { updater, options, userDataPath } = await fixture();
		await updater.checkLatest();
		await updater.installLatest("1.1.0");

		const second = new PiRuntimeUpdater({ ...options, requestLatest: async () => "1.2.0" });
		await second.initialize();
		await second.checkLatest();
		expect(await second.installLatest("1.2.0")).toMatchObject({
			currentVersion: "1.2.0",
			runningVersion: "1.1.0",
			rollbackVersion: "1.1.0",
			restartRequired: true,
		});
		expect(await second.rollback()).toMatchObject({
			currentVersion: "1.1.0",
			runningVersion: "1.1.0",
			rollbackVersion: "1.0.0",
			restartRequired: false,
		});
		const active = JSON.parse(await readFile(path.join(userDataPath, "pi-updates", "active.json"), "utf8")) as {
			version: string;
		};
		expect(active.version).toBe("1.1.0");
	});

	test("falls back to bundled when the recorded rollback target is unavailable", async () => {
		const { updater, options, userDataPath } = await fixture();
		await updater.checkLatest();
		await updater.installLatest("1.1.0");
		const second = new PiRuntimeUpdater({ ...options, requestLatest: async () => "1.2.0" });
		await second.initialize();
		await second.checkLatest();
		await second.installLatest("1.2.0");
		const activePath = path.join(userDataPath, "pi-updates", "active.json");
		const active = JSON.parse(await readFile(activePath, "utf8")) as {
			history: Array<{ kind: string; installId?: string }>;
		};
		const previous = active.history.find((entry) => entry.kind === "installed");
		expect(previous?.installId).toBeTruthy();
		await rm(path.join(userDataPath, "pi-updates", "versions", previous?.installId ?? ""), {
			recursive: true,
			force: true,
		});

		expect(await second.rollback()).toMatchObject({
			currentVersion: "1.0.0",
			runningVersion: "1.1.0",
			rollbackVersion: null,
			restartRequired: true,
			warning: expect.any(String),
		});
	});
});
