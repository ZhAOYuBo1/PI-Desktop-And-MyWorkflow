import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { GitHubCliSource, GitHubCliStatus } from "@codepiddy/shared";

interface ResolvedGitHubCli {
	path: string | null;
	source: GitHubCliSource;
	error: string | null;
}

function commonCandidates(): string[] {
	if (process.platform !== "win32") return [];
	const home = homedir();
	return [
		path.join(process.env.ProgramFiles ?? "C:\\Program Files", "GitHub CLI", "gh.exe"),
		path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "GitHub CLI", "gh.exe"),
		path.join(process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "GitHubCLI", "gh.exe"),
		path.join(process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "Programs", "GitHub CLI", "gh.exe"),
		path.join(home, "scoop", "shims", "gh.exe"),
	];
}

export function resolveGitHubCli(configuredPath: string | null): ResolvedGitHubCli {
	if (configuredPath) {
		return existsSync(configuredPath)
			? { path: configuredPath, source: "configured", error: null }
			: {
					path: configuredPath,
					source: "configured",
					error: `配置的 GitHub CLI 路径不存在：${configuredPath}`,
				};
	}
	const environmentPath = process.env.CODEPIDDY_GH_PATH?.trim();
	if (environmentPath) {
		return existsSync(environmentPath)
			? { path: environmentPath, source: "environment", error: null }
			: {
					path: environmentPath,
					source: "environment",
					error: `CODEPIDDY_GH_PATH 指向的文件不存在：${environmentPath}`,
				};
	}
	const lookup = spawnSync(process.platform === "win32" ? "where.exe" : "which", ["gh"], {
		encoding: "utf8",
		windowsHide: true,
	});
	const found =
		lookup.status === 0
			? lookup.stdout
					.split(/\r?\n/)
					.map((line) => line.trim())
					.find(Boolean)
			: undefined;
	if (found && existsSync(found)) return { path: found, source: "path", error: null };
	const common = commonCandidates().find((candidate) => existsSync(candidate));
	if (common) return { path: common, source: "common", error: null };
	return {
		path: null,
		source: "none",
		error: "未找到 GitHub CLI。请安装 gh，或手动选择 gh.exe。",
	};
}

function commandText(ghPath: string): string {
	return process.platform === "win32" ? `& "${ghPath}"` : `"${ghPath}"`;
}

export function getGitHubCliStatus(configuredPath: string | null): GitHubCliStatus {
	const resolved = resolveGitHubCli(configuredPath);
	if (!resolved.path || resolved.error) {
		return {
			path: resolved.path,
			source: resolved.source,
			authenticated: false,
			version: null,
			loginCommand: resolved.path ? `${commandText(resolved.path)} auth login` : null,
			error: resolved.error,
		};
	}
	let version: string | null = null;
	let versionError: string | null = null;
	try {
		const output = execFileSync(resolved.path, ["--version"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
			timeout: 10_000,
		});
		version = /gh version\s+([^\s]+)/iu.exec(output)?.[1] ?? output.trim().split(/\r?\n/)[0] ?? null;
	} catch (error) {
		versionError = error instanceof Error ? error.message : "无法读取 GitHub CLI 版本";
	}
	let authenticated = false;
	try {
		execFileSync(resolved.path, ["auth", "status"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
			timeout: 10_000,
		});
		authenticated = true;
	} catch {
		authenticated = false;
	}
	return {
		path: resolved.path,
		source: resolved.source,
		authenticated,
		version,
		loginCommand: `${commandText(resolved.path)} auth login`,
		error: versionError,
	};
}
