import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
	AgentRegistry,
	archiveWorkItem,
	createWorkItem,
	deleteWorkItem,
	listWorkspaceDir,
	openProject,
	PiRpcProcess,
	ProjectWriteLeaseManager,
	readRoleProfile,
	readWorkspaceFile,
	renameWorkItem,
	restoreWorkItem,
	type StoredAgentInstance,
	searchProjectFiles,
} from "@codepiddy/core";
import type {
	AgentBuiltinCommandResult,
	AgentClientEvent,
	AgentCommandOption,
	AgentContextUsage,
	AgentInstanceLocator,
	AgentModelOption,
	AgentModelScope,
	AgentModelSelection,
	AgentRole,
	AgentSessionNode,
	AgentSessionSnapshot,
	AgentSessionStats,
	AgentSessionSummary,
	AgentSessionSwitchResult,
	ArchiveWorkItemInput,
	AuthMethodType,
	CacheWarmingDecisionSummary,
	CreateAgentInput,
	ExtensionUiResponseInput,
	ForkAgentSessionInput,
	ForkAgentSessionResult,
	InvokeAgentBuiltinCommandInput,
	LlamaCppActionEvent,
	McpActionInput,
	McpActionResult,
	McpRuntimeSnapshot,
	PendingPermissionRequest,
	ProjectSummary,
	ResetAgentInput,
	SendAgentPromptInput,
	SetAgentModelInput,
	SetAgentModelScopeInput,
	SetAgentThinkingInput,
	ShareAgentSessionResult,
	ShareSettingsStatus,
	SwitchAgentSessionInput,
	TerminalClientEvent,
	TerminalSessionInfo,
} from "@codepiddy/shared";
import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell, webContents } from "electron";
import pty, { type IPty } from "node-pty";
import { type DiagnosticsAgentSnapshot, type DiagnosticsErrorEntry, DiagnosticsManager } from "./diagnostics.ts";
import { getGitHubCliStatus } from "./github-cli.ts";
import {
	assertPathInside,
	parseAgentLocator,
	parseAgentUiState,
	parseArchiveWorkItemInput,
	parseBoundedText,
	parseCacheWarmingSettings,
	parseContextCompactionSettings,
	parseCreateAgentInput,
	parseCreateWorkItemInput,
	parseDiagnosticsExportInput,
	parseExtensionUiResponseInput,
	parseExternalUrl,
	parseForkAgentSessionInput,
	parseInvokeAgentBuiltinCommandInput,
	parseMcpActionInput,
	parseMcpProjectOverrideInput,
	parseMcpProjectOverrideLocator,
	parseMcpServerInput,
	parsePermissionDefaults,
	parseProjectId,
	parseProjectRoot,
	parseProjectUiState,
	parseProviderInput,
	parseRenameWorkItemInput,
	parseResetAgentInput,
	parseRoleSkillAssignmentsInput,
	parseRunLlamaCppActionInput,
	parseSaveLlamaCppConfigInput,
	parseSendAgentPromptInput,
	parseSetAgentModelInput,
	parseSetAgentModelScopeInput,
	parseSetAgentThinkingInput,
	parseSetProjectTrustInput,
	parseSwitchAgentSessionInput,
	parseTerminalId,
	parseTerminalResizeInput,
	parseTerminalStartInput,
	parseTerminalWriteInput,
} from "./ipc-validation.ts";
import { LlamaCppManager } from "./llama-cpp-manager.ts";
import { PiAuthManager } from "./pi-auth.ts";
import { loadPiBuiltinCommands, mergePiCommands } from "./pi-builtin-commands.ts";
import { type InstalledPiRuntime, PiRuntimeUpdater } from "./pi-runtime-updater.ts";
import { PiTrustManager } from "./pi-trust.ts";
import { RecentProjectStore } from "./recent-project-store.ts";
import { AppSettingsStore, resolvePiAgentDir } from "./settings-store.ts";
import { SingleFlightMap } from "./single-flight.ts";
import { discoverAgentSkills, resolveBuiltinSkillsDirectory, resolveRoleSkillPaths } from "./skill-catalog.ts";
import { readWindowsTerminalProfile, type TerminalCursorStyle } from "./windows-terminal.ts";

const channels = {
	abortAgent: "codepiddy:agent:abort",
	reconnectAgent: "codepiddy:agent:reconnect",
	compactAgent: "codepiddy:agent:compact",
	invokeAgentBuiltinCommand: "codepiddy:agent:command:invoke",
	cloneAgentSession: "codepiddy:agent:session:clone",
	getAgentSessionSnapshot: "codepiddy:agent:session:get",
	forkAgentSession: "codepiddy:agent:session:fork",
	shareAgentSession: "codepiddy:agent:session:share",
	listAgentSessions: "codepiddy:agent:session:list",
	newAgentSession: "codepiddy:agent:session:new",
	switchAgentSession: "codepiddy:agent:session:switch",
	deleteAgentSession: "codepiddy:agent:session:delete",
	importAgentSession: "codepiddy:agent:session:import",
	getAgentSessionStats: "codepiddy:agent:session:stats",
	listAuthProviders: "codepiddy:auth:providers",
	startAuthLogin: "codepiddy:auth:login:start",
	respondAuthPrompt: "codepiddy:auth:login:respond",
	cancelAuthLogin: "codepiddy:auth:login:cancel",
	logoutAuthProvider: "codepiddy:auth:logout",
	authEvent: "codepiddy:auth:event",
	resetAgent: "codepiddy:agent:reset",
	activateAgent: "codepiddy:agent:activate",
	agentEvent: "codepiddy:agent:event",
	archiveWorkItem: "codepiddy:work-item:archive",
	createAgent: "codepiddy:agent:create",
	createWorkItem: "codepiddy:work-item:create",
	renameWorkItem: "codepiddy:work-item:rename",
	deleteWorkItem: "codepiddy:work-item:delete",
	getAgentModelSelection: "codepiddy:agent:model:get",
	getAgentModelScope: "codepiddy:agent:model:scope:get",
	getAgentCommands: "codepiddy:agent:commands:get",
	getProjectWriteLeaseStatus: "codepiddy:write-lease:get",
	clearStaleProjectWriteLease: "codepiddy:write-lease:clear-stale",
	setAgentModel: "codepiddy:agent:model:set",
	setAgentModelScope: "codepiddy:agent:model:scope:set",
	setAgentThinking: "codepiddy:agent:thinking:set",
	getProjectTrustStatus: "codepiddy:project:trust:get",
	setProjectTrust: "codepiddy:project:trust:set",
	listRecentProjects: "codepiddy:project:recent:list",
	getStartupProject: "codepiddy:project:startup",
	closeProject: "codepiddy:project:close",
	openProject: "codepiddy:project:open",
	openRecentProject: "codepiddy:project:recent:open",
	forgetRecentProject: "codepiddy:project:recent:forget",
	openWorkItemFolder: "codepiddy:work-item:open-folder",
	getProjectUiState: "codepiddy:ui:project:get",
	saveProjectUiState: "codepiddy:ui:project:save",
	getAgentUiState: "codepiddy:ui:agent:get",
	saveAgentUiState: "codepiddy:ui:agent:save",
	refreshProject: "codepiddy:project:refresh",
	restoreWorkItem: "codepiddy:work-item:restore",
	respondToExtensionUi: "codepiddy:agent:extension-ui-response",
	getPendingPermissionRequest: "codepiddy:agent:permission:get-pending",
	settingsClearTavily: "codepiddy:settings:tavily:clear",
	settingsGetTavily: "codepiddy:settings:tavily:get",
	settingsListSkills: "codepiddy:settings:skills:list",
	settingsGetRoleSkills: "codepiddy:settings:role-skills:get",
	settingsSetRoleSkills: "codepiddy:settings:role-skills:set",
	settingsOpenPiConfig: "codepiddy:settings:pi-config:open",
	settingsOpenPermissionPolicy: "codepiddy:settings:permission-policy:open",
	settingsOpenProjectSkills: "codepiddy:settings:project-skills:open",
	settingsOpenBuiltinSkills: "codepiddy:settings:builtin-skills:open",
	settingsShareGet: "codepiddy:settings:share:get",
	settingsShareChooseGitHubCli: "codepiddy:settings:share:github-cli:choose",
	settingsShareSetGitHubCliPath: "codepiddy:settings:share:github-cli:set",
	openExternalUrl: "codepiddy:app:open-external-url",
	settingsGetPermissions: "codepiddy:settings:permissions:get",
	settingsSetPermissions: "codepiddy:settings:permissions:set",
	settingsSaveTavily: "codepiddy:settings:tavily:save",
	settingsSaveShell: "codepiddy:settings:shell:save",
	settingsSaveCacheWarming: "codepiddy:settings:cache-warming:save",
	settingsSaveContextCompaction: "codepiddy:settings:context-compaction:save",
	settingsListMcp: "codepiddy:settings:mcp:list",
	settingsSaveMcp: "codepiddy:settings:mcp:save",
	settingsDeleteMcp: "codepiddy:settings:mcp:delete",
	settingsSaveMcpOverride: "codepiddy:settings:mcp:override:save",
	settingsDeleteMcpOverride: "codepiddy:settings:mcp:override:delete",
	settingsMcpAction: "codepiddy:settings:mcp:action",
	settingsListProviders: "codepiddy:settings:providers:list",
	settingsSaveProvider: "codepiddy:settings:providers:save",
	settingsDeleteProvider: "codepiddy:settings:providers:delete",
	llamaCppConfigGet: "codepiddy:llama-cpp:config:get",
	llamaCppConfigSave: "codepiddy:llama-cpp:config:save",
	llamaCppConfigClear: "codepiddy:llama-cpp:config:clear",
	llamaCppStatus: "codepiddy:llama-cpp:status",
	llamaCppAction: "codepiddy:llama-cpp:action",
	llamaCppSearch: "codepiddy:llama-cpp:search",
	llamaCppDetails: "codepiddy:llama-cpp:details",
	llamaCppEvent: "codepiddy:llama-cpp:event",
	settingsStatus: "codepiddy:settings:status",
	piRuntimeStatus: "codepiddy:pi-runtime:status",
	piRuntimeCheck: "codepiddy:pi-runtime:check",
	piRuntimeInstall: "codepiddy:pi-runtime:install",
	piRuntimeRollback: "codepiddy:pi-runtime:rollback",
	piRuntimeRestart: "codepiddy:pi-runtime:restart",
	diagnosticsInfo: "codepiddy:diagnostics:info",
	diagnosticsExport: "codepiddy:diagnostics:export",
	searchProjectFiles: "codepiddy:project:files:search",
	listWorkspaceDir: "codepiddy:workspace:dir:list",
	readWorkspaceFile: "codepiddy:workspace:file:read",
	startTerminal: "codepiddy:terminal:start",
	writeTerminal: "codepiddy:terminal:write",
	resizeTerminal: "codepiddy:terminal:resize",
	killTerminal: "codepiddy:terminal:kill",
	terminalEvent: "codepiddy:terminal:event",
	sendAgentPrompt: "codepiddy:agent:prompt",
} as const;

interface TerminalSession {
	terminalId: string;
	projectRoot: string;
	ownerId: number;
	shell: string;
	profileName: string | null;
	fontFamily: string | null;
	fontSize: number | null;
	cursorStyle: TerminalCursorStyle | null;
	pty: IPty;
}

const terminalSessions = new Map<string, TerminalSession>();
const terminalOwnerCleanupRegistered = new Set<number>();

const DEFAULT_TERMINAL_COLS = 80;
const DEFAULT_TERMINAL_ROWS = 24;

interface ResolvedTerminalShell {
	command: string;
	args: string[];
	label: string;
	profileName: string | null;
	fontFamily: string | null;
	fontSize: number | null;
	cursorStyle: TerminalCursorStyle | null;
}

function resolveTerminalShell(): ResolvedTerminalShell {
	if (process.platform === "win32") {
		// 优先跟随本机 Windows Terminal 的默认 profile（只读标准配置路径，不做机器特定写死）。
		const profile = readWindowsTerminalProfile();
		if (profile) {
			return {
				command: profile.command,
				args: profile.args,
				label: profile.label,
				profileName: profile.name,
				fontFamily: profile.fontFamily,
				fontSize: profile.fontSize,
				cursorStyle: profile.cursorStyle,
			};
		}
		if (spawnSync("where.exe", ["pwsh.exe"], { windowsHide: true }).status === 0) {
			const version = spawnSync(
				"pwsh.exe",
				["-NoLogo", "-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"],
				{ encoding: "utf8", windowsHide: true },
			).stdout.trim();
			// 没有 WT 配置时回退到 PATH 上的 pwsh，同样不传 -NoProfile，让 profile 正常加载。
			return {
				command: "pwsh.exe",
				args: [],
				label: version ? `PowerShell ${version}` : "PowerShell",
				profileName: null,
				fontFamily: null,
				fontSize: null,
				cursorStyle: null,
			};
		}
		return {
			command: "powershell.exe",
			args: [],
			label: "Windows PowerShell",
			profileName: null,
			fontFamily: null,
			fontSize: null,
			cursorStyle: null,
		};
	}
	const command = process.env.SHELL || "/bin/bash";
	return {
		command,
		args: ["-l"],
		label: path.basename(command),
		profileName: null,
		fontFamily: null,
		fontSize: null,
		cursorStyle: null,
	};
}

function sendTerminalEvent(session: TerminalSession, event: Omit<TerminalClientEvent, "terminalId">): void {
	const owner = webContents.fromId(session.ownerId);
	if (!owner || owner.isDestroyed()) return;
	owner.send(channels.terminalEvent, { terminalId: session.terminalId, ...event } satisfies TerminalClientEvent);
}

function stopTerminalSession(terminalId: string): void {
	const session = terminalSessions.get(terminalId);
	if (!session) return;
	terminalSessions.delete(terminalId);
	try {
		session.pty.kill();
	} catch {
		// 进程可能已经退出。
	}
}

function stopOwnerTerminals(ownerId: number): void {
	for (const [terminalId, session] of terminalSessions) {
		if (session.ownerId === ownerId) stopTerminalSession(terminalId);
	}
}

function stopProjectTerminals(projectRoot: string): void {
	const key = process.platform === "win32" ? path.resolve(projectRoot).toLowerCase() : path.resolve(projectRoot);
	for (const [terminalId, session] of terminalSessions) {
		const sessionKey =
			process.platform === "win32"
				? path.resolve(session.projectRoot).toLowerCase()
				: path.resolve(session.projectRoot);
		if (sessionKey === key) stopTerminalSession(terminalId);
	}
}

function stopAllTerminals(): void {
	for (const terminalId of [...terminalSessions.keys()]) stopTerminalSession(terminalId);
}

function requireTerminalSession(terminalId: string, ownerId: number): TerminalSession {
	const session = terminalSessions.get(terminalId);
	if (!session || session.ownerId !== ownerId) throw new Error("终端会话不存在或已结束");
	return session;
}

function roleLabel(role: AgentRole): string {
	if (role === "requirement-analysis") return "需求分析 Agent";
	if (role === "coding") return "Coding Agent";
	if (role === "bug-fix") return "Bug Fix Agent";
	return "Review Agent";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMcpRuntimeSnapshot(value: unknown): McpRuntimeSnapshot {
	if (!isRecord(value)) return { servers: [], errors: [] };
	const servers = Array.isArray(value.servers)
		? value.servers.flatMap((entry): McpRuntimeSnapshot["servers"] => {
				if (!isRecord(entry) || typeof entry.name !== "string") return [];
				const state =
					entry.state === "connected" ||
					entry.state === "disabled" ||
					entry.state === "failed" ||
					entry.state === "disconnected" ||
					entry.state === "needs-auth" ||
					entry.state === "starting"
						? entry.state
						: "unknown";
				const exposure =
					entry.exposure === "codemode" ||
					entry.exposure === "deferred" ||
					entry.exposure === "direct" ||
					entry.exposure === "hidden"
						? entry.exposure
						: "codemode";
				return [
					{
						name: entry.name,
						scope: typeof entry.scope === "string" ? entry.scope : "global",
						source: typeof entry.source === "string" ? entry.source : "",
						enabled: entry.enabled !== false,
						exposure,
						transport: typeof entry.transport === "string" ? entry.transport : "",
						state,
						tools: Array.isArray(entry.tools)
							? entry.tools.flatMap((tool) =>
									typeof tool === "string"
										? [{ name: tool }]
										: isRecord(tool) && typeof tool.name === "string"
											? [
													{
														name: tool.name,
														...(typeof tool.description === "string"
															? { description: tool.description }
															: {}),
													},
												]
											: [],
								)
							: [],
						...(typeof entry.error === "string" && entry.error ? { error: entry.error } : {}),
					},
				];
			})
		: [];
	return {
		servers,
		errors: Array.isArray(value.errors)
			? value.errors.filter((entry): entry is string => typeof entry === "string")
			: [],
	};
}

function parseContextUsage(value: unknown): AgentContextUsage | undefined {
	if (!isRecord(value) || typeof value.contextWindow !== "number" || value.contextWindow <= 0) return undefined;
	return {
		tokens: typeof value.tokens === "number" ? value.tokens : null,
		contextWindow: value.contextWindow,
		percent: typeof value.percent === "number" ? value.percent : null,
	};
}

function parseAgentSessionStats(value: unknown): AgentSessionStats {
	if (!isRecord(value) || typeof value.sessionId !== "string") throw new Error("Pi Session 统计信息无效");
	const tokens = isRecord(value.tokens) ? value.tokens : {};
	const number = (candidate: unknown): number =>
		typeof candidate === "number" && Number.isFinite(candidate) ? candidate : 0;
	const contextUsage = parseContextUsage(value.contextUsage);
	return {
		...(typeof value.sessionFile === "string" ? { sessionFile: value.sessionFile } : {}),
		sessionId: value.sessionId,
		userMessages: number(value.userMessages),
		assistantMessages: number(value.assistantMessages),
		toolCalls: number(value.toolCalls),
		toolResults: number(value.toolResults),
		totalMessages: number(value.totalMessages),
		tokens: {
			input: number(tokens.input),
			output: number(tokens.output),
			cacheRead: number(tokens.cacheRead),
			cacheWrite: number(tokens.cacheWrite),
			total: number(tokens.total),
		},
		cost: number(value.cost),
		...(contextUsage ? { contextUsage } : {}),
	};
}

function parseCacheWarmingDecision(value: unknown): CacheWarmingDecisionSummary | null {
	if (!isRecord(value)) return null;
	const number = (candidate: unknown): number | null =>
		typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
	const warmCost = number(value.warmCost);
	const missCost = number(value.missCost);
	const continuationProbability = number(value.continuationProbability);
	const expectedSavings = number(value.expectedSavings);
	const action = value.action === "warm" || value.action === "stop" ? value.action : null;
	if (
		warmCost === null ||
		missCost === null ||
		continuationProbability === null ||
		expectedSavings === null ||
		!action ||
		typeof value.updatedAt !== "string"
	) {
		return null;
	}
	return { warmCost, missCost, continuationProbability, expectedSavings, action, updatedAt: value.updatedAt };
}

function sessionEntryText(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(sessionEntryText).filter(Boolean).join("\n");
	if (!isRecord(value)) return "";
	if (value.type === "text" && typeof value.text === "string") return value.text;
	if ("content" in value) return sessionEntryText(value.content);
	if (typeof value.summary === "string") return value.summary;
	if (typeof value.text === "string") return value.text;
	return "";
}

function flattenSessionTree(
	tree: unknown[],
	leafId: string | null,
	forkableIds: ReadonlySet<string>,
): AgentSessionNode[] {
	const result: AgentSessionNode[] = [];
	const visit = (value: unknown, depth: number): void => {
		if (!isRecord(value) || !isRecord(value.entry)) return;
		const entry = value.entry;
		if (typeof entry.id !== "string" || typeof entry.type !== "string") return;
		const message = isRecord(entry.message) ? entry.message : null;
		const role = message && typeof message.role === "string" ? message.role : undefined;
		const label = typeof value.label === "string" ? value.label : undefined;
		const rawText = message ? sessionEntryText(message.content) : sessionEntryText(entry);
		const fallbackText =
			entry.type === "model_change" && typeof entry.modelId === "string"
				? `模型：${typeof entry.provider === "string" ? `${entry.provider}/` : ""}${entry.modelId}`
				: entry.type === "thinking_level_change" && typeof entry.thinkingLevel === "string"
					? `推理等级：${entry.thinkingLevel}`
					: entry.type.replaceAll("_", " ");
		result.push({
			entryId: entry.id,
			parentId: typeof entry.parentId === "string" ? entry.parentId : null,
			type: entry.type,
			...(role ? { role } : {}),
			...(label ? { label } : {}),
			text: (rawText || label || fallbackText).trim(),
			...(typeof entry.timestamp === "string" ? { timestamp: entry.timestamp } : {}),
			depth,
			isLeaf: entry.id === leafId,
			forkable: forkableIds.has(entry.id),
		});
		const children = Array.isArray(value.children) ? value.children : [];
		for (const child of children) visit(child, depth + 1);
	};
	for (const root of tree) visit(root, 0);
	return result;
}

const SESSION_FILE_SUFFIX = ".jsonl";

async function readSessionFileSummary(filePath: string, currentSessionId: string): Promise<AgentSessionSummary | null> {
	let raw: string;
	try {
		raw = await readFile(filePath, "utf8");
	} catch {
		return null;
	}
	let sessionId: string | null = null;
	let createdAt: string | null = null;
	let name: string | null = null;
	let preview = "";
	let messageCount = 0;
	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		let entry: unknown;
		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}
		if (!isRecord(entry)) continue;
		if (entry.type === "session" && typeof entry.id === "string") {
			sessionId = entry.id;
			if (typeof entry.timestamp === "string") createdAt = entry.timestamp;
			continue;
		}
		if (entry.type === "session_info" && typeof entry.name === "string" && entry.name.trim()) {
			name = entry.name.trim();
			continue;
		}
		if (entry.type === "message") {
			messageCount += 1;
			const message = isRecord(entry.message) ? entry.message : null;
			if (!preview && message?.role === "user") {
				preview = sessionEntryText(message.content).trim().slice(0, 140);
			}
		}
	}
	if (!sessionId) return null;
	const info = await stat(filePath).catch(() => null);
	return {
		sessionId,
		name,
		preview,
		messageCount,
		createdAt,
		updatedAt: info ? new Date(info.mtimeMs).toISOString() : null,
		isCurrent: sessionId === currentSessionId,
	};
}

async function readSessionHeader(filePath: string): Promise<{ sessionId: string; cwd: string | null }> {
	let raw: string;
	try {
		raw = await readFile(filePath, "utf8");
	} catch {
		throw new Error("找不到要导入的 JSONL 会话文件");
	}
	const firstLine = raw.split(/\r?\n/, 1)[0]?.trim();
	if (!firstLine) throw new Error("JSONL 会话文件为空");
	let entry: unknown;
	try {
		entry = JSON.parse(firstLine);
	} catch {
		throw new Error("JSONL 会话文件头不是有效 JSON");
	}
	if (!isRecord(entry) || entry.type !== "session" || typeof entry.id !== "string" || !entry.id.trim()) {
		throw new Error("JSONL 文件不是 Pi Session");
	}
	return {
		sessionId: entry.id.trim(),
		cwd: typeof entry.cwd === "string" && entry.cwd.trim() ? entry.cwd.trim() : null,
	};
}

async function findSessionFileById(sessionDirectory: string, sessionId: string): Promise<string | null> {
	let fileNames: string[] = [];
	try {
		fileNames = (await readdir(sessionDirectory)).filter((name) => name.endsWith(SESSION_FILE_SUFFIX));
	} catch {
		return null;
	}
	for (const name of fileNames) {
		const filePath = path.join(sessionDirectory, name);
		const header = await readSessionHeader(filePath).catch(() => null);
		if (header?.sessionId === sessionId) return filePath;
	}
	return null;
}

async function importSessionFile(
	sourcePath: string,
	sessionDirectory: string,
): Promise<{ destinationPath: string; sessionId: string; copied: boolean }> {
	const source = path.resolve(sourcePath);
	const header = await readSessionHeader(source);
	const existing = await findSessionFileById(sessionDirectory, header.sessionId);
	if (existing) return { destinationPath: existing, sessionId: header.sessionId, copied: false };
	await mkdir(sessionDirectory, { recursive: true });
	const parsed = path.parse(source);
	let suffix = 0;
	let destinationPath = path.join(sessionDirectory, parsed.base);
	while (true) {
		try {
			await copyFile(source, destinationPath, constants.COPYFILE_EXCL);
			break;
		} catch (error) {
			if (
				typeof error !== "object" ||
				error === null ||
				!("code" in error) ||
				(error as { code?: unknown }).code !== "EEXIST"
			) {
				throw error;
			}
			suffix += 1;
			destinationPath = path.join(sessionDirectory, `${parsed.name}-${suffix}${parsed.ext}`);
		}
	}
	return { destinationPath, sessionId: header.sessionId, copied: true };
}

function selectedSessionFilePath(sessionDirectory: string): string {
	return path.join(path.dirname(sessionDirectory), "selected-session.json");
}

async function readSelectedSessionId(sessionDirectory: string): Promise<string | null> {
	try {
		const parsed: unknown = JSON.parse(await readFile(selectedSessionFilePath(sessionDirectory), "utf8"));
		return isRecord(parsed) && typeof parsed.sessionId === "string" && parsed.sessionId ? parsed.sessionId : null;
	} catch {
		return null;
	}
}

async function writeSelectedSessionId(sessionDirectory: string, sessionId: string | null): Promise<void> {
	const filePath = selectedSessionFilePath(sessionDirectory);
	if (!sessionId) {
		await rm(filePath, { force: true });
		return;
	}
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify({ sessionId })}\n`, "utf8");
}

async function readWorkItemPromptContext(agent: StoredAgentInstance): Promise<{ title: string; description: string }> {
	try {
		const value = JSON.parse(await readFile(path.join(agent.workItemDirectory, "work-item.json"), "utf8")) as unknown;
		if (!isRecord(value)) return { title: agent.workItemId, description: "" };
		return {
			title: typeof value.title === "string" ? value.title : agent.workItemId,
			description: typeof value.description === "string" ? value.description : "",
		};
	} catch {
		return { title: agent.workItemId, description: "" };
	}
}

function roleDocumentContract(agent: StoredAgentInstance): string {
	const sharedRules = [
		"Never read or write another Work Item directory unless the user explicitly names it.",
		`Current Work Item directory: ${agent.workItemDirectory}.`,
		"Inspect only materials that actually exist for this Work Item, including relevant project-level OpenSpec materials if present. Do not assume a named document or Change exists.",
		"Use the user-provided title and description to identify related materials. If several candidates match, ask instead of guessing.",
		"The actual materials, code changes, and tests are the handoff. Do not require or invent files with fixed names.",
	];
	if (agent.role === "requirement-analysis") {
		return [
			...sharedRules,
			"Start from the user-provided title and description. There are no prerequisite handoff artifacts.",
			"Use grill-with-docs to clarify the requirement, then the enabled Skills to create or refine the actual handoff materials.",
			"Stop when the actual handoff materials are coherent and tell the user they are ready for manual approval. Do not implement code.",
		].join("\n");
	}
	if (agent.role === "coding") {
		return [
			...sharedRules,
			"Inspect the current Work Item directory and any related project-level materials that actually exist before editing code.",
			"If a matching OpenSpec Change exists, use openspec-apply-change and keep its task status synchronized. Otherwise work from the actual handoff and ask about essential missing decisions.",
			"The implementation handoff is the actual work materials plus the real Git diff and tests; do not require a fixed document name.",
		].join("\n");
	}
	if (agent.role === "bug-fix") {
		return [
			...sharedRules,
			"Start from the Bug title, description, and current Work Item directory; reproduce the issue and inspect only existing related materials.",
			"Use OpenSpec explore/propose/update/apply as needed to keep the problem, decision, tasks, fix, and validation coherent.",
			"The fix handoff is the actual work materials plus the real Git diff and tests; do not require a fixed document name.",
		].join("\n");
	}
	return [
		...sharedRules,
		"Read the materials actually present for this Work Item and independently inspect the real Git diff and tests.",
		"Use open-code-review for structured findings. Add or modify tests when useful, but do not modify production code.",
		"Record findings in a relevant existing location or a user-selected project location; no fixed document name is required.",
	].join("\n");
}

async function rolePrompt(agent: StoredAgentInstance, webSearchAvailable: boolean): Promise<string> {
	const webSearchToolName = "mcp__web_search__web_search";
	const [profile, workItem] = await Promise.all([
		readRoleProfile(agent.projectRoot, agent.role),
		readWorkItemPromptContext(agent),
	]);
	return [
		`<active_agent name="${agent.role}">`,
		"# CodePIddy Runtime Context",
		`Project root: ${agent.projectRoot}`,
		`Work item: ${agent.workItemId}`,
		`Work item directory: ${agent.workItemDirectory}`,
		`User-provided title: ${workItem.title}`,
		`User-provided description: ${workItem.description || "No description provided."}`,
		"Actually existing materials produced by the enabled Skills and related to this Work Item are the workflow handoff source of truth; do not assume any specific file exists.",
		"",
		"# Web Search Contract",
		webSearchAvailable
			? `${webSearchToolName} is a search engine only. It returns ranked results and snippets; it never opens, fetches, reads, crawls, maps, or extracts a webpage. If the user asks to inspect a specific URL, explain that limitation and use keyword/domain search only for discoverable snippets. Never claim that a webpage was read from the web search results.`
			: "The native MCP web search tool is unavailable because Tavily is not configured. Do not attempt to call it; tell the user that web search requires configuration in CodePIddy Settings.",
		"",
		profile,
		"# Work Item and OpenSpec Contract",
		roleDocumentContract(agent),
		"",
		"# Tool Failure Recovery",
		"A denied, unavailable, or failed tool call is recoverable. Never end the turn silently only because a tool failed. Read the error, do not repeat the same blocked call unchanged, continue with an allowed path or a tool-free alternative when possible, and tell the user what was blocked if recovery is impossible.",
	].join("\n");
}

async function probePiUpdate(
	runtime: InstalledPiRuntime,
	stagingRoot: string,
	repositoryRoot: string,
	userDataRoot: string,
): Promise<void> {
	const packaged = app.isPackaged;
	const extensions = packaged
		? path.join(repositoryRoot, "extensions")
		: path.join(app.getAppPath(), "dist", "runtime-extensions");
	const probeDirectories = ["probe-project", "probe-sessions", "probe-logs", "probe-agent"].map((name) =>
		path.join(stagingRoot, name),
	);
	if (probeDirectories.some((directory) => path.dirname(directory) !== stagingRoot))
		throw new Error("Pi 校验目录无效");
	const [projectRoot] = probeDirectories;
	if (!projectRoot) throw new Error("Pi 校验目录无效");
	await mkdir(projectRoot, { recursive: true });
	const rpc = new PiRpcProcess({
		command: process.env.CODEPIDDY_NODE_EXECUTABLE ?? (packaged ? process.execPath : "node"),
		cwd: projectRoot,
		env: {
			...(packaged ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
			PI_PACKAGE_DIR: runtime.packageDir,
			PI_CODING_AGENT_DIR: path.join(stagingRoot, "probe-agent"),
			PI_PERMISSION_SYSTEM_CONFIG_PATH: path.join(userDataRoot, "permissions", "extension.json"),
			PI_PERMISSION_SYSTEM_LOGS_DIR: path.join(stagingRoot, "probe-logs"),
			PI_PERMISSION_SYSTEM_POLICY_AGENT_DIR: path.join(userDataRoot, "permissions", "policy"),
		},
		args: [
			runtime.cliPath,
			"--mode",
			"rpc",
			"--no-extensions",
			"--session-dir",
			path.join(stagingRoot, "probe-sessions"),
			"--continue",
			"--extension",
			"builtin:codemode",
			"--extension",
			"builtin:tool-search",
			"--extension",
			"builtin:mcp",
			"--extension",
			path.join(extensions, "permission.js"),
			"--extension",
			path.join(extensions, "review.js"),
			"--extension",
			path.join(extensions, "retry.js"),
			"--extension",
			path.join(extensions, "cache-warming.js"),
			"--approve",
		],
	});
	try {
		await rpc.start();
		const commands = await rpc.getCommands();
		if (commands.length === 0) throw new Error("Pi 更新校验失败：RPC 命令列表为空");
		await rpc.getMessages();
		await rpc.getAvailableModels();
	} finally {
		await rpc.stop().catch(() => undefined);
		for (const directory of probeDirectories) await rm(directory, { recursive: true, force: true });
	}
}

class AgentManager {
	private readonly registry: AgentRegistry;
	private readonly repositoryRoot: string;
	private readonly runtimeRoot: string;
	private readonly writeLeases: ProjectWriteLeaseManager;
	private readonly settingsStore: AppSettingsStore;
	private readonly piRuntimeUpdater: PiRuntimeUpdater;
	private readonly processes = new Map<string, PiRpcProcess>();
	private readonly processAgents = new Map<string, StoredAgentInstance>();
	private readonly processStarts = new SingleFlightMap<string, PiRpcProcess>();
	private readonly pendingPermissions = new Map<string, PendingPermissionRequest>();
	private readonly builtinCommandsCache = new Map<string, AgentCommandOption[]>();
	private readonly recentDiagnosticsErrors: DiagnosticsErrorEntry[] = [];

	constructor(
		runtimeRoot: string,
		repositoryRoot: string,
		settingsStore: AppSettingsStore,
		piRuntimeUpdater: PiRuntimeUpdater,
	) {
		this.registry = new AgentRegistry(runtimeRoot);
		this.runtimeRoot = runtimeRoot;
		this.writeLeases = new ProjectWriteLeaseManager(runtimeRoot);
		this.repositoryRoot = repositoryRoot;
		this.settingsStore = settingsStore;
		this.piRuntimeUpdater = piRuntimeUpdater;
	}

	get repositoryPath(): string {
		return this.repositoryRoot;
	}

	decorate(project: ProjectSummary): Promise<ProjectSummary> {
		return this.registry.decorateProject(project);
	}

	async create(input: CreateAgentInput): Promise<ProjectSummary> {
		const project = await openProject(input.projectRoot);
		const workItem = project.lanes
			.find((lane) => lane.kind === input.lane)
			?.workItems.find((item) => item.id === input.workItemId);
		const slot = workItem?.agentSlots.find((candidate) => candidate.role === input.role);
		if (!workItem || !slot) throw new Error("Agent slot not found");
		if (project.id !== input.projectId) throw new Error("Project ID 与项目路径不匹配");
		if (workItem.lane !== input.lane) throw new Error("Work Item Lane 不匹配");
		if (path.resolve(workItem.directoryPath) !== path.resolve(input.workItemDirectory)) {
			throw new Error("Work Item 路径不匹配");
		}
		assertPathInside(project.codepiddyPath, workItem.directoryPath, "Work Item 路径");
		const [realCodepiddyPath, realWorkItemPath] = await Promise.all([
			realpath(project.codepiddyPath),
			realpath(workItem.directoryPath),
		]);
		assertPathInside(realCodepiddyPath, realWorkItemPath, "Work Item 真实路径");
		await this.registry.create(input);
		return this.decorate(await openProject(input.projectRoot));
	}

	async prompt(input: SendAgentPromptInput): Promise<void> {
		const agent = await this.resolve(input);
		const needsWriteLease = agent.role !== "requirement-analysis";
		if (needsWriteLease) {
			await this.writeLeases.acquire({
				projectId: agent.projectId,
				agentInstanceId: agent.id,
				workItemId: agent.workItemId,
				role: agent.role,
			});
		}
		try {
			const process = await this.ensureProcess(agent);
			await this.registry.setStatus(agent, "running");
			this.broadcast({
				agentInstanceId: agent.id,
				projectId: agent.projectId,
				workItemId: agent.workItemId,
				role: agent.role,
				event: { type: "agent_status", status: "running" },
			});
			await process.prompt(input.message, input.streamingBehavior, input.images);
		} catch (error) {
			if (needsWriteLease) await this.writeLeases.release(agent.projectId, agent.id);
			throw error;
		}
	}

	getWriteLeaseStatus(projectId: string) {
		return this.writeLeases.inspect(projectId);
	}

	async clearStaleWriteLease(projectId: string) {
		await this.writeLeases.clearStale(projectId);
		return this.writeLeases.inspect(projectId);
	}

	async getCommands(input: AgentInstanceLocator): Promise<AgentCommandOption[]> {
		const rpc = await this.ensureProcess(await this.resolve(input));
		const remote = (await rpc.getCommands()).map(
			(command): AgentCommandOption => ({
				name: command.name,
				command: `/${command.name}`,
				description: command.description,
				...(command.argumentHint ? { argumentHint: command.argumentHint } : {}),
				source: command.source,
			}),
		);
		const packageDir =
			this.piRuntimeUpdater.getLaunchRuntime()?.packageDir ??
			(app.isPackaged
				? path.join(this.repositoryRoot, "coding-agent-package")
				: path.join(this.repositoryRoot, "packages", "coding-agent-runtime"));
		// stock Pi 的 `get_commands` 只返回扩展与 Skill，不含内置命令，所以内置项
		// 一律走 `loadPiBuiltinCommands` —— 它直接读当前运行的那份 Pi 的
		// slash-commands.js，不碰 Pi 源码，因此用户从 npm 升级后菜单依然是全的。
		return remote.some((command) => command.source === "builtin")
			? mergePiCommands(remote, [])
			: mergePiCommands(remote, await this.piBuiltinCommands(packageDir));
	}

	private async piBuiltinCommands(packageDir: string): Promise<AgentCommandOption[]> {
		let builtins = this.builtinCommandsCache.get(packageDir);
		if (!builtins) {
			builtins = await loadPiBuiltinCommands(
				packageDir,
				process.env.CODEPIDDY_NODE_EXECUTABLE ?? (app.isPackaged ? process.execPath : "node"),
			);
			this.builtinCommandsCache.set(packageDir, builtins);
		}
		return builtins;
	}

	async runMcpAction(input: McpActionInput): Promise<McpActionResult> {
		const packaged = app.isPackaged;
		const updatedRuntime = this.piRuntimeUpdater.getLaunchRuntime();
		const externalCli = Boolean(process.env.CODEPIDDY_PI_CLI);
		const compiledRuntime = packaged || updatedRuntime !== null || !externalCli;
		const cliPath =
			process.env.CODEPIDDY_PI_CLI ??
			updatedRuntime?.cliPath ??
			(packaged
				? path.join(this.repositoryRoot, "coding-agent-package", "dist", "bundle", "cli.js")
				: path.join(this.repositoryRoot, "packages", "coding-agent-runtime", "dist", "bundle", "cli.js"));
		const nodeExecutable = process.env.CODEPIDDY_NODE_EXECUTABLE ?? (packaged ? process.execPath : "node");
		const tavilyApiKey = await this.settingsStore.getTavilyApiKey();
		const args = [
			...(compiledRuntime
				? [cliPath]
				: [
						"--import",
						pathToFileURL(path.join(this.repositoryRoot, "node_modules", "tsx", "dist", "loader.mjs")).href,
						cliPath,
					]),
			"mcp",
			input.action,
			...(input.name ? [input.name] : []),
			...(input.action === "list" ? ["--json"] : []),
			...(input.action === "login" ? ["--timeout", "300"] : []),
		];
		const env: NodeJS.ProcessEnv = {
			...process.env,
			...(packaged ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
			...(await this.settingsStore.getProviderEnv()),
			...(await this.settingsStore.getMcpEnv()),
			...(tavilyApiKey ? { TAVILY_API_KEY: tavilyApiKey } : {}),
			...(compiledRuntime
				? {
						PI_PACKAGE_DIR:
							updatedRuntime?.packageDir ??
							(packaged
								? path.join(this.repositoryRoot, "coding-agent-package")
								: path.join(this.repositoryRoot, "packages", "coding-agent-runtime")),
					}
				: {}),
		};
		return new Promise<McpActionResult>((resolve, reject) => {
			const child = spawn(nodeExecutable, args, {
				cwd: this.repositoryRoot,
				env,
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
			});
			let stdout = "";
			let stderr = "";
			const appendStdout = (chunk: Buffer): void => {
				stdout = `${stdout}${chunk.toString("utf8")}`.slice(-64 * 1024);
			};
			const appendStderr = (chunk: Buffer): void => {
				stderr = `${stderr}${chunk.toString("utf8")}`.slice(-64 * 1024);
			};
			child.stdout.on("data", appendStdout);
			child.stderr.on("data", appendStderr);
			child.once("error", reject);
			child.once("exit", (code) => {
				const stdoutText = stdout.trim();
				const stderrText = stderr.trim();
				const text = stdoutText || stderrText;
				if (input.action === "list") {
					let snapshot: McpRuntimeSnapshot;
					try {
						snapshot = parseMcpRuntimeSnapshot(JSON.parse(stdoutText || "{}") as unknown);
					} catch {
						snapshot = { servers: [], errors: [stderrText || stdoutText || "Pi MCP list returned no JSON"] };
					}
					resolve({ output: text, snapshot });
				} else if (code === 0) {
					resolve({ output: text });
				} else {
					reject(new Error(text || `Pi MCP ${input.action} exited with code ${code ?? "unknown"}`));
				}
			});
		});
	}

	async getModelSelection(input: AgentInstanceLocator): Promise<AgentModelSelection> {
		const process = await this.ensureProcess(await this.resolve(input));
		const [stateResponse, modelsRaw, levels] = await Promise.all([
			process.getState(),
			process.getAvailableModels(),
			process.getAvailableThinkingLevels(),
		]);
		const data = stateResponse.data as Record<string, unknown>;
		const current = data.model as Record<string, unknown>;
		const parseModel = (value: unknown): AgentModelOption | null => {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
			const model = value as Record<string, unknown>;
			if (typeof model.provider !== "string" || typeof model.id !== "string") return null;
			return {
				provider: model.provider,
				id: model.id,
				name: typeof model.name === "string" ? model.name : model.id,
				reasoning: model.reasoning === true,
			};
		};
		const model = parseModel(current);
		if (!model) throw new Error("当前模型信息不可用");
		return {
			model,
			thinkingLevel: typeof data.thinkingLevel === "string" ? data.thinkingLevel : "off",
			availableThinkingLevels: levels,
			availableModels: modelsRaw.map(parseModel).filter((item): item is AgentModelOption => item !== null),
			enabledModelIds: await this.settingsStore.getEnabledModels(),
		};
	}

	async setModel(input: SetAgentModelInput): Promise<AgentModelSelection> {
		const process = await this.ensureProcess(await this.resolve(input));
		await process.setModel(input.provider, input.modelId);
		return this.getModelSelection(input);
	}

	async getModelScope(input: AgentInstanceLocator): Promise<AgentModelScope> {
		const selection = await this.getModelSelection(input);
		return {
			enabledModelIds: await this.settingsStore.getEnabledModels(),
			availableModels: selection.availableModels,
			applyPending: false,
		};
	}

	async setModelScope(input: SetAgentModelScopeInput): Promise<AgentModelScope> {
		const agent = await this.resolve(input);
		const selection = await this.getModelSelection(input);
		await this.settingsStore.setEnabledModels(input.enabledModelIds);
		const process = this.processes.get(agent.id);
		let applyPending = false;
		if (process?.isRunning) {
			const stateResponse = await process.getState();
			const state = isRecord(stateResponse.data) ? stateResponse.data : {};
			if (state.isStreaming === true || state.isCompacting === true) {
				applyPending = true;
			} else {
				await this.reconnect(input);
			}
		}
		return {
			enabledModelIds: input.enabledModelIds,
			availableModels: selection.availableModels,
			applyPending,
		};
	}

	async setThinking(input: SetAgentThinkingInput): Promise<AgentModelSelection> {
		const process = await this.ensureProcess(await this.resolve(input));
		await process.setThinkingLevel(input.level);
		return this.getModelSelection(input);
	}

	/**
	 * 界面历史必须用完整会话条目（get_entries），不能用 get_messages：
	 * 后者返回压缩后的 LLM 上下文，会话 compact 后前缀消息会消失。Pi 的
	 * RPC 已提供 get_entries，这里只做 message 条目的提取。
	 */
	private async historyMessages(process: PiRpcProcess): Promise<unknown[]> {
		const entries = await process.getEntries();
		return entries.flatMap((entry) => {
			if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
			const record = entry as Record<string, unknown>;
			if (record.type !== "message" || record.message === undefined) return [];
			return [record.message];
		});
	}

	async activate(input: AgentInstanceLocator): Promise<void> {
		const agent = await this.resolve(input);
		const process = await this.ensureProcess(agent);
		await this.persistCurrentSession(agent, process);
		this.broadcast({
			agentInstanceId: agent.id,
			projectId: agent.projectId,
			workItemId: agent.workItemId,
			role: agent.role,
			event: { type: "agent_history", messages: await this.historyMessages(process) },
		});
		const pendingPermission = this.pendingPermissions.get(agent.id);
		if (pendingPermission) {
			if (agent.status !== "waiting") await this.registry.setStatus(agent, "waiting");
			this.broadcast({
				agentInstanceId: agent.id,
				projectId: agent.projectId,
				workItemId: agent.workItemId,
				role: agent.role,
				event: { type: "agent_status", status: "waiting" },
			});
			return;
		}
		const stateResponse = await process.getState();
		const state = isRecord(stateResponse.data) ? stateResponse.data : {};
		const status = state.isStreaming === true || state.isCompacting === true ? "running" : "idle";
		if (agent.status !== status) await this.registry.setStatus(agent, status);
		this.broadcast({
			agentInstanceId: agent.id,
			projectId: agent.projectId,
			workItemId: agent.workItemId,
			role: agent.role,
			event: { type: "agent_status", status },
		});
	}

	async cloneSession(input: AgentInstanceLocator): Promise<void> {
		const agent = await this.resolve(input);
		const process = await this.ensureProcess(agent);
		await process.cloneCurrentSession();
		await this.persistCurrentSession(agent, process);
		this.broadcast({
			agentInstanceId: agent.id,
			projectId: agent.projectId,
			workItemId: agent.workItemId,
			role: agent.role,
			event: { type: "agent_history", messages: await this.historyMessages(process) },
		});
	}

	private async sessionSnapshot(process: PiRpcProcess): Promise<AgentSessionSnapshot> {
		const [stateResponse, treeResult, forkMessages, stats] = await Promise.all([
			process.getState(),
			process.getSessionTree(),
			process.getForkMessages(),
			process.getSessionStats(),
		]);
		const state = isRecord(stateResponse.data) ? stateResponse.data : {};
		const contextUsage = parseContextUsage(stats.contextUsage);
		return {
			sessionId: typeof state.sessionId === "string" ? state.sessionId : "",
			...(typeof state.sessionName === "string" ? { sessionName: state.sessionName } : {}),
			...(typeof state.sessionFile === "string" ? { sessionFile: state.sessionFile } : {}),
			messageCount: typeof state.messageCount === "number" ? state.messageCount : 0,
			pendingMessageCount: typeof state.pendingMessageCount === "number" ? state.pendingMessageCount : 0,
			isStreaming: state.isStreaming === true,
			isCompacting: state.isCompacting === true,
			...(contextUsage ? { contextUsage } : {}),
			leafId: treeResult.leafId,
			nodes: flattenSessionTree(
				treeResult.tree,
				treeResult.leafId,
				new Set(forkMessages.map((message) => message.entryId)),
			),
		};
	}

	async getSessionSnapshot(input: AgentInstanceLocator): Promise<AgentSessionSnapshot> {
		return this.sessionSnapshot(await this.ensureProcess(await this.resolve(input)));
	}

	private async listSessions(process: PiRpcProcess, agent: StoredAgentInstance): Promise<AgentSessionSummary[]> {
		const stateResponse = await process.getState();
		const state = isRecord(stateResponse.data) ? stateResponse.data : {};
		const currentSessionId = typeof state.sessionId === "string" ? state.sessionId : "";
		let fileNames: string[] = [];
		try {
			fileNames = (await readdir(agent.sessionDirectory)).filter((name) => name.endsWith(SESSION_FILE_SUFFIX));
		} catch {
			fileNames = [];
		}
		const summaries = await Promise.all(
			fileNames.map((name) => readSessionFileSummary(path.join(agent.sessionDirectory, name), currentSessionId)),
		);
		return summaries
			.filter((summary): summary is AgentSessionSummary => summary !== null)
			.sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
	}

	async listAgentSessions(input: AgentInstanceLocator): Promise<AgentSessionSummary[]> {
		const agent = await this.resolve(input);
		return this.listSessions(await this.ensureProcess(agent), agent);
	}

	private async resolveSessionFile(agent: StoredAgentInstance, sessionId: string): Promise<string> {
		const filePath = await findSessionFileById(agent.sessionDirectory, sessionId);
		if (filePath) return filePath;
		throw new Error("找不到指定的会话");
	}

	private async sessionSwitchResult(
		process: PiRpcProcess,
		agent: StoredAgentInstance,
	): Promise<AgentSessionSwitchResult> {
		return {
			snapshot: await this.sessionSnapshot(process),
			sessions: await this.listSessions(process, agent),
		};
	}

	async newAgentSession(input: AgentInstanceLocator): Promise<AgentSessionSwitchResult> {
		const agent = await this.resolve(input);
		const process = await this.ensureProcess(agent);
		const result = await process.newSession();
		if (!result.cancelled) {
			await this.persistCurrentSession(agent, process);
			this.broadcast({
				agentInstanceId: agent.id,
				projectId: agent.projectId,
				workItemId: agent.workItemId,
				role: agent.role,
				event: { type: "agent_history", messages: await this.historyMessages(process) },
			});
		}
		return this.sessionSwitchResult(process, agent);
	}

	async switchAgentSession(input: SwitchAgentSessionInput): Promise<AgentSessionSwitchResult> {
		const agent = await this.resolve(input);
		const process = await this.ensureProcess(agent);
		const sessionFile = await this.resolveSessionFile(agent, input.sessionId);
		const result = await process.switchSession(sessionFile);
		if (!result.cancelled) {
			await this.persistCurrentSession(agent, process);
			this.broadcast({
				agentInstanceId: agent.id,
				projectId: agent.projectId,
				workItemId: agent.workItemId,
				role: agent.role,
				event: { type: "agent_history", messages: await this.historyMessages(process) },
			});
		}
		return this.sessionSwitchResult(process, agent);
	}

	async deleteAgentSession(input: SwitchAgentSessionInput): Promise<AgentSessionSummary[]> {
		const agent = await this.resolve(input);
		const process = await this.ensureProcess(agent);
		const stateResponse = await process.getState();
		const state = isRecord(stateResponse.data) ? stateResponse.data : {};
		if (state.sessionId === input.sessionId) throw new Error("不能删除当前正在使用的会话");
		const sessionFile = await this.resolveSessionFile(agent, input.sessionId);
		await rm(sessionFile, { force: true });
		const selectedSessionId = await readSelectedSessionId(agent.sessionDirectory);
		if (selectedSessionId === input.sessionId) await writeSelectedSessionId(agent.sessionDirectory, null);
		return this.listSessions(process, agent);
	}

	async importSession(
		input: AgentInstanceLocator & { sessionPath: string },
	): Promise<AgentSessionSwitchResult | null> {
		const agent = await this.resolve(input);
		const process = await this.ensureProcess(agent);
		const imported = await importSessionFile(input.sessionPath, agent.sessionDirectory);
		try {
			const result = await process.switchSession(imported.destinationPath);
			if (result.cancelled) {
				if (imported.copied) await rm(imported.destinationPath, { force: true });
				return null;
			}
			await this.persistCurrentSession(agent, process);
			this.broadcast({
				agentInstanceId: agent.id,
				projectId: agent.projectId,
				workItemId: agent.workItemId,
				role: agent.role,
				event: { type: "agent_history", messages: await this.historyMessages(process) },
			});
			return this.sessionSwitchResult(process, agent);
		} catch (error) {
			if (imported.copied) await rm(imported.destinationPath, { force: true });
			throw error;
		}
	}

	async getSessionStats(input: AgentInstanceLocator): Promise<AgentSessionStats> {
		const agent = await this.resolve(input);
		const process = await this.ensureProcess(agent);
		const stats = parseAgentSessionStats(await process.getSessionStats());
		return { ...stats, cacheWarming: await this.readCacheWarmingStatus(agent) };
	}

	/**
	 * Pi 1.0.1 的 RPC 不返回 session.cacheWarmingStatus，只通过扩展事件暴露每次决策。
	 * 扩展把最近一次决策写到 runtimeRoot/cache-warming/<agent>.json，这里读取后并入会话统计。
	 */
	private cacheWarmingStatusPath(agentInstanceId: string): string {
		return path.join(this.runtimeRoot, "cache-warming", `${agentInstanceId}.json`);
	}

	private async readCacheWarmingStatus(agent: StoredAgentInstance): Promise<AgentSessionStats["cacheWarming"]> {
		const settings = await this.settingsStore.getCacheWarmingSettings();
		let decision: CacheWarmingDecisionSummary | null = null;
		try {
			decision = parseCacheWarmingDecision(
				JSON.parse(await readFile(this.cacheWarmingStatusPath(agent.id), "utf8")),
			);
		} catch {
			decision = null;
		}
		return { ...settings, decision };
	}

	async getDiagnosticsAgentSnapshot(locator?: AgentInstanceLocator): Promise<DiagnosticsAgentSnapshot | null> {
		if (!locator) return null;
		const agent = await this.resolve(locator);
		const process = this.processes.get(agent.id);
		let state: Record<string, unknown> | null = null;
		let stats: AgentSessionStats | null = null;
		if (process?.isRunning) {
			try {
				const stateResponse = await process.getState();
				state = isRecord(stateResponse.data) ? stateResponse.data : null;
			} catch (error) {
				this.recordDiagnosticsError("agent-state", error);
			}
			try {
				stats = parseAgentSessionStats(await process.getSessionStats());
			} catch (error) {
				this.recordDiagnosticsError("agent-session-stats", error);
			}
		}
		const selectedSessionId = await readSelectedSessionId(agent.sessionDirectory);
		const stateSessionFile = typeof state?.sessionFile === "string" ? state.sessionFile : null;
		const sessionFile =
			stateSessionFile ??
			(selectedSessionId ? await findSessionFileById(agent.sessionDirectory, selectedSessionId) : null);
		const sessionSummary = sessionFile
			? await readSessionFileSummary(
					sessionFile,
					selectedSessionId ?? (typeof state?.sessionId === "string" ? state.sessionId : ""),
				)
			: null;
		return {
			locator,
			status: agent.status,
			sessionDirectory: agent.sessionDirectory,
			sessionFile,
			sessionSummary,
			state,
			stats,
		};
	}

	getRecentDiagnosticsErrors(): DiagnosticsErrorEntry[] {
		return [...this.recentDiagnosticsErrors];
	}

	async forkSession(input: ForkAgentSessionInput): Promise<ForkAgentSessionResult> {
		const agent = await this.resolve(input);
		const process = await this.ensureProcess(agent);
		const result = await process.forkAt(input.entryId);
		if (!result.cancelled) {
			await this.persistCurrentSession(agent, process);
			this.broadcast({
				agentInstanceId: agent.id,
				projectId: agent.projectId,
				workItemId: agent.workItemId,
				role: agent.role,
				event: { type: "agent_history", messages: await this.historyMessages(process) },
			});
		}
		return {
			selectedText: result.text,
			cancelled: result.cancelled,
			snapshot: await this.sessionSnapshot(process),
		};
	}

	async shareSession(input: AgentInstanceLocator): Promise<ShareAgentSessionResult> {
		const agent = await this.resolve(input);
		const rpcProcess = await this.ensureProcess(agent);
		const stateResponse = await rpcProcess.getState();
		const state = isRecord(stateResponse.data) ? stateResponse.data : {};
		const sessionFile = typeof state.sessionFile === "string" ? state.sessionFile : "";
		if (!sessionFile) throw new Error("当前 Session 没有可分享的 JSONL 文件");

		const tempDir = await mkdtemp(path.join(tmpdir(), "codepiddy-share-"));
		try {
			const htmlFile = path.join(tempDir, "session.html");
			await rpcProcess.exportHtml(htmlFile);
			const packageDir =
				this.piRuntimeUpdater.getLaunchRuntime()?.packageDir ??
				(app.isPackaged
					? path.join(this.repositoryRoot, "coding-agent-package")
					: path.join(this.repositoryRoot, "packages", "coding-agent-runtime"));
			const helperPath = app.isPackaged
				? path.join(this.repositoryRoot, "extensions", "pi-share-helper.mjs")
				: path.join(app.getAppPath(), "dist", "runtime-extensions", "pi-share-helper.mjs");
			const nodeExecutable = process.env.CODEPIDDY_NODE_EXECUTABLE ?? (app.isPackaged ? process.execPath : "node");
			const githubCliPath = await this.settingsStore.getGitHubCliPath();
			const args = [
				helperPath,
				"--package-dir",
				packageDir,
				"--agent-dir",
				resolvePiAgentDir(),
				"--session-file",
				sessionFile,
				"--html-file",
				htmlFile,
				"--cwd",
				agent.projectRoot,
				...(githubCliPath ? ["--gh-path", githubCliPath] : []),
			];
			return await new Promise<ShareAgentSessionResult>((resolve, reject) => {
				const child = spawn(nodeExecutable, args, {
					cwd: this.repositoryRoot,
					env: {
						...process.env,
						ELECTRON_RUN_AS_NODE: "1",
						PI_PACKAGE_DIR: packageDir,
					},
					stdio: ["ignore", "pipe", "pipe"],
					windowsHide: true,
				});
				let stdout = "";
				let stderr = "";
				child.stdout.on("data", (chunk: Buffer) => {
					stdout = `${stdout}${chunk.toString("utf8")}`.slice(-128 * 1024);
				});
				child.stderr.on("data", (chunk: Buffer) => {
					stderr = `${stderr}${chunk.toString("utf8")}`.slice(-128 * 1024);
				});
				child.once("error", reject);
				child.once("exit", (code) => {
					const lastLine = stdout
						.split(/\r?\n/)
						.map((line) => line.trim())
						.filter(Boolean)
						.at(-1);
					if (code !== 0) {
						reject(new Error(stderr.trim() || "分享会话失败"));
						return;
					}
					try {
						const parsed = JSON.parse(lastLine ?? "") as ShareAgentSessionResult;
						if (
							(parsed.provider !== "radius" && parsed.provider !== "github") ||
							typeof parsed.viewerUrl !== "string" ||
							!parsed.viewerUrl
						) {
							throw new Error("分享服务返回的数据无效");
						}
						resolve(parsed);
					} catch (error) {
						reject(error instanceof Error ? error : new Error("分享服务返回的数据无效"));
					}
				});
			});
		} finally {
			await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
		}
	}

	async reset(input: ResetAgentInput): Promise<ProjectSummary> {
		const agent = await this.resolve(input);
		if (path.resolve(agent.projectRoot) !== path.resolve(input.projectRoot)) throw new Error("项目路径不匹配");
		if (path.resolve(agent.workItemDirectory) !== path.resolve(input.workItemDirectory)) {
			throw new Error("Work Item 路径不匹配");
		}
		if (agent.lane !== input.lane) throw new Error("Work Item Lane 不匹配");
		const process = this.processes.get(agent.id);
		this.processes.delete(agent.id);
		this.processAgents.delete(agent.id);
		this.pendingPermissions.delete(agent.id);
		if (process) await process.stop();
		if (agent.role !== "requirement-analysis") await this.writeLeases.release(agent.projectId, agent.id);
		await this.registry.reset(input);
		return this.decorate(await openProject(input.projectRoot));
	}

	async respondToExtensionUi(input: ExtensionUiResponseInput): Promise<void> {
		const pending = this.pendingPermissions.get(input.agentInstanceId);
		if (!pending || pending.requestId !== input.requestId) return;
		const process = this.processes.get(input.agentInstanceId);
		if (!process) {
			this.pendingPermissions.delete(input.agentInstanceId);
			return;
		}
		if (input.cancelled !== true) {
			if (pending.method === "select" && (input.value === undefined || !pending.options.includes(input.value))) {
				throw new Error("权限选择值不在允许选项中");
			}
			if (pending.method === "confirm" && typeof input.confirmed !== "boolean") {
				throw new Error("确认权限请求必须提交布尔值");
			}
			if ((pending.method === "input" || pending.method === "editor") && input.value === undefined) {
				throw new Error("权限输入请求缺少 value");
			}
		}
		await process.respondToExtensionUi({
			id: input.requestId,
			...(input.value === undefined ? {} : { value: input.value }),
			...(input.confirmed === undefined ? {} : { confirmed: input.confirmed }),
			...(input.cancelled === undefined ? {} : { cancelled: input.cancelled }),
		});
		if (this.pendingPermissions.get(input.agentInstanceId)?.requestId === input.requestId) {
			this.pendingPermissions.delete(input.agentInstanceId);
		}
	}

	async getPendingPermissionRequest(input: AgentInstanceLocator): Promise<PendingPermissionRequest | null> {
		await this.resolve(input);
		return this.pendingPermissions.get(input.agentInstanceId) ?? null;
	}

	async abort(input: AgentInstanceLocator): Promise<void> {
		const process = this.processes.get(input.agentInstanceId);
		const pending = this.pendingPermissions.get(input.agentInstanceId);
		if (process && pending) {
			await process.respondToExtensionUi({ id: pending.requestId, cancelled: true });
			this.pendingPermissions.delete(input.agentInstanceId);
		}
		if (process) await process.abort();
	}

	async reconnect(input: AgentInstanceLocator): Promise<void> {
		const agent = await this.resolve(input);
		this.broadcast({
			agentInstanceId: agent.id,
			projectId: agent.projectId,
			workItemId: agent.workItemId,
			role: agent.role,
			event: { type: "process_recovery_start", attempt: 1, manual: true },
		});
		const current = this.processes.get(agent.id);
		const pending = this.pendingPermissions.get(agent.id);
		if (current && pending) await current.respondToExtensionUi({ id: pending.requestId, cancelled: true });
		this.pendingPermissions.delete(agent.id);
		this.processes.delete(agent.id);
		this.processAgents.delete(agent.id);
		if (current) await current.stop();
		if (agent.role !== "requirement-analysis") await this.writeLeases.release(agent.projectId, agent.id);
		try {
			const process = await this.ensureProcess(agent);
			await this.persistCurrentSession(agent, process);
			await this.registry.setStatus(agent, "idle");
			this.broadcast({
				agentInstanceId: agent.id,
				projectId: agent.projectId,
				workItemId: agent.workItemId,
				role: agent.role,
				event: { type: "process_recovered", manual: true },
			});
		} catch (error) {
			await this.registry.setStatus(agent, "failed");
			throw error;
		}
	}

	async compact(input: AgentInstanceLocator): Promise<void> {
		await (await this.ensureProcess(await this.resolve(input))).compact();
	}

	async invokeBuiltinCommand(input: InvokeAgentBuiltinCommandInput): Promise<AgentBuiltinCommandResult> {
		const agent = await this.resolve(input);
		const process = await this.ensureProcess(agent);
		const args = input.args.trim();
		const broadcastHistory = async (): Promise<void> => {
			this.broadcast({
				agentInstanceId: agent.id,
				projectId: agent.projectId,
				workItemId: agent.workItemId,
				role: agent.role,
				event: { type: "agent_history", messages: await this.historyMessages(process) },
			});
		};
		if (input.name === "compact") {
			await process.compact(args || undefined);
			return { message: "会话上下文压缩完成。" };
		}
		if (input.name === "clone") {
			await process.cloneCurrentSession();
			await this.persistCurrentSession(agent, process);
			await broadcastHistory();
			return { message: "已克隆当前 Pi Session。", sessionReset: true };
		}
		if (input.name === "copy") {
			const copiedText = await process.getLastAssistantText();
			if (!copiedText) return { message: "当前 Session 还没有可复制的 Assistant 消息。" };
			return { copiedText, message: "已复制最后一条 Assistant 消息。" };
		}
		if (input.name === "name") {
			if (!args) {
				const stateResponse = await process.getState();
				const state = isRecord(stateResponse.data) ? stateResponse.data : {};
				const sessionName = typeof state.sessionName === "string" ? state.sessionName.trim() : "";
				return {
					message: sessionName ? `当前 Session 名称：${sessionName}` : "当前 Session 尚未命名。",
				};
			}
			await process.setSessionName(args);
			return { message: `Session 已命名为：${args}` };
		}
		if (input.name === "new") {
			const result = await process.newSession();
			if (result.cancelled) return { message: "创建新 Session 已取消。" };
			await this.persistCurrentSession(agent, process);
			await broadcastHistory();
			return { message: "已创建新的 Pi Session。", sessionReset: true };
		}
		if (input.name === "resume") {
			let sessionPath = args;
			if (!sessionPath) {
				const selected = await dialog.showOpenDialog({
					title: "恢复 Pi Session",
					properties: ["openFile"],
					filters: [{ name: "Pi Session", extensions: ["jsonl"] }],
				});
				sessionPath = selected.filePaths[0] ?? "";
				if (selected.canceled || !sessionPath) return { message: "恢复 Session 已取消。" };
			}
			const result = await process.switchSession(sessionPath);
			if (result.cancelled) return { message: "恢复 Session 已取消。" };
			await this.persistCurrentSession(agent, process);
			await broadcastHistory();
			return {
				message: `已恢复 Pi Session：${sessionPath}`,
				sessionReset: true,
			};
		}
		if (input.name === "export") {
			if (args.toLowerCase().endsWith(".jsonl")) {
				const stateResponse = await process.getState();
				const state = isRecord(stateResponse.data) ? stateResponse.data : {};
				if (typeof state.sessionFile !== "string") throw new Error("当前 Session 没有可导出的 JSONL 文件");
				const destination = path.resolve(agent.projectRoot, args);
				await copyFile(state.sessionFile, destination);
				shell.showItemInFolder(destination);
				return { message: `Session 已导出：${destination}` };
			}
			const exportedPath = await process.exportHtml(args || undefined);
			shell.showItemInFolder(exportedPath);
			return { message: `Session 已导出：${exportedPath}` };
		}
		if (input.name === "trust") {
			return { message: "项目信任由 CodePIddy 客户端设置页维护；修改后需要重启当前 Agent 才会重新加载项目资源。" };
		}
		if (input.name === "changelog") {
			const [desktopManifestText, piManifestText, changelogText] = await Promise.all([
				readFile(path.join(this.repositoryRoot, "packages", "codepiddy-desktop", "package.json"), "utf8"),
				readFile(path.join(this.repositoryRoot, "packages", "coding-agent", "package.json"), "utf8"),
				readFile(path.join(this.repositoryRoot, "packages", "coding-agent", "CHANGELOG.md"), "utf8"),
			]);
			const desktopManifest = JSON.parse(desktopManifestText) as { version?: string };
			const piManifest = JSON.parse(piManifestText) as { version?: string };
			const latestSection = changelogText
				.split(/\n## (?=\[?\d|Unreleased)/)
				.slice(0, 2)
				.join("\n## ")
				.trim()
				.slice(0, 3500);
			return {
				message: `CodePIddy ${desktopManifest.version ?? "unknown"}\nPi Coding Agent ${piManifest.version ?? "unknown"}\n\n${latestSection}`,
			};
		}
		if (input.name === "hotkeys") {
			return {
				message:
					"CodePIddy 快捷键：Enter 发送；Shift+Enter 换行；Esc 中断当前 Agent 或关闭弹窗；模型选择器中使用 ↑/↓ 和 Enter。",
			};
		}
		if (input.name === "quit") {
			setTimeout(() => app.quit(), 100);
			return { message: "正在退出 CodePIddy。" };
		}
		if (input.name === "reload") {
			// 原本靠私有 `reload` 命令让 Pi 原地重载 Extensions/Skills/Prompts。
			// 补丁删除后改走重启：Pi 以 `--session-dir <agent.sessions> --continue`
			// 启动，每个 Agent 的会话目录独立，所以重启后 `--continue` 恢复的正是
			// 当前这个会话。
			//
			// 代价是进行中的回复会随进程一起没了，所以先做空闲门禁：只在 Agent 空闲时重启。
			// 这不是可有可无的体验优化 —— 即便用原生 `reload()`，它内部也会
			// `emitSessionShutdownEvent` + `_buildRuntime` 拆掉重建运行时，中途调用一样不安全。
			if (agent.status === "running" || agent.status === "waiting") {
				throw new Error("Agent 正在输出或等待授权，此时重启会丢掉当前回复。请先停止它再执行 /reload。");
			}
			await this.reconnect(input);
			return { message: "Pi 已重启，Extensions、Skills、Prompts 和 Context 已重新加载。", commandsChanged: true };
		}
		throw new Error(`当前桌面客户端不支持 Pi 内置命令：/${input.name}`);
	}

	private async resolve(locator: AgentInstanceLocator): Promise<StoredAgentInstance> {
		const agent = await this.registry.get(locator.projectId, locator.workItemId, locator.role);
		if (!agent || agent.id !== locator.agentInstanceId) throw new Error("Agent instance not found");
		return agent;
	}

	private async ensureProcess(agent: StoredAgentInstance): Promise<PiRpcProcess> {
		const existing = this.processes.get(agent.id);
		if (existing?.isRunning) return existing;
		if (existing) {
			this.processes.delete(agent.id);
			this.processAgents.delete(agent.id);
		}
		return this.processStarts.run(agent.id, () => this.startProcess(agent));
	}

	private async persistCurrentSession(agent: StoredAgentInstance, process: PiRpcProcess): Promise<void> {
		const stateResponse = await process.getState();
		const state = isRecord(stateResponse.data) ? stateResponse.data : {};
		const sessionId = typeof state.sessionId === "string" ? state.sessionId : "";
		const sessionFile = typeof state.sessionFile === "string" ? state.sessionFile : "";
		const header = sessionId && sessionFile ? await readSessionHeader(sessionFile).catch(() => null) : null;
		await writeSelectedSessionId(agent.sessionDirectory, header?.sessionId === sessionId ? sessionId : null);
	}

	private async startProcess(agent: StoredAgentInstance): Promise<PiRpcProcess> {
		const packaged = app.isPackaged;
		const updatedRuntime = this.piRuntimeUpdater.getLaunchRuntime();
		const externalCli = Boolean(process.env.CODEPIDDY_PI_CLI);
		const compiledRuntime = packaged || updatedRuntime !== null || !externalCli;
		const extensionRoot = packaged
			? path.join(this.repositoryRoot, "extensions")
			: path.join(app.getAppPath(), "dist", "runtime-extensions");
		const cliPath =
			process.env.CODEPIDDY_PI_CLI ??
			updatedRuntime?.cliPath ??
			(packaged
				? path.join(this.repositoryRoot, "coding-agent-package", "dist", "bundle", "cli.js")
				: path.join(this.repositoryRoot, "packages", "coding-agent-runtime", "dist", "bundle", "cli.js"));
		const nodeExecutable = process.env.CODEPIDDY_NODE_EXECUTABLE ?? (packaged ? process.execPath : "node");
		await this.settingsStore.ensureTavilyMcpServer();
		const [tavilyApiKey, roleSkillAssignments] = await Promise.all([
			this.settingsStore.getTavilyApiKey(),
			this.settingsStore.getRoleSkillAssignments(),
		]);
		const roleSkillPaths = await resolveRoleSkillPaths(
			this.repositoryRoot,
			agent.projectRoot,
			agent.role,
			roleSkillAssignments,
		);
		const selectedSessionId = await readSelectedSessionId(agent.sessionDirectory);
		const selectedSessionFile = selectedSessionId
			? await findSessionFileById(agent.sessionDirectory, selectedSessionId)
			: null;
		if (selectedSessionId && !selectedSessionFile) {
			await writeSelectedSessionId(agent.sessionDirectory, null);
		}
		const rpc = new PiRpcProcess({
			command: nodeExecutable,
			cwd: agent.projectRoot,
			env: {
				...(packaged ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
				...(await this.settingsStore.getProviderEnv()),
				...(await this.settingsStore.getMcpEnv()),
				TSX_TSCONFIG_PATH: path.join(this.repositoryRoot, "tsconfig.json"),
				...(compiledRuntime
					? {
							PI_PACKAGE_DIR:
								updatedRuntime?.packageDir ??
								(packaged
									? path.join(this.repositoryRoot, "coding-agent-package")
									: path.join(this.repositoryRoot, "packages", "coding-agent-runtime")),
						}
					: {}),
				PI_PERMISSION_SYSTEM_CONFIG_PATH: path.join(this.runtimeRoot, "permissions", "extension.json"),
				PI_PERMISSION_SYSTEM_LOGS_DIR: path.join(this.runtimeRoot, "permissions", "logs"),
				PI_PERMISSION_SYSTEM_POLICY_AGENT_DIR: path.join(this.runtimeRoot, "permissions", "policy"),
				...(tavilyApiKey ? { TAVILY_API_KEY: tavilyApiKey } : {}),
				// shellPath 不走环境变量：Pi 原生从 settings.json 读，AppSettingsStore.setShellPath
				// 已写进 PI_CODING_AGENT_DIR/settings.json。曾经传的 PI_SHELL_PATH 需要 Pi 源码里的
				// 私有补丁，用户从 npm 升级 Pi 后失效且无人察觉。
				CODEPIDDY_AGENT_ROLE: agent.role,
				CODEPIDDY_PROJECT_ROOT: agent.projectRoot,
				CODEPIDDY_WORK_ITEM_DIR: agent.workItemDirectory,
				CODEPIDDY_CACHE_WARMING_STATUS_PATH: this.cacheWarmingStatusPath(agent.id),
			},
			args: [
				...(compiledRuntime
					? [cliPath]
					: [
							"--import",
							pathToFileURL(path.join(this.repositoryRoot, "node_modules", "tsx", "dist", "loader.mjs")).href,
							cliPath,
						]),
				"--mode",
				"rpc",
				"--no-extensions",
				"--session-dir",
				agent.sessionDirectory,
				...(selectedSessionFile && selectedSessionId ? ["--session", selectedSessionId] : ["--continue"]),
				"--extension",
				"builtin:codemode",
				"--extension",
				"builtin:tool-search",
				"--extension",
				"builtin:mcp",
				"--extension",
				compiledRuntime
					? path.join(extensionRoot, "permission.js")
					: path.join(this.repositoryRoot, "packages", "codepiddy-permission-extension", "index.ts"),
				"--extension",
				compiledRuntime
					? path.join(extensionRoot, "review.js")
					: path.join(this.repositoryRoot, "packages", "codepiddy-review-extension", "index.ts"),
				"--extension",
				compiledRuntime
					? path.join(extensionRoot, "retry.js")
					: path.join(this.repositoryRoot, "packages", "codepiddy-retry-extension", "index.ts"),
				"--extension",
				compiledRuntime
					? path.join(extensionRoot, "cache-warming.js")
					: path.join(this.repositoryRoot, "packages", "codepiddy-cache-warming-extension", "index.ts"),
				...roleSkillPaths.flatMap((skillPath) => ["--skill", skillPath]),
				"--name",
				`${agent.workItemId} ${roleLabel(agent.role)}`,
				"--append-system-prompt",
				await rolePrompt(agent, Boolean(tavilyApiKey)),
			],
		});
		rpc.onEvent((event) => {
			if (
				event.type === "extension_ui_request" &&
				typeof event.id === "string" &&
				(event.method === "select" ||
					event.method === "confirm" ||
					event.method === "input" ||
					event.method === "editor")
			) {
				this.pendingPermissions.set(agent.id, {
					agentInstanceId: agent.id,
					projectId: agent.projectId,
					workItemId: agent.workItemId,
					role: agent.role,
					requestId: event.id,
					method: event.method,
					title: typeof event.title === "string" ? event.title : "需要确认",
					message: typeof event.message === "string" ? event.message : "",
					options: Array.isArray(event.options)
						? event.options.filter((option): option is string => typeof option === "string")
						: [],
					placeholder: typeof event.placeholder === "string" ? event.placeholder : "",
					prefill: typeof event.prefill === "string" ? event.prefill : "",
					createdAt: new Date().toISOString(),
				});
			}
			this.broadcast({
				agentInstanceId: agent.id,
				projectId: agent.projectId,
				workItemId: agent.workItemId,
				role: agent.role,
				event,
			});
			if (event.type === "agent_start" || event.type === "turn_start" || event.type === "tool_execution_start") {
				if (agent.role !== "requirement-analysis") void this.writeLeases.heartbeat(agent.projectId, agent.id);
			}
			if (event.type === "agent_settled") {
				this.pendingPermissions.delete(agent.id);
				void this.registry.setStatus(agent, "idle");
				if (agent.role !== "requirement-analysis") void this.writeLeases.release(agent.projectId, agent.id);
			} else if (
				event.type === "extension_ui_request" &&
				(event.method === "select" ||
					event.method === "confirm" ||
					event.method === "input" ||
					event.method === "editor")
			) {
				void this.registry.setStatus(agent, "waiting");
			} else if (event.type === "process_error" || event.type === "process_exit") {
				this.pendingPermissions.delete(agent.id);
				if (event.expected === true || this.processes.get(agent.id) !== rpc) return;
				if (typeof event.error === "string" && event.error)
					this.recordDiagnosticsError("agent-process", event.error);
				this.processes.delete(agent.id);
				this.processAgents.delete(agent.id);
				if (agent.role !== "requirement-analysis") void this.writeLeases.release(agent.projectId, agent.id);
				if (event.type === "process_error") void rpc.stop().catch(() => undefined);
				void this.recoverProcess(agent);
			}
		});
		let handshakeComplete = false;
		try {
			await rpc.start();
			handshakeComplete = true;
			this.processes.set(agent.id, rpc);
			this.processAgents.set(agent.id, agent);
			const messages = await this.historyMessages(rpc);
			this.broadcast({
				agentInstanceId: agent.id,
				projectId: agent.projectId,
				workItemId: agent.workItemId,
				role: agent.role,
				event: { type: "agent_history", messages },
			});
			return rpc;
		} catch (error) {
			this.recordDiagnosticsError("agent-process-start", error);
			if (this.processes.get(agent.id) === rpc) this.processes.delete(agent.id);
			this.processAgents.delete(agent.id);
			await rpc.stop().catch(() => undefined);
			if (
				!handshakeComplete &&
				updatedRuntime &&
				!process.env.CODEPIDDY_PI_CLI &&
				(await this.piRuntimeUpdater.fallbackAfterStartupFailure())
			) {
				this.broadcast({
					agentInstanceId: agent.id,
					projectId: agent.projectId,
					workItemId: agent.workItemId,
					role: agent.role,
					event: {
						type: "agent_configuration_warning",
						error: `新版 Pi 启动失败，已自动回退到 v${this.piRuntimeUpdater.status().currentVersion}。`,
					},
				});
				return this.startProcess(agent);
			}
			throw error;
		}
	}

	private async recoverProcess(agent: StoredAgentInstance): Promise<void> {
		for (let attempt = 1; attempt <= 2; attempt++) {
			this.broadcast({
				agentInstanceId: agent.id,
				projectId: agent.projectId,
				workItemId: agent.workItemId,
				role: agent.role,
				event: { type: "process_recovery_start", attempt, maxAttempts: 2, manual: false },
			});
			await new Promise((resolve) => setTimeout(resolve, attempt * 750));
			if (this.processes.get(agent.id)?.isRunning) return;
			try {
				await this.ensureProcess(agent);
				await this.registry.setStatus(agent, "idle");
				this.broadcast({
					agentInstanceId: agent.id,
					projectId: agent.projectId,
					workItemId: agent.workItemId,
					role: agent.role,
					event: { type: "process_recovered", attempt, manual: false },
				});
				return;
			} catch (error) {
				this.recordDiagnosticsError("agent-process-recovery", error);
				this.broadcast({
					agentInstanceId: agent.id,
					projectId: agent.projectId,
					workItemId: agent.workItemId,
					role: agent.role,
					event: {
						type: "process_recovery_failed",
						attempt,
						maxAttempts: 2,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			}
		}
		await this.registry.setStatus(agent, "failed");
	}

	async removeWorkItem(projectId: string, workItemId: string): Promise<void> {
		const agents = [...this.processAgents.entries()].filter(
			([, agent]) => agent.projectId === projectId && agent.workItemId === workItemId,
		);
		await Promise.all(
			agents.map(async ([agentId, agent]) => {
				const process = this.processes.get(agentId);
				this.processes.delete(agentId);
				this.processAgents.delete(agentId);
				this.pendingPermissions.delete(agentId);
				if (process) await process.stop();
				if (agent.role !== "requirement-analysis") await this.writeLeases.release(projectId, agentId);
			}),
		);
		await this.registry.deleteWorkItem(projectId, workItemId);
	}

	async stopProject(projectId: string): Promise<void> {
		const agentIds = [...this.processAgents.entries()]
			.filter(([, agent]) => agent.projectId === projectId)
			.map(([agentId]) => agentId);
		await Promise.all(
			agentIds.map(async (agentId) => {
				const process = this.processes.get(agentId);
				this.processes.delete(agentId);
				this.processAgents.delete(agentId);
				this.pendingPermissions.delete(agentId);
				if (process) await process.stop();
				await this.writeLeases.release(projectId, agentId);
			}),
		);
	}

	async stopAll(): Promise<void> {
		const entries = [...this.processes.entries()];
		this.processes.clear();
		this.processAgents.clear();
		this.pendingPermissions.clear();
		await Promise.all(
			entries.map(async ([agentId, process]) => {
				await process.stop();
				for (const project of await this.registry.listAgentLocations(agentId)) {
					await this.writeLeases.release(project.projectId, agentId);
				}
			}),
		);
	}

	private recordDiagnosticsError(source: string, error: unknown): void {
		this.recentDiagnosticsErrors.push({
			timestamp: new Date().toISOString(),
			source,
			message: error instanceof Error ? error.message : String(error),
		});
		if (this.recentDiagnosticsErrors.length > 50)
			this.recentDiagnosticsErrors.splice(0, this.recentDiagnosticsErrors.length - 50);
	}

	private broadcast(event: AgentClientEvent): void {
		for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channels.agentEvent, event);
	}
}

function createWindow(stateStore: RecentProjectStore): BrowserWindow {
	const stored = stateStore.getWindowState();
	const storedBounds = stored
		? { x: stored.x, y: stored.y, width: Math.max(900, stored.width), height: Math.max(620, stored.height) }
		: null;
	const visibleBounds =
		storedBounds &&
		screen.getAllDisplays().some((display) => {
			const intersectionWidth = Math.max(
				0,
				Math.min(storedBounds.x + storedBounds.width, display.workArea.x + display.workArea.width) -
					Math.max(storedBounds.x, display.workArea.x),
			);
			const intersectionHeight = Math.max(
				0,
				Math.min(storedBounds.y + storedBounds.height, display.workArea.y + display.workArea.height) -
					Math.max(storedBounds.y, display.workArea.y),
			);
			return intersectionWidth >= 160 && intersectionHeight >= 120;
		})
			? storedBounds
			: null;
	/**
	 * Windows 11 22H2（build 22621）起才有系统背景材质，更早的系统会被忽略。
	 * 侧栏的毛玻璃靠这层材质提供模糊，渲染层只叠 tint + sheen（与参考项目 macOS vibrancy 同构）。
	 */
	function supportsWindowsBackgroundMaterial(): boolean {
		if (process.platform !== "win32") return false;
		const build = Number(process.getSystemVersion().split(".")[2] ?? "0");
		return Number.isFinite(build) && build >= 22621;
	}

	const useBackgroundMaterial = supportsWindowsBackgroundMaterial();
	const window = new BrowserWindow({
		width: visibleBounds?.width ?? 1320,
		height: visibleBounds?.height ?? 860,
		...(visibleBounds ? { x: visibleBounds.x, y: visibleBounds.y } : {}),
		minWidth: 900,
		minHeight: 620,
		backgroundColor: useBackgroundMaterial ? "#00000000" : "#f2f2f4",
		...(process.platform === "win32"
			? {
					titleBarStyle: "hidden" as const,
					titleBarOverlay: { color: "#f2f2f4", symbolColor: "#17181a", height: 34 },
					...(useBackgroundMaterial ? { backgroundMaterial: "acrylic" as const } : {}),
				}
			: {}),
		show: false,
		autoHideMenuBar: true,
		title: "CodePIddy",
		icon: path.join(app.getAppPath(), "resources", "icons", "codepiddy-icon-1024.png"),
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			preload: path.join(app.getAppPath(), "dist", "preload", "index.cjs"),
			sandbox: true,
		},
	});
	window.once("ready-to-show", () => window.show());
	window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	const rendererUrl = process.env.CODEPIDDY_RENDERER_URL;
	const allowedOrigin = rendererUrl ? new URL(rendererUrl).origin : "file://";
	window.webContents.on("will-navigate", (event, destination) => {
		const allowed = rendererUrl ? new URL(destination).origin === allowedOrigin : destination.startsWith("file://");
		if (!allowed) event.preventDefault();
	});
	if (rendererUrl) void window.loadURL(rendererUrl);
	else void window.loadFile(path.join(app.getAppPath(), "dist", "renderer", "index.html"));
	if (stored?.maximized) window.once("ready-to-show", () => window.maximize());
	let saveTimer: NodeJS.Timeout | null = null;
	const scheduleWindowStateSave = (): void => {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			const bounds = window.getNormalBounds();
			stateStore.saveWindowState({ ...bounds, maximized: window.isMaximized() });
		}, 250);
	};
	window.on("resize", scheduleWindowStateSave);
	window.on("move", scheduleWindowStateSave);
	window.on("maximize", scheduleWindowStateSave);
	window.on("unmaximize", scheduleWindowStateSave);
	window.on("closed", () => {
		if (saveTimer) clearTimeout(saveTimer);
	});
	return window;
}

function registerIpcHandlers(
	agentManager: AgentManager,
	settingsStore: AppSettingsStore,
	recentProjects: RecentProjectStore,
	piRuntimeUpdater: PiRuntimeUpdater,
	piAuthManager: PiAuthManager,
	piTrustManager: PiTrustManager,
	llamaCppManager: LlamaCppManager,
	diagnosticsManager: DiagnosticsManager,
): void {
	const openedProjects = new Map<string, string>();
	const rootKey = (projectRoot: string): string =>
		process.platform === "win32" ? path.resolve(projectRoot).toLowerCase() : path.resolve(projectRoot);
	const decorateRoot = async (rawProjectRoot: unknown) => {
		const projectRoot = parseProjectRoot(rawProjectRoot);
		const project = await agentManager.decorate(await openProject(projectRoot));
		openedProjects.set(rootKey(project.rootPath), project.id);
		await recentProjects.record(project);
		return project;
	};
	const requireOpenProjectRoot = (rawProjectRoot: unknown): string => {
		const projectRoot = parseProjectRoot(rawProjectRoot);
		if (!openedProjects.has(rootKey(projectRoot))) throw new Error("项目尚未在 CodePIddy 中打开");
		return projectRoot;
	};
	const shareSettingsStatus = async (): Promise<ShareSettingsStatus> => {
		const providers = await piAuthManager.listProviders();
		return {
			radius: providers.find((provider) => provider.id === "radius") ?? null,
			githubCli: getGitHubCliStatus(await settingsStore.getGitHubCliPath()),
		};
	};
	const validateWorkItemInput = (raw: unknown): ArchiveWorkItemInput => {
		const input = parseArchiveWorkItemInput(raw);
		return { ...input, projectRoot: requireOpenProjectRoot(input.projectRoot) };
	};

	ipcMain.handle(channels.listRecentProjects, () => recentProjects.list());
	ipcMain.handle(channels.getStartupProject, async () => {
		const projectRoot = await recentProjects.getActiveProjectRoot();
		if (!projectRoot) return null;
		try {
			return await decorateRoot(projectRoot);
		} catch {
			await recentProjects.clearActiveProject(projectRoot);
			return null;
		}
	});
	ipcMain.handle(channels.closeProject, async (_event, rawProjectRoot: unknown) => {
		const projectRoot = requireOpenProjectRoot(rawProjectRoot);
		const project = await openProject(projectRoot);
		stopProjectTerminals(projectRoot);
		await agentManager.stopProject(project.id);
		openedProjects.delete(rootKey(projectRoot));
		await recentProjects.clearActiveProject(projectRoot);
		return recentProjects.list();
	});
	ipcMain.handle(channels.openRecentProject, async (_event, rawProjectRoot: unknown) => {
		const projectRoot = parseProjectRoot(rawProjectRoot);
		const recent = await recentProjects.list();
		if (!recent.some((item) => rootKey(item.rootPath) === rootKey(projectRoot)))
			throw new Error("最近项目记录不存在");
		return decorateRoot(projectRoot);
	});
	ipcMain.handle(channels.forgetRecentProject, (_event, rawProjectRoot: unknown) =>
		recentProjects.forget(parseProjectRoot(rawProjectRoot)),
	);
	ipcMain.handle(channels.openProject, async () => {
		const testProjectRoot = !app.isPackaged ? process.env.CODEPIDDY_TEST_PROJECT_ROOT?.trim() : undefined;
		if (testProjectRoot) return decorateRoot(testProjectRoot);
		const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
		const selectedPath = result.filePaths[0];
		if (result.canceled || !selectedPath) return null;
		return decorateRoot(selectedPath);
	});
	ipcMain.handle(channels.refreshProject, (_event, rawProjectRoot: unknown) =>
		decorateRoot(requireOpenProjectRoot(rawProjectRoot)),
	);
	ipcMain.handle(channels.getProjectTrustStatus, (_event, rawProjectRoot: unknown) =>
		piTrustManager.getStatus(requireOpenProjectRoot(rawProjectRoot)),
	);
	ipcMain.handle(channels.setProjectTrust, (_event, raw: unknown) => {
		const input = parseSetProjectTrustInput(raw);
		input.projectRoot = requireOpenProjectRoot(input.projectRoot);
		return piTrustManager.set(input);
	});
	ipcMain.handle(channels.createWorkItem, async (_event, raw: unknown) => {
		const input = parseCreateWorkItemInput(raw);
		input.projectRoot = requireOpenProjectRoot(input.projectRoot);
		return agentManager.decorate(await createWorkItem(input));
	});
	ipcMain.handle(channels.archiveWorkItem, async (_event, raw: unknown) =>
		agentManager.decorate(await archiveWorkItem(validateWorkItemInput(raw))),
	);
	ipcMain.handle(channels.restoreWorkItem, async (_event, raw: unknown) =>
		agentManager.decorate(await restoreWorkItem(validateWorkItemInput(raw))),
	);
	ipcMain.handle(channels.renameWorkItem, async (_event, raw: unknown) => {
		const input = parseRenameWorkItemInput(raw);
		input.projectRoot = requireOpenProjectRoot(input.projectRoot);
		return agentManager.decorate(await renameWorkItem(input));
	});
	ipcMain.handle(channels.deleteWorkItem, async (_event, raw: unknown) => {
		const input = validateWorkItemInput(raw);
		const project = await agentManager.decorate(await openProject(input.projectRoot));
		const item = project.lanes
			.find((lane) => lane.kind === input.lane)
			?.workItems.find((candidate) => candidate.id === input.workItemId);
		for (const slot of item?.agentSlots ?? []) {
			if (slot.currentInstanceId) recentProjects.deleteAgentUiState(slot.currentInstanceId);
		}
		await agentManager.removeWorkItem(project.id, input.workItemId);
		return agentManager.decorate(await deleteWorkItem(input));
	});
	ipcMain.handle(channels.getAgentModelSelection, (_event, raw: unknown) =>
		agentManager.getModelSelection(parseAgentLocator(raw)),
	);
	ipcMain.handle(channels.getAgentModelScope, (_event, raw: unknown) =>
		agentManager.getModelScope(parseAgentLocator(raw)),
	);
	ipcMain.handle(channels.getAgentCommands, (_event, raw: unknown) =>
		agentManager.getCommands(parseAgentLocator(raw)),
	);
	ipcMain.handle(channels.getProjectWriteLeaseStatus, (_event, rawProjectId: unknown) =>
		agentManager.getWriteLeaseStatus(parseProjectId(rawProjectId)),
	);
	ipcMain.handle(channels.clearStaleProjectWriteLease, (_event, rawProjectId: unknown) =>
		agentManager.clearStaleWriteLease(parseProjectId(rawProjectId)),
	);
	ipcMain.handle(channels.setAgentModel, (_event, raw: unknown) =>
		agentManager.setModel(parseSetAgentModelInput(raw)),
	);
	ipcMain.handle(channels.setAgentModelScope, (_event, raw: unknown) =>
		agentManager.setModelScope(parseSetAgentModelScopeInput(raw)),
	);
	ipcMain.handle(channels.setAgentThinking, (_event, raw: unknown) =>
		agentManager.setThinking(parseSetAgentThinkingInput(raw)),
	);
	ipcMain.handle(channels.createAgent, async (_event, raw: unknown) => {
		const input = parseCreateAgentInput(raw);
		input.projectRoot = requireOpenProjectRoot(input.projectRoot);
		return agentManager.create(input);
	});
	ipcMain.handle(channels.activateAgent, (_event, raw: unknown) => agentManager.activate(parseAgentLocator(raw)));
	ipcMain.handle(channels.sendAgentPrompt, (_event, raw: unknown) =>
		agentManager.prompt(parseSendAgentPromptInput(raw)),
	);
	ipcMain.handle(channels.abortAgent, (_event, raw: unknown) => agentManager.abort(parseAgentLocator(raw)));
	ipcMain.handle(channels.reconnectAgent, (_event, raw: unknown) => agentManager.reconnect(parseAgentLocator(raw)));
	ipcMain.handle(channels.compactAgent, (_event, raw: unknown) => agentManager.compact(parseAgentLocator(raw)));
	ipcMain.handle(channels.invokeAgentBuiltinCommand, (_event, raw: unknown) =>
		agentManager.invokeBuiltinCommand(parseInvokeAgentBuiltinCommandInput(raw)),
	);
	ipcMain.handle(channels.cloneAgentSession, (_event, raw: unknown) =>
		agentManager.cloneSession(parseAgentLocator(raw)),
	);
	ipcMain.handle(channels.getAgentSessionSnapshot, (_event, raw: unknown) =>
		agentManager.getSessionSnapshot(parseAgentLocator(raw)),
	);
	ipcMain.handle(channels.listAgentSessions, (_event, raw: unknown) =>
		agentManager.listAgentSessions(parseAgentLocator(raw)),
	);
	ipcMain.handle(channels.newAgentSession, (_event, raw: unknown) =>
		agentManager.newAgentSession(parseAgentLocator(raw)),
	);
	ipcMain.handle(channels.switchAgentSession, (_event, raw: unknown) =>
		agentManager.switchAgentSession(parseSwitchAgentSessionInput(raw)),
	);
	ipcMain.handle(channels.deleteAgentSession, (_event, raw: unknown) =>
		agentManager.deleteAgentSession(parseSwitchAgentSessionInput(raw)),
	);
	ipcMain.handle(channels.importAgentSession, async (_event, raw: unknown) => {
		const locator = parseAgentLocator(raw);
		const selected = await dialog.showOpenDialog({
			title: "导入 Pi Session",
			properties: ["openFile"],
			filters: [{ name: "Pi Session", extensions: ["jsonl"] }],
		});
		const sessionPath = selected.filePaths[0];
		if (selected.canceled || !sessionPath) return null;
		return agentManager.importSession({ ...locator, sessionPath });
	});
	ipcMain.handle(channels.getAgentSessionStats, (_event, raw: unknown) =>
		agentManager.getSessionStats(parseAgentLocator(raw)),
	);
	ipcMain.handle(channels.forkAgentSession, (_event, raw: unknown) =>
		agentManager.forkSession(parseForkAgentSessionInput(raw)),
	);
	ipcMain.handle(channels.shareAgentSession, (_event, raw: unknown) =>
		agentManager.shareSession(parseAgentLocator(raw)),
	);
	ipcMain.handle(channels.listAuthProviders, () => piAuthManager.listProviders());
	ipcMain.handle(channels.startAuthLogin, (_event, raw: unknown) => {
		if (!isRecord(raw)) throw new Error("登录参数无效");
		const providerId = typeof raw.providerId === "string" ? raw.providerId.trim() : "";
		const authType: AuthMethodType | null =
			raw.authType === "api_key" || raw.authType === "oauth" ? raw.authType : null;
		if (!providerId || !authType) throw new Error("登录参数无效");
		return piAuthManager.startLogin(providerId, authType);
	});
	ipcMain.handle(channels.respondAuthPrompt, (_event, raw: unknown) => {
		if (!isRecord(raw)) throw new Error("登录响应无效");
		const requestId = typeof raw.requestId === "string" ? raw.requestId : "";
		const promptId = typeof raw.promptId === "string" ? raw.promptId : "";
		if (!requestId || !promptId) throw new Error("登录响应无效");
		piAuthManager.respondPrompt({
			requestId,
			promptId,
			...(typeof raw.value === "string" ? { value: raw.value } : {}),
			...(raw.cancelled === true ? { cancelled: true } : {}),
		});
	});
	ipcMain.handle(channels.cancelAuthLogin, (_event, raw: unknown) => {
		if (typeof raw === "string") piAuthManager.cancelLogin(raw);
	});
	ipcMain.handle(channels.logoutAuthProvider, (_event, raw: unknown) => {
		if (typeof raw !== "string" || !raw.trim()) throw new Error("Provider ID 无效");
		return piAuthManager.logout(raw.trim());
	});
	ipcMain.handle(channels.resetAgent, async (_event, raw: unknown) => {
		const input = parseResetAgentInput(raw);
		input.projectRoot = requireOpenProjectRoot(input.projectRoot);
		const project = await agentManager.reset(input);
		recentProjects.deleteAgentUiState(input.agentInstanceId);
		return project;
	});
	ipcMain.handle(channels.respondToExtensionUi, (_event, raw: unknown) =>
		agentManager.respondToExtensionUi(parseExtensionUiResponseInput(raw)),
	);
	ipcMain.handle(channels.getPendingPermissionRequest, (_event, raw: unknown) =>
		agentManager.getPendingPermissionRequest(parseAgentLocator(raw)),
	);
	ipcMain.handle(channels.searchProjectFiles, (_event, rawProjectRoot: unknown, rawQuery: unknown) =>
		searchProjectFiles(requireOpenProjectRoot(rawProjectRoot), parseBoundedText(rawQuery, "搜索内容", 500, true)),
	);
	ipcMain.handle(channels.listWorkspaceDir, (_event, rawProjectRoot: unknown, rawDir: unknown) =>
		listWorkspaceDir(requireOpenProjectRoot(rawProjectRoot), parseBoundedText(rawDir, "目录", 1000, true)),
	);
	ipcMain.handle(channels.readWorkspaceFile, (_event, rawProjectRoot: unknown, rawPath: unknown) =>
		readWorkspaceFile(requireOpenProjectRoot(rawProjectRoot), parseBoundedText(rawPath, "文件路径", 1000)),
	);
	ipcMain.handle(channels.startTerminal, (event, raw: unknown): TerminalSessionInfo => {
		const input = parseTerminalStartInput(raw);
		const projectRoot = requireOpenProjectRoot(input.projectRoot);
		stopTerminalSession(input.terminalId);
		const resolved = resolveTerminalShell();
		const ptyProcess = pty.spawn(resolved.command, resolved.args, {
			name: "xterm-256color",
			cols: input.cols ?? DEFAULT_TERMINAL_COLS,
			rows: input.rows ?? DEFAULT_TERMINAL_ROWS,
			cwd: projectRoot,
			env: {
				...process.env,
				TERM: "xterm-256color",
				// 关掉 PowerShell 启动时的“有新版本可用”提示，保持终端首屏干净。
				POWERSHELL_UPDATECHECK: "Off",
			},
		});
		const session: TerminalSession = {
			terminalId: input.terminalId,
			projectRoot,
			ownerId: event.sender.id,
			shell: resolved.label,
			profileName: resolved.profileName,
			fontFamily: resolved.fontFamily,
			fontSize: resolved.fontSize,
			cursorStyle: resolved.cursorStyle,
			pty: ptyProcess,
		};
		terminalSessions.set(input.terminalId, session);
		const ownerId = event.sender.id;
		if (!terminalOwnerCleanupRegistered.has(ownerId)) {
			terminalOwnerCleanupRegistered.add(ownerId);
			event.sender.once("destroyed", () => {
				terminalOwnerCleanupRegistered.delete(ownerId);
				stopOwnerTerminals(ownerId);
			});
		}
		ptyProcess.onData((data) => sendTerminalEvent(session, { type: "data", data }));
		ptyProcess.onExit(({ exitCode }) => {
			sendTerminalEvent(session, { type: "exit", exitCode });
			terminalSessions.delete(input.terminalId);
		});
		return {
			terminalId: input.terminalId,
			shell: resolved.label,
			cwd: projectRoot,
			profileName: resolved.profileName,
			fontFamily: resolved.fontFamily,
			fontSize: resolved.fontSize,
			cursorStyle: resolved.cursorStyle,
		};
	});
	ipcMain.handle(channels.writeTerminal, (event, raw: unknown) => {
		const input = parseTerminalWriteInput(raw);
		const session = requireTerminalSession(input.terminalId, event.sender.id);
		session.pty.write(input.data);
	});
	ipcMain.handle(channels.resizeTerminal, (event, raw: unknown) => {
		const input = parseTerminalResizeInput(raw);
		const session = requireTerminalSession(input.terminalId, event.sender.id);
		try {
			session.pty.resize(input.cols, input.rows);
		} catch {
			// 会话可能已经退出。
		}
	});
	ipcMain.handle(channels.killTerminal, (event, rawTerminalId: unknown) => {
		const terminalId = parseTerminalId(rawTerminalId);
		requireTerminalSession(terminalId, event.sender.id);
		stopTerminalSession(terminalId);
	});
	ipcMain.handle(channels.settingsStatus, () => settingsStore.status());
	ipcMain.handle(channels.piRuntimeStatus, () => piRuntimeUpdater.status());
	ipcMain.handle(channels.piRuntimeCheck, () => piRuntimeUpdater.checkLatest());
	ipcMain.handle(channels.piRuntimeInstall, (_event, rawVersion: unknown) =>
		piRuntimeUpdater.installLatest(parseBoundedText(rawVersion, "Pi 版本", 40)),
	);
	ipcMain.handle(channels.piRuntimeRollback, () => piRuntimeUpdater.rollback());
	ipcMain.handle(channels.piRuntimeRestart, () => {
		app.relaunch();
		app.quit();
	});
	ipcMain.handle(channels.diagnosticsInfo, () => diagnosticsManager.getInfo());
	ipcMain.handle(channels.diagnosticsExport, async (_event, raw: unknown) => {
		const input = parseDiagnosticsExportInput(raw);
		const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
		const selected = await dialog.showSaveDialog({
			title: "导出 CodePIddy 诊断包",
			defaultPath: path.join(app.getPath("downloads"), `codepiddy-diagnostics-${timestamp}.zip`),
			filters: [{ name: "ZIP 压缩包", extensions: ["zip"] }],
		});
		if (selected.canceled || !selected.filePath) return null;
		const result = await diagnosticsManager.export(input, selected.filePath);
		shell.showItemInFolder(result.filePath);
		return result;
	});
	ipcMain.handle(channels.settingsGetPermissions, () => settingsStore.getPermissionDefaults());
	ipcMain.handle(channels.settingsSetPermissions, (_event, raw: unknown) =>
		settingsStore.setPermissionDefaults(parsePermissionDefaults(raw)),
	);
	ipcMain.handle(channels.settingsSaveTavily, (_event, rawApiKey: unknown) =>
		settingsStore.saveTavilyApiKey(parseBoundedText(rawApiKey, "Tavily API Key", 500)),
	);
	ipcMain.handle(channels.settingsClearTavily, () => settingsStore.clearTavilyApiKey());
	ipcMain.handle(channels.settingsGetTavily, () => settingsStore.getTavilyApiKey());
	ipcMain.handle(channels.settingsSaveShell, (_event, rawShellPath: unknown) =>
		settingsStore.setShellPath(parseBoundedText(rawShellPath, "Shell 路径", 1024)),
	);
	ipcMain.handle(channels.settingsSaveCacheWarming, async (_event, raw: unknown) => {
		await settingsStore.setCacheWarmingSettings(parseCacheWarmingSettings(raw));
		return settingsStore.status();
	});
	ipcMain.handle(channels.settingsSaveContextCompaction, async (_event, raw: unknown) => {
		await settingsStore.setContextCompactionSettings(parseContextCompactionSettings(raw));
		return settingsStore.status();
	});
	ipcMain.handle(channels.settingsListMcp, (_event, rawProjectRoot?: unknown) =>
		rawProjectRoot === undefined
			? settingsStore.listMcpServers()
			: settingsStore.listMcpServers(requireOpenProjectRoot(rawProjectRoot)),
	);
	ipcMain.handle(channels.settingsSaveMcp, (_event, raw: unknown) =>
		settingsStore.saveMcpServer(parseMcpServerInput(raw)),
	);
	ipcMain.handle(channels.settingsDeleteMcp, (_event, rawName: unknown) =>
		settingsStore.deleteMcpServer(parseBoundedText(rawName, "MCP 服务名", 100)),
	);
	ipcMain.handle(channels.settingsSaveMcpOverride, (_event, raw: unknown) => {
		const input = parseMcpProjectOverrideInput(raw);
		input.projectRoot = requireOpenProjectRoot(input.projectRoot);
		return settingsStore.saveMcpProjectOverride(input);
	});
	ipcMain.handle(channels.settingsDeleteMcpOverride, (_event, raw: unknown) => {
		const input = parseMcpProjectOverrideLocator(raw);
		input.projectRoot = requireOpenProjectRoot(input.projectRoot);
		return settingsStore.deleteMcpProjectOverride(input);
	});
	ipcMain.handle(channels.settingsMcpAction, (_event, raw: unknown) =>
		agentManager.runMcpAction(parseMcpActionInput(raw)),
	);
	ipcMain.handle(channels.settingsListProviders, () => settingsStore.listProviders());
	ipcMain.handle(channels.settingsSaveProvider, (_event, raw: unknown) =>
		settingsStore.saveProvider(parseProviderInput(raw)),
	);
	ipcMain.handle(channels.settingsDeleteProvider, (_event, rawId: unknown) =>
		settingsStore.deleteProvider(parseBoundedText(rawId, "Provider ID", 100)),
	);
	ipcMain.handle(channels.llamaCppConfigGet, () => llamaCppManager.getConfig());
	ipcMain.handle(channels.llamaCppConfigSave, (_event, raw: unknown) =>
		llamaCppManager.saveConfig(parseSaveLlamaCppConfigInput(raw)),
	);
	ipcMain.handle(channels.llamaCppConfigClear, () => llamaCppManager.clearConfig());
	ipcMain.handle(channels.llamaCppStatus, () => llamaCppManager.getStatus());
	ipcMain.handle(channels.llamaCppAction, async (_event, raw: unknown) => {
		const input = parseRunLlamaCppActionInput(raw);
		const actionId = randomUUID();
		const broadcast = (event: LlamaCppActionEvent): void => {
			for (const contents of webContents.getAllWebContents()) contents.send(channels.llamaCppEvent, event);
		};
		try {
			const status = await llamaCppManager.runAction(input, (progress) => {
				if (!input.modelId) return;
				broadcast({
					type: "progress",
					actionId,
					modelId: input.modelId,
					...progress,
				});
			});
			broadcast({
				type: "complete",
				actionId,
				...(input.modelId ? { modelId: input.modelId } : {}),
				status,
			});
			return status;
		} catch (error) {
			broadcast({
				type: "error",
				actionId,
				...(input.modelId ? { modelId: input.modelId } : {}),
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	});
	ipcMain.handle(channels.llamaCppSearch, (_event, rawQuery: unknown) =>
		llamaCppManager.searchModels(parseBoundedText(rawQuery, "Hugging Face 搜索内容", 200)),
	);
	ipcMain.handle(channels.llamaCppDetails, (_event, rawModelId: unknown) =>
		llamaCppManager.getModelDetails(parseBoundedText(rawModelId, "Hugging Face 模型 ID", 300)),
	);
	ipcMain.handle(channels.settingsListSkills, (_event, rawProjectRoot?: unknown) => {
		const projectRoot = rawProjectRoot === undefined ? undefined : requireOpenProjectRoot(rawProjectRoot);
		return discoverAgentSkills(agentManager.repositoryPath, projectRoot);
	});
	ipcMain.handle(channels.settingsGetRoleSkills, () => settingsStore.getRoleSkillAssignments());
	ipcMain.handle(channels.settingsSetRoleSkills, async (_event, raw: unknown) => {
		const input = parseRoleSkillAssignmentsInput(raw);
		const projectRoot = input.projectRoot ? requireOpenProjectRoot(input.projectRoot) : undefined;
		const catalog = await discoverAgentSkills(agentManager.repositoryPath, projectRoot);
		const allowedIds = new Set(catalog.map((skill) => skill.id));
		if (input.skillIds.some((skillId) => !allowedIds.has(skillId)))
			throw new Error("Skill ID 不存在或不在允许目录中");
		return settingsStore.setRoleSkillAssignments(input);
	});
	ipcMain.handle(channels.settingsOpenPiConfig, async () => {
		const directory = path.join(app.getPath("home"), ".pi", "agent");
		await mkdir(directory, { recursive: true });
		const error = await shell.openPath(directory);
		if (error) throw new Error(error);
	});
	// 权限策略目录是排查「为什么还在弹窗」的第一现场：扩展除了这份全局策略，
	// 还会读 agents/ 子目录和项目级配置，设置页那 7 个开关只是其中一层。
	ipcMain.handle(channels.settingsOpenPermissionPolicy, async () => {
		const directory = path.join(app.getPath("userData"), "permissions", "policy");
		await mkdir(directory, { recursive: true });
		const error = await shell.openPath(directory);
		if (error) throw new Error(error);
	});
	ipcMain.handle(channels.settingsOpenProjectSkills, async (_event, rawProjectRoot: unknown) => {
		const projectRoot = requireOpenProjectRoot(rawProjectRoot);
		const directory = path.join(projectRoot, ".codepiddy", ".pi", "skills");
		await mkdir(directory, { recursive: true });
		const error = await shell.openPath(directory);
		if (error) throw new Error(error);
	});
	ipcMain.handle(channels.settingsOpenBuiltinSkills, async () => {
		const directory = await resolveBuiltinSkillsDirectory(agentManager.repositoryPath);
		if (!directory) throw new Error("未找到内置 Skill 目录");
		const error = await shell.openPath(directory);
		if (error) throw new Error(error);
	});
	ipcMain.handle(channels.settingsShareGet, () => shareSettingsStatus());
	ipcMain.handle(channels.settingsShareChooseGitHubCli, async () => {
		const selected = await dialog.showOpenDialog({
			title: "选择 GitHub CLI",
			properties: ["openFile"],
			...(process.platform === "win32" ? { filters: [{ name: "GitHub CLI", extensions: ["exe"] }] } : {}),
		});
		return selected.canceled ? null : (selected.filePaths[0] ?? null);
	});
	ipcMain.handle(channels.settingsShareSetGitHubCliPath, async (_event, rawPath: unknown) => {
		const githubCliPath = parseBoundedText(rawPath, "GitHub CLI 路径", 2048, true);
		await settingsStore.setGitHubCliPath(githubCliPath || null);
		return shareSettingsStatus();
	});
	ipcMain.handle(channels.openExternalUrl, async (_event, rawUrl: unknown) => {
		await shell.openExternal(parseExternalUrl(rawUrl));
	});
	ipcMain.handle(channels.openWorkItemFolder, async (_event, raw: unknown) => {
		const input = validateWorkItemInput(raw);
		const project = await openProject(input.projectRoot);
		const item = project.lanes
			.find((candidate) => candidate.kind === input.lane)
			?.workItems.find((candidate) => candidate.id === input.workItemId);
		if (!item) throw new Error("Work Item 不存在");
		assertPathInside(project.codepiddyPath, item.directoryPath, "Work Item 路径");
		const [realCodepiddyPath, realWorkItemPath] = await Promise.all([
			realpath(project.codepiddyPath),
			realpath(item.directoryPath),
		]);
		assertPathInside(realCodepiddyPath, realWorkItemPath, "Work Item 真实路径");
		const error = await shell.openPath(realWorkItemPath);
		if (error) throw new Error(error);
	});
	ipcMain.handle(channels.getProjectUiState, (_event, rawProjectRoot: unknown) =>
		recentProjects.getProjectUiState(requireOpenProjectRoot(rawProjectRoot)),
	);
	ipcMain.handle(channels.saveProjectUiState, (_event, raw: unknown) => {
		const state = parseProjectUiState(raw);
		state.projectRoot = requireOpenProjectRoot(state.projectRoot);
		return recentProjects.saveProjectUiState(state);
	});
	ipcMain.handle(channels.getAgentUiState, (_event, rawAgentId: unknown) =>
		recentProjects.getAgentUiState(parseBoundedText(rawAgentId, "Agent Instance ID", 128)),
	);
	ipcMain.handle(channels.saveAgentUiState, (_event, raw: unknown) =>
		recentProjects.saveAgentUiState(parseAgentUiState(raw)),
	);
}

const userDataOverride = process.env.CODEPIDDY_USER_DATA?.trim();
if (userDataOverride) app.setPath("userData", path.resolve(userDataOverride));

let mainWindow: BrowserWindow | null = null;
const singleInstanceDisabled = !app.isPackaged && process.env.CODEPIDDY_DISABLE_SINGLE_INSTANCE === "1";
const hasSingleInstanceLock = singleInstanceDisabled || app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
	app.quit();
} else {
	app.on("second-instance", () => {
		if (!mainWindow || mainWindow.isDestroyed()) return;
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.show();
		mainWindow.focus();
	});

	app.whenReady().then(async () => {
		Menu.setApplicationMenu(null);
		const repositoryRoot =
			process.env.CODEPIDDY_REPO_ROOT ??
			(app.isPackaged ? path.join(process.resourcesPath, "runtime") : path.resolve(app.getAppPath(), "..", ".."));
		const runtimeExtensionsRoot = app.isPackaged
			? path.join(repositoryRoot, "extensions")
			: path.join(app.getAppPath(), "dist", "runtime-extensions");
		const tavilyMcpEntry = app.isPackaged
			? path.join(repositoryRoot, "mcp", "tavily-search.js")
			: path.join(runtimeExtensionsRoot, "tavily-search.js");
		const nodeExecutable = process.env.CODEPIDDY_NODE_EXECUTABLE ?? (app.isPackaged ? process.execPath : "node");
		const settingsStore = new AppSettingsStore(app.getPath("userData"), {
			command: nodeExecutable,
			args: [tavilyMcpEntry],
			...(path.basename(nodeExecutable).toLowerCase().includes("electron")
				? { env: { ELECTRON_RUN_AS_NODE: "1" } }
				: {}),
		});
		await settingsStore.ensurePermissionPolicy();
		await settingsStore.ensurePiRetrySettings();
		await settingsStore.ensureShellPathNormalized();
		await settingsStore.ensureTavilyMcpServer();
		const recentProjects = new RecentProjectStore(app.getPath("userData"), {
			discoverKnownRoots: process.env.CODEPIDDY_DISABLE_PROJECT_DISCOVERY !== "1",
		});
		const bundledManifestPath = app.isPackaged
			? path.join(repositoryRoot, "coding-agent-package", "package.json")
			: path.join(repositoryRoot, "packages", "coding-agent-runtime", "package.json");
		const bundledManifest = JSON.parse(await readFile(bundledManifestPath, "utf8")) as { version: string };
		const piRuntimeUpdater = new PiRuntimeUpdater({
			userDataPath: app.getPath("userData"),
			bundledVersion: bundledManifest.version,
			nodeExecutable: process.execPath,
			...(app.isPackaged ? { npmCliPath: path.join(repositoryRoot, "npm", "bin", "npm-cli.js") } : {}),
			probe: (runtime, stagingRoot) => probePiUpdate(runtime, stagingRoot, repositoryRoot, app.getPath("userData")),
		});
		await piRuntimeUpdater.initialize();
		const agentManager = new AgentManager(app.getPath("userData"), repositoryRoot, settingsStore, piRuntimeUpdater);
		const piAuthManager = new PiAuthManager({
			helperPath: app.isPackaged
				? path.join(repositoryRoot, "extensions", "pi-auth-helper.mjs")
				: path.join(app.getAppPath(), "dist", "runtime-extensions", "pi-auth-helper.mjs"),
			nodeExecutable: process.env.CODEPIDDY_NODE_EXECUTABLE ?? (app.isPackaged ? process.execPath : "node"),
			agentDir: resolvePiAgentDir(),
			resolvePackageDir: async () =>
				piRuntimeUpdater.getLaunchRuntime()?.packageDir ??
				path.join(
					repositoryRoot,
					app.isPackaged ? "coding-agent-package" : path.join("packages", "coding-agent-runtime"),
				),
			onEvent: (event) => {
				if (event.type === "auth_url") void shell.openExternal(event.url);
				mainWindow?.webContents.send(channels.authEvent, event);
			},
		});
		const piTrustManager = new PiTrustManager({
			helperPath: app.isPackaged
				? path.join(repositoryRoot, "extensions", "pi-trust-helper.mjs")
				: path.join(app.getAppPath(), "dist", "runtime-extensions", "pi-trust-helper.mjs"),
			nodeExecutable: process.env.CODEPIDDY_NODE_EXECUTABLE ?? (app.isPackaged ? process.execPath : "node"),
			agentDir: resolvePiAgentDir(),
			resolvePackageDir: async () =>
				piRuntimeUpdater.getLaunchRuntime()?.packageDir ??
				path.join(
					repositoryRoot,
					app.isPackaged ? "coding-agent-package" : path.join("packages", "coding-agent-runtime"),
				),
		});
		const llamaCppManager = new LlamaCppManager(resolvePiAgentDir());
		const diagnosticsManager = new DiagnosticsManager({
			userDataPath: app.getPath("userData"),
			agentDir: resolvePiAgentDir(),
			appVersion: app.getVersion(),
			getPiRuntimeStatus: () => piRuntimeUpdater.status(),
			listAuthProviders: () => piAuthManager.listProviders(),
			listConfiguredProviders: () => settingsStore.listProviders(),
			getMcpSnapshot: async () => {
				const result = await agentManager.runMcpAction({ action: "list" });
				return result.snapshot ?? { servers: [], errors: result.output ? [result.output] : [] };
			},
			getAgentSnapshot: (locator) => agentManager.getDiagnosticsAgentSnapshot(locator),
			getTrustStatus: (projectRoot) => (projectRoot ? piTrustManager.getStatus(projectRoot) : Promise.resolve(null)),
			getRecentErrors: () => agentManager.getRecentDiagnosticsErrors(),
		});
		registerIpcHandlers(
			agentManager,
			settingsStore,
			recentProjects,
			piRuntimeUpdater,
			piAuthManager,
			piTrustManager,
			llamaCppManager,
			diagnosticsManager,
		);
		mainWindow = createWindow(recentProjects);
		mainWindow.on("closed", () => {
			mainWindow = null;
		});
		let shutdownStarted = false;
		app.on("before-quit", (event) => {
			if (shutdownStarted) return;
			event.preventDefault();
			shutdownStarted = true;
			stopAllTerminals();
			void agentManager.stopAll().finally(() => {
				recentProjects.close();
				app.quit();
			});
		});
		app.on("activate", () => {
			if (BrowserWindow.getAllWindows().length === 0) {
				mainWindow = createWindow(recentProjects);
				mainWindow.on("closed", () => {
					mainWindow = null;
				});
			}
		});
	});
}

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
