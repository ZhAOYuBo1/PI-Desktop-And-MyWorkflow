import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parsePiPackageActionInput } from "../src/main/ipc-validation.ts";

const execFileAsync = promisify(execFile);
const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(desktopRoot, "..", "..");

describe("Pi packages", () => {
	let root: string;
	let agentDir: string;
	let projectDir: string;
	let packageDir: string;

	beforeEach(async () => {
		root = await mkdtemp(path.join(tmpdir(), "codepiddy-packages-"));
		agentDir = path.join(root, "agent");
		projectDir = path.join(root, "project");
		packageDir = path.join(root, "local-package");
		await Promise.all([
			mkdir(agentDir, { recursive: true }),
			mkdir(projectDir, { recursive: true }),
			mkdir(path.join(packageDir, "skills"), { recursive: true }),
			mkdir(path.join(packageDir, "prompts"), { recursive: true }),
		]);
		await writeFile(
			path.join(packageDir, "package.json"),
			JSON.stringify({
				name: "local-package",
				version: "1.2.3",
				pi: { skills: ["skills"], prompts: ["prompts"], extensions: ["./index.js"] },
			}),
			"utf8",
		);
		await writeFile(path.join(packageDir, "index.js"), "export default {};\n", "utf8");
		await writeFile(path.join(packageDir, "skills", "review.md"), "# Review\n", "utf8");
		await writeFile(path.join(packageDir, "prompts", "parallel-review.md"), "Review in parallel.\n", "utf8");
		await writeFile(path.join(agentDir, "settings.json"), JSON.stringify({ packages: [packageDir] }), "utf8");
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("lists configured local packages with version and resource summary", async () => {
		const helperPath = path.join(desktopRoot, "scripts", "pi-package-helper.mjs");
		const runtimePath = path.join(repositoryRoot, "packages", "coding-agent-runtime");
		const { stdout } = await execFileAsync(
			process.execPath,
			[
				helperPath,
				"--package-dir",
				runtimePath,
				"--agent-dir",
				agentDir,
				"--action",
				"list",
				"--cwd",
				projectDir,
				"--project-trusted",
				"false",
			],
			{ maxBuffer: 4 * 1024 * 1024 },
		);
		const result = JSON.parse(stdout.trim()) as {
			packages: Array<{
				source: string;
				sourceType: string;
				version: string | null;
				extensionEnabled: boolean;
				resources: {
					extensions: { total: number; enabled: number };
					skills: { total: number; enabled: number };
					prompts: { total: number; enabled: number };
				};
			}>;
		};
		expect(result.packages).toHaveLength(1);
		expect(result.packages[0]).toMatchObject({
			source: packageDir,
			sourceType: "local",
			version: "1.2.3",
			extensionEnabled: false,
			resources: {
				extensions: { total: 1, enabled: 0 },
				skills: { total: 1, enabled: 1 },
				prompts: { total: 1, enabled: 1 },
			},
		});
	});

	it("validates scope, source and project paths", () => {
		expect(() =>
			parsePiPackageActionInput({
				action: "install",
				source: "npm:@example/tools",
				scope: "project",
			}),
		).toThrow("需要项目路径");
		expect(() =>
			parsePiPackageActionInput({
				action: "install",
				source: "npm:@example/tools\n--all",
				scope: "user",
			}),
		).toThrow("非法字符");
		expect(() =>
			parsePiPackageActionInput({
				action: "remove",
				source: "npm:@example/tools",
				scope: "user",
			}),
		).not.toThrow();
	});

	it("does not mutate settings when listing", async () => {
		const settingsBefore = await readFile(path.join(agentDir, "settings.json"), "utf8");
		const helperPath = path.join(desktopRoot, "scripts", "pi-package-helper.mjs");
		await execFileAsync(
			process.execPath,
			[
				helperPath,
				"--package-dir",
				path.join(repositoryRoot, "packages", "coding-agent-runtime"),
				"--agent-dir",
				agentDir,
				"--action",
				"list",
				"--cwd",
				projectDir,
				"--project-trusted",
				"false",
			],
			{ maxBuffer: 4 * 1024 * 1024 },
		);
		expect(await readFile(path.join(agentDir, "settings.json"), "utf8")).toBe(settingsBefore);
	});

	it("installs and removes a local package", async () => {
		await writeFile(path.join(agentDir, "settings.json"), "{}\n", "utf8");
		const helperPath = path.join(desktopRoot, "scripts", "pi-package-helper.mjs");
		const baseArgs = [
			helperPath,
			"--package-dir",
			path.join(repositoryRoot, "packages", "coding-agent-runtime"),
			"--agent-dir",
			agentDir,
			"--cwd",
			projectDir,
			"--project-trusted",
			"false",
		];
		await execFileAsync(
			process.execPath,
			[...baseArgs, "--action", "install", "--source", packageDir, "--scope", "user"],
			{ maxBuffer: 4 * 1024 * 1024 },
		);
		const installedSettings = JSON.parse(await readFile(path.join(agentDir, "settings.json"), "utf8")) as {
			packages?: string[];
		};
		expect(installedSettings.packages).toHaveLength(1);
		expect(path.resolve(projectDir, installedSettings.packages?.[0] ?? "")).toBe(packageDir);

		await execFileAsync(
			process.execPath,
			[...baseArgs, "--action", "remove", "--source", packageDir, "--scope", "user"],
			{ maxBuffer: 4 * 1024 * 1024 },
		);
		expect(JSON.parse(await readFile(path.join(agentDir, "settings.json"), "utf8"))).toMatchObject({
			packages: [],
		});
	});

	it("enables and resolves package extensions explicitly", async () => {
		const helperPath = path.join(desktopRoot, "scripts", "pi-package-helper.mjs");
		const baseArgs = [
			helperPath,
			"--package-dir",
			path.join(repositoryRoot, "packages", "coding-agent-runtime"),
			"--agent-dir",
			agentDir,
			"--cwd",
			projectDir,
			"--project-trusted",
			"false",
		];
		await execFileAsync(
			process.execPath,
			[...baseArgs, "--action", "set-extension", "--source", packageDir, "--scope", "user", "--enabled", "true"],
			{ maxBuffer: 4 * 1024 * 1024 },
		);
		const { stdout } = await execFileAsync(process.execPath, [...baseArgs, "--action", "enabled-extensions"], {
			maxBuffer: 4 * 1024 * 1024,
		});
		const result = JSON.parse(stdout.trim()) as { extensions: string[] };
		expect(result.extensions).toEqual([path.join(packageDir, "index.js")]);
	});

	it("lists package prompt files with their source", async () => {
		const helperPath = path.join(desktopRoot, "scripts", "pi-package-helper.mjs");
		const { stdout } = await execFileAsync(
			process.execPath,
			[
				helperPath,
				"--package-dir",
				path.join(repositoryRoot, "packages", "coding-agent-runtime"),
				"--agent-dir",
				agentDir,
				"--action",
				"package-prompts",
				"--cwd",
				projectDir,
				"--project-trusted",
				"false",
			],
			{ maxBuffer: 4 * 1024 * 1024 },
		);
		const result = JSON.parse(stdout.trim()) as {
			prompts: Array<{ path: string; source: string }>;
		};
		expect(result.prompts).toEqual([
			{
				path: path.join(packageDir, "prompts", "parallel-review.md"),
				source: packageDir,
			},
		]);
	});
});
