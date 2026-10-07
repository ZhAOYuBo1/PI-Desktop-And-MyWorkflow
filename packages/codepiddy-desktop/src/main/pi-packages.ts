import { execFile } from "node:child_process";
import type {
	PiPackageActionInput,
	PiPackageExtensionInput,
	PiPackageListResult,
	PiPackageSummary,
	PiPackageUpdateSummary,
} from "@codepiddy/shared";

interface PiPackageManagerOptions {
	helperPath: string;
	nodeExecutable: string;
	agentDir: string;
	resolvePackageDir(): Promise<string>;
	isProjectTrusted(projectRoot: string): Promise<boolean>;
}

interface HelperMessage {
	type: string;
	error?: string;
	message?: string;
	packages?: PiPackageSummary[];
	updates?: PiPackageUpdateSummary[];
	extensions?: string[];
	skills?: string[];
	prompts?: PiPackagePromptFile[];
	projectTrusted?: boolean;
}

export interface PiPackagePromptFile {
	path: string;
	source: string;
}

export class PiPackageManager {
	private readonly options: PiPackageManagerOptions;

	constructor(options: PiPackageManagerOptions) {
		this.options = options;
	}

	async list(projectRoot?: string): Promise<PiPackageListResult> {
		const projectTrusted = projectRoot ? await this.options.isProjectTrusted(projectRoot) : false;
		const messages = await this.run("list", {
			cwd: projectRoot ?? process.cwd(),
			projectTrusted,
		});
		return this.readListResult(messages);
	}

	async checkUpdates(projectRoot?: string): Promise<PiPackageUpdateSummary[]> {
		const projectTrusted = projectRoot ? await this.options.isProjectTrusted(projectRoot) : false;
		const messages = await this.run("check-updates", {
			cwd: projectRoot ?? process.cwd(),
			projectTrusted,
		});
		return this.readUpdates(messages);
	}

	async install(input: PiPackageActionInput): Promise<PiPackageListResult> {
		return this.runAction("install", input);
	}

	async remove(input: PiPackageActionInput): Promise<PiPackageListResult> {
		return this.runAction("remove", input);
	}

	async update(input: PiPackageActionInput): Promise<PiPackageListResult> {
		return this.runAction("update", input);
	}

	async setExtensionEnabled(input: PiPackageExtensionInput): Promise<PiPackageListResult> {
		if (input.scope === "project" && !input.projectRoot) throw new Error("项目级 Pi Package 需要项目路径");
		const projectTrusted =
			input.scope === "project" && input.projectRoot
				? await this.options.isProjectTrusted(input.projectRoot)
				: false;
		if (input.scope === "project" && !projectTrusted) throw new Error("项目未受信任，不能修改项目级 Pi Package");
		await this.run("set-extension", {
			cwd: input.projectRoot ?? process.cwd(),
			projectTrusted,
			source: input.source,
			scope: input.scope,
			enabled: input.enabled,
		});
		return this.list(input.projectRoot);
	}

	async enabledExtensionPaths(projectRoot: string): Promise<string[]> {
		const projectTrusted = await this.options.isProjectTrusted(projectRoot);
		const messages = await this.run("enabled-extensions", {
			cwd: projectRoot,
			projectTrusted,
		});
		return messages.find((entry) => entry.type === "extensions")?.extensions ?? [];
	}

	async packageSkillPaths(projectRoot: string): Promise<string[]> {
		const projectTrusted = await this.options.isProjectTrusted(projectRoot);
		const messages = await this.run("package-skills", {
			cwd: projectRoot,
			projectTrusted,
		});
		return messages.find((entry) => entry.type === "skills")?.skills ?? [];
	}

	async packagePromptFiles(projectRoot: string): Promise<PiPackagePromptFile[]> {
		const projectTrusted = await this.options.isProjectTrusted(projectRoot);
		const messages = await this.run("package-prompts", {
			cwd: projectRoot,
			projectTrusted,
		});
		return messages.find((entry) => entry.type === "prompts")?.prompts ?? [];
	}

	private async runAction(
		action: "install" | "remove" | "update",
		input: PiPackageActionInput,
	): Promise<PiPackageListResult> {
		if (input.scope === "project" && !input.projectRoot) throw new Error("项目级 Pi Package 需要项目路径");
		const projectTrusted =
			input.scope === "project" && input.projectRoot
				? await this.options.isProjectTrusted(input.projectRoot)
				: false;
		if (input.scope === "project" && !projectTrusted) throw new Error("项目未受信任，不能修改项目级 Pi Package");
		await this.run(action, {
			cwd: input.projectRoot ?? process.cwd(),
			projectTrusted,
			source: input.source,
			scope: input.scope,
		});
		return this.list(input.projectRoot);
	}

	private readListResult(messages: HelperMessage[]): PiPackageListResult {
		const message = messages.find((entry) => entry.type === "packages");
		if (!message) throw new Error("Pi Package helper 没有返回包列表");
		return {
			packages: message.packages ?? [],
			updates: message.updates ?? [],
			projectTrusted: message.projectTrusted === true,
		};
	}

	private readUpdates(messages: HelperMessage[]): PiPackageUpdateSummary[] {
		const message = messages.find((entry) => entry.type === "updates");
		if (!message) throw new Error("Pi Package helper 没有返回更新状态");
		return message.updates ?? [];
	}

	private run(
		action:
			| "list"
			| "check-updates"
			| "install"
			| "remove"
			| "update"
			| "set-extension"
			| "enabled-extensions"
			| "package-skills"
			| "package-prompts",
		input: {
			cwd: string;
			projectTrusted: boolean;
			source?: string;
			scope?: string;
			enabled?: boolean;
		},
	): Promise<HelperMessage[]> {
		return (async () => {
			const packageDir = await this.options.resolvePackageDir();
			const args = [
				this.options.helperPath,
				"--package-dir",
				packageDir,
				"--agent-dir",
				this.options.agentDir,
				"--action",
				action,
				"--cwd",
				input.cwd,
				"--project-trusted",
				String(input.projectTrusted),
				...(input.source ? ["--source", input.source] : []),
				...(input.scope ? ["--scope", input.scope] : []),
				...(input.enabled === undefined ? [] : ["--enabled", String(input.enabled)]),
			];
			const output = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
				execFile(
					this.options.nodeExecutable,
					args,
					{
						env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
						maxBuffer: 16 * 1024 * 1024,
						timeout: 10 * 60 * 1000,
						windowsHide: true,
					},
					(error, stdout, stderr) => {
						if (error) {
							reject(Object.assign(error, { stdout, stderr }));
							return;
						}
						resolve({ stdout, stderr });
					},
				);
			}).catch((error: unknown) => {
				const failure = readExecFailure(error);
				const messages = parseMessages(failure.stdout);
				const helperError = messages.find((entry) => entry.type === "error");
				if (helperError?.error) throw new Error(helperError.error);
				const detail =
					failure.stderr.trim() || (error instanceof Error ? error.message : "Pi Package helper 执行失败");
				throw new Error(detail);
			});
			const messages = parseMessages(output.stdout);
			const failure = messages.find((entry) => entry.type === "error");
			if (failure?.error) throw new Error(failure.error);
			return messages;
		})();
	}
}

function readExecFailure(error: unknown): { stdout: string; stderr: string } {
	if (typeof error !== "object" || error === null) return { stdout: "", stderr: "" };
	const record = error as Record<string, unknown>;
	return {
		stdout: typeof record.stdout === "string" ? record.stdout : "",
		stderr: typeof record.stderr === "string" ? record.stderr : "",
	};
}

function parseMessages(stdout: string): HelperMessage[] {
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.flatMap((line) => {
			try {
				const parsed: unknown = JSON.parse(line);
				if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [];
				const record = parsed as Record<string, unknown>;
				if (typeof record.type !== "string") return [];
				return [
					{
						type: record.type,
						...(typeof record.error === "string" ? { error: record.error } : {}),
						...(typeof record.message === "string" ? { message: record.message } : {}),
						...(Array.isArray(record.packages) ? { packages: record.packages as PiPackageSummary[] } : {}),
						...(Array.isArray(record.updates) ? { updates: record.updates as PiPackageUpdateSummary[] } : {}),
						...(Array.isArray(record.extensions)
							? { extensions: record.extensions.filter((entry): entry is string => typeof entry === "string") }
							: {}),
						...(Array.isArray(record.skills)
							? { skills: record.skills.filter((entry): entry is string => typeof entry === "string") }
							: {}),
						...(Array.isArray(record.prompts)
							? {
									prompts: record.prompts.flatMap((entry) => {
										if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
										const prompt = entry as Record<string, unknown>;
										if (typeof prompt.path !== "string" || typeof prompt.source !== "string") return [];
										return [{ path: prompt.path, source: prompt.source }];
									}),
								}
							: {}),
						...(typeof record.projectTrusted === "boolean" ? { projectTrusted: record.projectTrusted } : {}),
					},
				];
			} catch {
				return [];
			}
		});
}
