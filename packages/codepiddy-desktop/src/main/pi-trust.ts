import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProjectTrustStatus, SetProjectTrustInput } from "@codepiddy/shared";

const execFileAsync = promisify(execFile);

interface PiTrustManagerOptions {
	helperPath: string;
	nodeExecutable: string;
	agentDir: string;
	resolvePackageDir(): Promise<string>;
}

export class PiTrustManager {
	private readonly options: PiTrustManagerOptions;

	constructor(options: PiTrustManagerOptions) {
		this.options = options;
	}

	getStatus(projectRoot: string): Promise<ProjectTrustStatus> {
		return this.run("status", projectRoot);
	}

	set(input: SetProjectTrustInput): Promise<ProjectTrustStatus> {
		return this.run("set", input.projectRoot, {
			decision: String(input.decision),
			includeParent: String(input.includeParent === true),
		});
	}

	private async run(
		action: "status" | "set",
		projectRoot: string,
		extra: Record<string, string> = {},
	): Promise<ProjectTrustStatus> {
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
			projectRoot,
		];
		for (const [name, value] of Object.entries(extra)) args.push(`--${name}`, value);
		const { stdout } = await execFileAsync(this.options.nodeExecutable, args, {
			env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
			maxBuffer: 1024 * 1024,
			windowsHide: true,
		});
		const parsed: unknown = JSON.parse(stdout.trim());
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			throw new Error("Pi 项目信任状态无效");
		}
		return parsed as ProjectTrustStatus;
	}
}
