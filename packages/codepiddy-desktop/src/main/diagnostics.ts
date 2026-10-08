import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
	AgentInstanceLocator,
	AgentSessionStats,
	AgentSessionSummary,
	AgentStatus,
	AuthProviderSummary,
	DiagnosticsExportInput,
	DiagnosticsExportResult,
	DiagnosticsInfo,
	McpRuntimeSnapshot,
	PiRuntimeStatus,
	ProjectTrustStatus,
	ProviderSummary,
} from "@codepiddy/shared";
import { strToU8, type Zippable, zipSync } from "fflate";

export interface DiagnosticsErrorEntry {
	timestamp: string;
	source: string;
	message: string;
}

export interface DiagnosticsAgentSnapshot {
	locator: AgentInstanceLocator;
	status: AgentStatus;
	sessionDirectory: string;
	sessionFile: string | null;
	sessionSummary: AgentSessionSummary | null;
	state: Record<string, unknown> | null;
	stats: AgentSessionStats | null;
}

export interface DiagnosticsManagerOptions {
	agentDir: string;
	appVersion: string;
	getPiRuntimeStatus(): PiRuntimeStatus;
	listAuthProviders(): Promise<AuthProviderSummary[]>;
	listConfiguredProviders(): Promise<ProviderSummary[]>;
	getMcpSnapshot(): Promise<McpRuntimeSnapshot>;
	getAgentSnapshot(locator?: AgentInstanceLocator): Promise<DiagnosticsAgentSnapshot | null>;
	getTrustStatus(projectRoot?: string): Promise<ProjectTrustStatus | null>;
	getRecentErrors(): DiagnosticsErrorEntry[];
}

interface CaptureResult<T> {
	value: T | null;
	error: string | null;
}

const SECRET_KEY_PATTERN =
	/(api[_-]?key|authorization|password|secret|token|cookie|credential|private[_-]?key|access[_-]?key)/iu;
const MAX_TEXT_LENGTH = 512 * 1024;
const MAX_SESSION_BYTES = 8 * 1024 * 1024;

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function capture<T>(operation: () => Promise<T>): Promise<CaptureResult<T>> {
	try {
		return { value: await operation(), error: null };
	} catch (error) {
		return { value: null, error: errorMessage(error) };
	}
}

function jsonFile(value: unknown): Uint8Array {
	return strToU8(`${JSON.stringify(value, null, 2)}\n`);
}

function redactDiagnosticText(value: string): string {
	return value
		.replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/gu, "[REDACTED]")
		.replace(/\b(tvly-[A-Za-z0-9_-]{8,})\b/gu, "[REDACTED]")
		.replace(/\b(gh[pousr]_[A-Za-z0-9]{20,})\b/gu, "[REDACTED]")
		.replace(/\b(github_pat_[A-Za-z0-9_]{20,})\b/gu, "[REDACTED]")
		.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/giu, "$1[REDACTED]")
		.replace(/(x-api-key\s*[:=]\s*)[^\s,;]+/giu, "$1[REDACTED]");
}

export function redactDiagnosticValue(value: unknown, key = "", depth = 0): unknown {
	if (depth > 8) return "[TRUNCATED]";
	if (typeof value === "string") {
		return SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactDiagnosticText(value);
	}
	if (Array.isArray(value)) {
		return value.slice(0, 200).map((entry) => redactDiagnosticValue(entry, key, depth + 1));
	}
	if (typeof value === "object" && value !== null) {
		return Object.fromEntries(
			Object.entries(value).map(([entryKey, entryValue]) => [
				entryKey,
				redactDiagnosticValue(entryValue, entryKey, depth + 1),
			]),
		);
	}
	return value;
}

export function redactSessionJsonl(raw: string): string {
	const lines = raw.split(/\r?\n/u);
	const redacted = lines.map((line) => {
		if (!line.trim()) return line;
		try {
			return JSON.stringify(redactDiagnosticValue(JSON.parse(line) as unknown));
		} catch {
			return redactDiagnosticText(line);
		}
	});
	return `${redacted.join("\n").replace(/\n+$/u, "")}\n`;
}

async function readTail(filePath: string, maxBytes: number): Promise<string | null> {
	try {
		const buffer = await readFile(filePath);
		return buffer.subarray(Math.max(0, buffer.length - maxBytes)).toString("utf8");
	} catch (error) {
		if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
		throw error;
	}
}

function diagnosticReadme(input: DiagnosticsExportInput, includedSession: boolean): string {
	return [
		"CodePIddy diagnostics package",
		"",
		"This archive is created locally and is not uploaded by CodePIddy.",
		"",
		"Contents:",
		"- diagnostics.json: versions, environment, Agent, Provider, MCP, trust and error summaries.",
		"- logs/: available Pi and MCP logs.",
		includedSession
			? "- session.jsonl: the selected Session JSONL after basic secret redaction."
			: "- session.jsonl is not included.",
		"",
		"Privacy:",
		"Values under key names such as apiKey, token, secret and authorization are redacted.",
		"Tool output and free-form log text cannot be guaranteed to contain no secrets. Review the archive before sharing it.",
		"",
		`Session inclusion requested: ${input.includeSession ? "yes" : "no"}`,
	].join("\n");
}

export class DiagnosticsManager {
	private readonly options: DiagnosticsManagerOptions;

	constructor(options: DiagnosticsManagerOptions) {
		this.options = options;
	}

	async getInfo(): Promise<DiagnosticsInfo> {
		return {
			codepiddyVersion: this.options.appVersion,
			piRuntime: this.options.getPiRuntimeStatus(),
			platform: os.platform(),
			architecture: process.arch,
			electronVersion: process.versions.electron ?? null,
			nodeVersion: process.versions.node,
			osRelease: os.release(),
			osVersion: os.version(),
			debugLogPath: path.join(this.options.agentDir, "pi-debug.log"),
			mcpLogPath: path.join(this.options.agentDir, "mcp.log"),
		};
	}

	async export(input: DiagnosticsExportInput, destinationPath: string): Promise<DiagnosticsExportResult> {
		const generatedAt = new Date().toISOString();
		const [authProviders, configuredProviders, mcp, agent, trust] = await Promise.all([
			capture(() => this.options.listAuthProviders()),
			capture(() => this.options.listConfiguredProviders()),
			capture(() => this.options.getMcpSnapshot()),
			capture(() => this.options.getAgentSnapshot(input.agent)),
			capture(() => this.options.getTrustStatus(input.projectRoot)),
		]);
		const recentErrors = [
			...this.options.getRecentErrors(),
			...(input.uiError?.trim()
				? [{ timestamp: generatedAt, source: "renderer", message: input.uiError.trim() }]
				: []),
		].slice(-100);
		const debugLog = await readTail(path.join(this.options.agentDir, "pi-debug.log"), MAX_TEXT_LENGTH);
		const mcpLog = await readTail(path.join(this.options.agentDir, "mcp.log"), MAX_TEXT_LENGTH);
		const sessionFile = agent.value?.sessionFile ?? null;
		const sessionContent =
			input.includeSession && sessionFile ? await readTail(sessionFile, MAX_SESSION_BYTES) : null;
		const includedSession = sessionContent !== null;

		const diagnostics = {
			generatedAt,
			generator: "CodePIddy desktop",
			privacy: {
				uploaded: false,
				sessionRequested: input.includeSession,
				sessionIncluded: includedSession,
				redaction: "key-based and common-token redaction",
			},
			environment: {
				platform: os.platform(),
				architecture: process.arch,
				release: os.release(),
				version: os.version(),
				electron: process.versions.electron ?? null,
				node: process.versions.node,
				codepiddyVersion: this.options.appVersion,
			},
			piRuntime: this.options.getPiRuntimeStatus(),
			agent: agent.value,
			agentError: agent.error,
			providers: {
				auth: authProviders.value,
				configured: configuredProviders.value,
				error: authProviders.error ?? configuredProviders.error,
			},
			mcp: {
				snapshot: mcp.value,
				error: mcp.error,
			},
			trust: {
				projectRoot: input.projectRoot ?? null,
				status: trust.value,
				error: trust.error,
			},
			recentErrors: redactDiagnosticValue(recentErrors),
			logs: {
				debugLogPath: path.join(this.options.agentDir, "pi-debug.log"),
				mcpLogPath: path.join(this.options.agentDir, "mcp.log"),
				included: [...(debugLog ? ["pi-debug.log"] : []), ...(mcpLog ? ["mcp.log"] : [])],
			},
			session: {
				requested: input.includeSession,
				included: includedSession,
				file: sessionFile,
			},
		};

		const files: Zippable = {
			"README.txt": strToU8(diagnosticReadme(input, includedSession)),
			"diagnostics.json": jsonFile(redactDiagnosticValue(diagnostics)),
		};
		const logs: Zippable = {};
		if (debugLog) logs["pi-debug.log"] = strToU8(redactDiagnosticText(debugLog));
		if (mcpLog) logs["mcp.log"] = strToU8(redactDiagnosticText(mcpLog));
		if (Object.keys(logs).length > 0) files.logs = logs;
		if (sessionContent !== null) files["session.jsonl"] = strToU8(redactSessionJsonl(sessionContent));

		const archive = zipSync(files, { level: 6 });
		await mkdir(path.dirname(destinationPath), { recursive: true });
		await writeFile(destinationPath, archive);
		return {
			filePath: destinationPath,
			createdAt: generatedAt,
			sizeBytes: archive.byteLength,
			includedSession,
		};
	}
}
