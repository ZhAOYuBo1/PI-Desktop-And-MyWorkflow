import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type {
	AgentRole,
	BranchSummarySettings,
	CacheWarmingMode,
	CacheWarmingSettings,
	CodemodeMode,
	CodemodeSettings,
	CompactionModelOverride,
	CompactionSettings,
	ContextCompactionSettings,
	CredentialSource,
	McpClientRegistration,
	McpExposure,
	McpOAuthInput,
	McpOAuthSummary,
	McpProjectOverride,
	McpProjectOverrideInput,
	McpProjectOverrideLocator,
	McpServerInput,
	McpServerSummary,
	PermissionDefaults,
	ProviderApi,
	ProviderInput,
	ProviderModelSummary,
	ProviderSummary,
	RoleSkillAssignments,
	SetRoleSkillAssignmentsInput,
	SettingsStatus,
} from "@codepiddy/shared";
import { safeStorage } from "electron";
import {
	createPermissionPolicy,
	DEFAULT_PERMISSION_DEFAULTS,
	normalizePermissionDefaults,
} from "./permission-settings.ts";
import { DEFAULT_ROLE_SKILL_ASSIGNMENTS } from "./skill-catalog.ts";

interface StoredSecrets {
	tavilyApiKey?: string;
	providerApiKeys?: Record<string, string>;
	mcpOAuthClientSecrets?: Record<string, string>;
}

interface TavilyMcpRuntime {
	command: string;
	args: string[];
	env?: Record<string, string>;
}

const agentRoles: AgentRole[] = ["requirement-analysis", "coding", "bug-fix", "review"];
const ROLE_SKILLS_SCHEMA_VERSION = 2;

/**
 * 写进 Pi 原生 settings.json 的重试默认值。
 * 与 @codepiddy/retry-extension 的 DEFAULT_RETRY_POLICY 保持一致。
 */
const DEFAULT_RETRY_SETTINGS = {
	maxRetries: 5,
	baseDelayMs: 1000,
	maxAgentDelayMs: 5000,
} as const;

const DEFAULT_CACHE_WARMING_MODE: CacheWarmingMode = "streaming";
const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
	enabled: true,
	reserveTokens: 16384,
	keepRecentTokens: 20000,
	modelOverrides: {},
};
const DEFAULT_BRANCH_SUMMARY_SETTINGS: BranchSummarySettings = {
	reserveTokens: 16384,
	skipPrompt: false,
};
const DEFAULT_CODEMODE_MODE: CodemodeMode = "on";

function isCacheWarmingMode(value: unknown): value is CacheWarmingMode {
	return value === "off" || value === "streaming" || value === "idle";
}

function isNonNegativeSafeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function assertNonNegativeSafeInteger(value: unknown, label: string): asserts value is number {
	if (!isNonNegativeSafeInteger(value)) throw new Error(`${label} 必须是非负整数`);
}

function normalizeCompactionModelOverrides(value: unknown): Record<string, CompactionModelOverride> {
	if (!isRecord(value)) return {};
	return Object.fromEntries(
		Object.entries(value).flatMap(([key, raw]) => {
			if (!/^[^/]+\/[^/]+$/.test(key) || key.length > 300) return [];
			if (!isRecord(raw)) return [];
			const override: CompactionModelOverride = {};
			if (isNonNegativeSafeInteger(raw.reserveTokens)) override.reserveTokens = raw.reserveTokens;
			if (isNonNegativeSafeInteger(raw.keepRecentTokens)) override.keepRecentTokens = raw.keepRecentTokens;
			return Object.keys(override).length > 0 ? [[key, override] as const] : [];
		}),
	);
}

function normalizeCompactionSettings(value: unknown): CompactionSettings {
	const record = isRecord(value) ? value : {};
	return {
		enabled: record.enabled !== false,
		reserveTokens: isNonNegativeSafeInteger(record.reserveTokens)
			? record.reserveTokens
			: DEFAULT_COMPACTION_SETTINGS.reserveTokens,
		keepRecentTokens: isNonNegativeSafeInteger(record.keepRecentTokens)
			? record.keepRecentTokens
			: DEFAULT_COMPACTION_SETTINGS.keepRecentTokens,
		modelOverrides: normalizeCompactionModelOverrides(record.modelOverrides),
	};
}

function normalizeBranchSummarySettings(value: unknown): BranchSummarySettings {
	const record = isRecord(value) ? value : {};
	return {
		reserveTokens: isNonNegativeSafeInteger(record.reserveTokens)
			? record.reserveTokens
			: DEFAULT_BRANCH_SUMMARY_SETTINGS.reserveTokens,
		skipPrompt: record.skipPrompt === true,
	};
}

function isCodemodeMode(value: unknown): value is CodemodeMode {
	return value === "on" || value === "only";
}

function normalizeCodemodeSettings(value: unknown): CodemodeSettings {
	const record = isRecord(value) ? value : {};
	return {
		mode: isCodemodeMode(record.mode) ? record.mode : DEFAULT_CODEMODE_MODE,
		inlineBudget: isNonNegativeSafeInteger(record.inlineBudget) ? record.inlineBudget : null,
	};
}

function isNotFound(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> {
	if (!isRecord(value)) return {};
	return Object.fromEntries(
		Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
	);
}

function isMcpExposure(value: unknown): value is McpExposure {
	return value === "codemode" || value === "deferred" || value === "direct" || value === "hidden";
}

function isMcpClientRegistration(value: unknown): value is McpClientRegistration {
	return value === "dcr" || value === "cimd";
}

function normalizeToolExposure(value: unknown): Record<string, McpExposure> {
	if (!isRecord(value)) return {};
	return Object.fromEntries(
		Object.entries(value).filter((entry): entry is [string, McpExposure] => isMcpExposure(entry[1])),
	);
}

function normalizeProjectOverride(value: unknown): McpProjectOverride | null {
	if (!isRecord(value)) return null;
	const override: McpProjectOverride = {};
	if (typeof value.enabled === "boolean") override.enabled = value.enabled;
	if (isMcpExposure(value.exposure)) override.exposure = value.exposure;
	const toolExposure = normalizeToolExposure(value.toolExposure);
	if (Object.keys(toolExposure).length > 0) override.toolExposure = toolExposure;
	return Object.keys(override).length > 0 ? override : null;
}

function normalizeMcpOAuth(value: unknown): McpOAuthSummary | null {
	if (!isRecord(value)) return null;
	const summary: McpOAuthSummary = {
		clientId: typeof value.clientId === "string" && value.clientId.trim() ? value.clientId.trim() : null,
		clientSecretConfigured: typeof value.clientSecret === "string" && value.clientSecret.trim().length > 0,
		callbackPort:
			typeof value.callbackPort === "number" && Number.isInteger(value.callbackPort) ? value.callbackPort : null,
		callbackUrl: typeof value.callbackUrl === "string" && value.callbackUrl.trim() ? value.callbackUrl.trim() : null,
		scope: typeof value.scope === "string" && value.scope.trim() ? value.scope.trim() : null,
		clientName: typeof value.clientName === "string" && value.clientName.trim() ? value.clientName.trim() : null,
		clientRegistration: isMcpClientRegistration(value.clientRegistration) ? value.clientRegistration : null,
		authServerMetadataUrl:
			typeof value.authServerMetadataUrl === "string" && value.authServerMetadataUrl.trim()
				? value.authServerMetadataUrl.trim()
				: null,
	};
	return Object.values(summary).some((entry) => entry !== null && entry !== false) ? summary : null;
}

function mcpOAuthClientSecretEnvName(name: string): string {
	return `CODEPIDDY_MCP_${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_CLIENT_SECRET`;
}

/** Provider Key 通过环境变量注入 Pi；models.json 只写 `$ENV_NAME` 引用。 */
function providerEnvName(id: string): string {
	return `CODEPIDDY_PROVIDER_${id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
}

function normalizeShellExecutable(value: string | null): string | null {
	if (!value || path.basename(value).toLowerCase() !== "git-bash.exe") return value;
	const root = path.dirname(value);
	const candidates = [path.join(root, "bin", "bash.exe"), path.join(root, "usr", "bin", "bash.exe")];
	return candidates.find((candidate) => existsSync(candidate)) ?? value;
}

function isProviderApi(value: unknown): value is ProviderApi {
	return (
		value === "openai-completions" ||
		value === "openai-responses" ||
		value === "anthropic-messages" ||
		value === "google-generative-ai"
	);
}

function providerCredentialSource(
	value: unknown,
	clientKeyConfigured: boolean,
): { source: CredentialSource; label: string | null } {
	if (clientKeyConfigured) return { source: "codepiddy_secret", label: null };
	if (typeof value !== "string" || value.length === 0) return { source: "none", label: null };
	if (value.startsWith("!")) return { source: "models_json_command", label: null };
	if (value.startsWith("$")) {
		const match = value.match(/^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/);
		return { source: "environment", label: match?.[1] ?? null };
	}
	return { source: "models_json_key", label: null };
}

function normalizeMcpServer(
	name: string,
	value: Record<string, unknown>,
	projectOverride: McpProjectOverride | null = null,
): McpServerSummary {
	const url = typeof value.url === "string" && value.url.trim() ? value.url.trim() : null;
	const timeout = typeof value.timeout === "number" && value.timeout > 0 ? value.timeout : null;
	return {
		name,
		transport: url ? "http" : "stdio",
		command: typeof value.command === "string" ? value.command : null,
		args: Array.isArray(value.args) ? value.args.filter((item): item is string => typeof item === "string") : [],
		url,
		env: stringRecord(value.env),
		headers: stringRecord(value.headers),
		enabled: value.enabled !== false,
		exposure: isMcpExposure(value.exposure) ? value.exposure : "codemode",
		toolExposure: normalizeToolExposure(value.toolExposure),
		description: typeof value.description === "string" && value.description.trim() ? value.description.trim() : null,
		timeout,
		oauth: normalizeMcpOAuth(value.oauth),
		authProvider:
			isRecord(value.auth) && typeof value.auth.provider === "string" && value.auth.provider.trim()
				? value.auth.provider.trim()
				: null,
		projectOverride,
		source: name === "web_search" ? "builtin" : "global",
	};
}

function normalizeProviderModel(value: unknown): ProviderModelSummary | null {
	if (!isRecord(value) || typeof value.id !== "string" || value.id.trim() === "") return null;
	const id = value.id.trim();
	return {
		id,
		name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : id,
		contextWindow: typeof value.contextWindow === "number" ? value.contextWindow : 128_000,
		maxTokens: typeof value.maxTokens === "number" ? value.maxTokens : 8192,
		reasoning: value.reasoning === true,
		input: Array.isArray(value.input)
			? value.input.filter((item): item is "text" | "image" => item === "text" || item === "image")
			: ["text"],
	};
}

/**
 * Pi 的全局配置目录，对齐 packages/coding-agent/src/config.ts 的 getAgentDir()：
 * 环境变量名由 APP_NAME 推导为 PI_CODING_AGENT_DIR，缺省是 ~/.pi/agent。
 * 抄这里而不是引 Pi 的源码，外壳对 npm 版 Pi 升级免疫。
 */
export function resolvePiAgentDir(): string {
	const configured = process.env.PI_CODING_AGENT_DIR?.trim();
	return configured ? path.resolve(configured) : path.join(homedir(), ".pi", "agent");
}

function normalizeRoleSkillAssignments(value: unknown): RoleSkillAssignments {
	const record =
		typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
	return Object.fromEntries(
		agentRoles.map((role) => {
			const roleValue = record[role];
			return [
				role,
				Array.isArray(roleValue)
					? [
							...new Set(
								roleValue.filter((item): item is string => typeof item === "string" && item.trim().length > 0),
							),
						]
					: [...DEFAULT_ROLE_SKILL_ASSIGNMENTS[role]],
			];
		}),
	) as RoleSkillAssignments;
}

function addNewBuiltinDefaults(assignments: RoleSkillAssignments): RoleSkillAssignments {
	return Object.fromEntries(
		agentRoles.map((role) => [role, [...new Set([...assignments[role], ...DEFAULT_ROLE_SKILL_ASSIGNMENTS[role]])]]),
	) as RoleSkillAssignments;
}

export class AppSettingsStore {
	private readonly secretsPath: string;
	private readonly roleSkillsPath: string;
	private readonly permissionDefaultsPath: string;
	private readonly permissionPolicyPath: string;
	private readonly shellPathFile: string;
	private readonly shareSettingsPath: string;
	private readonly piSettingsPath: string;
	private readonly mcpConfigPath: string;
	private readonly modelsConfigPath: string;
	private readonly tavilyMcpRuntime: TavilyMcpRuntime | null;

	constructor(userDataPath: string, tavilyMcpRuntime?: TavilyMcpRuntime) {
		const settingsDirectory = path.join(userDataPath, "settings");
		this.secretsPath = path.join(settingsDirectory, "secrets.json");
		this.roleSkillsPath = path.join(settingsDirectory, "role-skills.json");
		this.permissionDefaultsPath = path.join(settingsDirectory, "permission-defaults.json");
		this.permissionPolicyPath = path.join(userDataPath, "permissions", "policy", "pi-permissions.jsonc");
		this.shellPathFile = path.join(settingsDirectory, "shell.json");
		this.shareSettingsPath = path.join(settingsDirectory, "share.json");
		this.piSettingsPath = path.join(resolvePiAgentDir(), "settings.json");
		this.mcpConfigPath = path.join(resolvePiAgentDir(), "mcp.json");
		this.modelsConfigPath = path.join(resolvePiAgentDir(), "models.json");
		this.tavilyMcpRuntime = tavilyMcpRuntime ?? null;
	}

	/**
	 * 把 shellPath 同步到 Pi 自己的 settings.json。
	 *
	 * Pi 只从 settings.json 读 shellPath（packages/coding-agent/src/core/settings-manager.ts
	 * 的 getShellPath），所以这是唯一不依赖 Pi 私有补丁的通路。曾经用 PI_SHELL_PATH
	 * 环境变量绕过，那段读取是我们往 Pi 源码里加的，用户从 npm 升级 Pi 后就没了，
	 * 而外壳毫无察觉地继续传一个没人读的环境变量。
	 *
	 * 合并写而不是覆盖：settings.json 里还有模型、主题等用户自己的配置。
	 */
	private async syncPiShellPath(shellPath: string | null): Promise<void> {
		let current: Record<string, unknown> = {};
		try {
			const parsed: unknown = JSON.parse(await readFile(this.piSettingsPath, "utf8"));
			if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
				current = parsed as Record<string, unknown>;
			}
		} catch (error) {
			if (!isNotFound(error)) throw error;
		}
		if (current.shellPath === (shellPath ?? undefined)) return;
		const next = { ...current };
		if (shellPath) next.shellPath = shellPath;
		else delete next.shellPath;
		await mkdir(path.dirname(this.piSettingsPath), { recursive: true });
		await writeFile(this.piSettingsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
	}

	private async readStoredShellPath(): Promise<string | null> {
		try {
			const parsed = JSON.parse(await readFile(this.shellPathFile, "utf8")) as unknown;
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
			const value = (parsed as Record<string, unknown>).shellPath;
			return typeof value === "string" && value.trim().length > 0 ? value : null;
		} catch (error) {
			if (isNotFound(error)) return null;
			throw error;
		}
	}

	async getShellPath(): Promise<string | null> {
		return this.readStoredShellPath();
	}

	async ensureShellPathNormalized(): Promise<void> {
		const stored = await this.readStoredShellPath();
		const normalized = normalizeShellExecutable(stored);
		if (normalized && normalized !== stored) await this.setShellPath(normalized);
	}

	/**
	 * 把 CodePIddy 的重试策略写进 Pi 原生 settings.json。
	 *
	 * Pi core 的 getRetrySettings() 只读 settings.retry.*，写这里就不需要在 core 里改默认值，
	 * Pi 更新后仍然生效。只补缺失字段，用户显式写过的值优先。
	 */
	private async syncPiRetrySettings(): Promise<void> {
		let current: Record<string, unknown> = {};
		try {
			const parsed: unknown = JSON.parse(await readFile(this.piSettingsPath, "utf8"));
			if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
				current = parsed as Record<string, unknown>;
			}
		} catch (error) {
			if (!isNotFound(error)) throw error;
		}
		const existing =
			typeof current.retry === "object" && current.retry !== null && !Array.isArray(current.retry)
				? (current.retry as Record<string, unknown>)
				: {};
		const nextRetry = { ...existing };
		let changed = false;
		for (const [key, value] of Object.entries(DEFAULT_RETRY_SETTINGS)) {
			if (typeof nextRetry[key] !== "number") {
				nextRetry[key] = value;
				changed = true;
			}
		}
		if (!changed) return;
		await mkdir(path.dirname(this.piSettingsPath), { recursive: true });
		await writeFile(this.piSettingsPath, `${JSON.stringify({ ...current, retry: nextRetry }, null, 2)}\n`, "utf8");
	}

	async ensurePiRetrySettings(): Promise<void> {
		await this.syncPiRetrySettings();
	}

	async getEnabledModels(): Promise<string[] | null> {
		const settings = await this.readJsonRecord(this.piSettingsPath);
		return Array.isArray(settings.enabledModels) &&
			settings.enabledModels.every((modelId): modelId is string => typeof modelId === "string")
			? [...settings.enabledModels]
			: null;
	}

	async setEnabledModels(enabledModelIds: string[] | null): Promise<void> {
		const settings = await this.readJsonRecord(this.piSettingsPath);
		const next = { ...settings };
		if (enabledModelIds === null) delete next.enabledModels;
		else next.enabledModels = [...new Set(enabledModelIds)];
		await this.writeJsonRecord(this.piSettingsPath, next);
	}

	/**
	 * 读写 Pi 原生 settings.json 的 cacheWarming / showCacheMissNotices。
	 *
	 * Pi 1.0.1 的 RPC 没有暴露设置命令，所以这里和 shellPath、retry 一样走配置文件；
	 * 合并写而不是覆盖，保留用户自己的其他设置。改动对新启动或重置后的 Agent 生效。
	 */
	async getCacheWarmingSettings(): Promise<CacheWarmingSettings> {
		let settings: Record<string, unknown> = {};
		try {
			settings = await this.readJsonRecord(this.piSettingsPath);
		} catch {
			// settings.json 损坏时不要让整个设置页失败；写入时仍会正常报错。
		}
		return {
			mode: isCacheWarmingMode(settings.cacheWarming) ? settings.cacheWarming : DEFAULT_CACHE_WARMING_MODE,
			showCacheMissNotices: settings.showCacheMissNotices === true,
		};
	}

	async setCacheWarmingSettings(input: CacheWarmingSettings): Promise<void> {
		if (!isCacheWarmingMode(input.mode)) throw new Error("无效的缓存预热模式");
		const settings = await this.readJsonRecord(this.piSettingsPath);
		await this.writeJsonRecord(this.piSettingsPath, {
			...settings,
			cacheWarming: input.mode,
			showCacheMissNotices: input.showCacheMissNotices,
		});
	}

	/**
	 * 读写 Pi 原生 settings.json 的 compaction / branchSummary。
	 *
	 * Pi 1.0.1 只把这些字段暴露在 settings 文件中，RPC 仅能切换当前 Session 的
	 * auto compaction 开关。这里合并写文件，保留用户和 Pi 的其他配置。
	 */
	async getContextCompactionSettings(): Promise<ContextCompactionSettings> {
		let settings: Record<string, unknown> = {};
		try {
			settings = await this.readJsonRecord(this.piSettingsPath);
		} catch {
			// 与缓存预热一致：配置损坏时设置页仍可打开，写入时会正常报错。
		}
		return {
			compaction: normalizeCompactionSettings(settings.compaction),
			branchSummary: normalizeBranchSummarySettings(settings.branchSummary),
		};
	}

	async setContextCompactionSettings(input: ContextCompactionSettings): Promise<void> {
		assertNonNegativeSafeInteger(input.compaction.reserveTokens, "压缩预留 Token");
		assertNonNegativeSafeInteger(input.compaction.keepRecentTokens, "压缩保留最近 Token");
		assertNonNegativeSafeInteger(input.branchSummary.reserveTokens, "分支摘要预留 Token");
		for (const [key, override] of Object.entries(input.compaction.modelOverrides)) {
			if (!key.includes("/")) throw new Error(`模型覆盖 key 无效：${key}`);
			if (override.reserveTokens !== undefined) {
				assertNonNegativeSafeInteger(override.reserveTokens, `${key} 的压缩预留 Token`);
			}
			if (override.keepRecentTokens !== undefined) {
				assertNonNegativeSafeInteger(override.keepRecentTokens, `${key} 的压缩保留最近 Token`);
			}
		}

		const settings = await this.readJsonRecord(this.piSettingsPath);
		const currentCompaction = isRecord(settings.compaction) ? settings.compaction : {};
		const nextCompaction: Record<string, unknown> = {
			...currentCompaction,
			enabled: input.compaction.enabled,
			reserveTokens: input.compaction.reserveTokens,
			keepRecentTokens: input.compaction.keepRecentTokens,
		};
		const modelOverrides = Object.fromEntries(
			Object.entries(input.compaction.modelOverrides).map(([key, override]) => [
				key,
				{
					...(override.reserveTokens === undefined ? {} : { reserveTokens: override.reserveTokens }),
					...(override.keepRecentTokens === undefined ? {} : { keepRecentTokens: override.keepRecentTokens }),
				},
			]),
		);
		if (Object.keys(modelOverrides).length > 0) nextCompaction.modelOverrides = modelOverrides;
		else delete nextCompaction.modelOverrides;

		const currentBranchSummary = isRecord(settings.branchSummary) ? settings.branchSummary : {};
		const nextBranchSummary = {
			...currentBranchSummary,
			reserveTokens: input.branchSummary.reserveTokens,
			skipPrompt: input.branchSummary.skipPrompt,
		};

		await this.writeJsonRecord(this.piSettingsPath, {
			...settings,
			compaction: nextCompaction,
			branchSummary: nextBranchSummary,
		});
	}

	/**
	 * 读写 Pi 原生 settings.json 的 codemode.mode / codemode.inlineBudget。
	 *
	 * mode=on 保留常规工具，同时允许 Codemode 作为批量调用入口；mode=only 会让 Pi
	 * 隐藏可直接调用的工具，由 Codemode 脚本统一调用。inlineBudget 控制系统提示里
	 * 保留多少工具描述，不是脚本运行结果的截断阈值。
	 */
	async getCodemodeSettings(): Promise<CodemodeSettings> {
		let settings: Record<string, unknown> = {};
		try {
			settings = await this.readJsonRecord(this.piSettingsPath);
		} catch {
			// 配置损坏时设置页仍可打开，写入时会正常报错。
		}
		return normalizeCodemodeSettings(settings.codemode);
	}

	async setCodemodeSettings(input: CodemodeSettings): Promise<void> {
		if (!isCodemodeMode(input.mode)) throw new Error("Codemode 模式无效");
		if (input.inlineBudget !== null) {
			assertNonNegativeSafeInteger(input.inlineBudget, "Codemode 工具目录预算");
		}
		const settings = await this.readJsonRecord(this.piSettingsPath);
		const current = isRecord(settings.codemode) ? settings.codemode : {};
		const next: Record<string, unknown> = { ...current };
		if (input.mode === DEFAULT_CODEMODE_MODE) delete next.mode;
		else next.mode = input.mode;
		if (input.inlineBudget === null) delete next.inlineBudget;
		else next.inlineBudget = input.inlineBudget;

		if (Object.keys(next).length === 0) delete settings.codemode;
		else settings.codemode = next;
		await this.writeJsonRecord(this.piSettingsPath, settings);
	}

	async setShellPath(value: string): Promise<SettingsStatus> {
		const shellPath = normalizeShellExecutable(value.trim()) ?? "";
		if (shellPath && !existsSync(shellPath)) throw new Error(`Shell 路径不存在：${shellPath}`);
		if (shellPath) {
			await mkdir(path.dirname(this.shellPathFile), { recursive: true });
			await writeFile(this.shellPathFile, `${JSON.stringify({ shellPath }, null, 2)}\n`, "utf8");
		} else {
			try {
				await unlink(this.shellPathFile);
			} catch (error) {
				if (!isNotFound(error)) throw error;
			}
		}
		await this.syncPiShellPath(shellPath || null);
		return this.status();
	}

	async getGitHubCliPath(): Promise<string | null> {
		const settings = await this.readJsonRecord(this.shareSettingsPath);
		return typeof settings.githubCliPath === "string" && settings.githubCliPath.trim()
			? settings.githubCliPath.trim()
			: null;
	}

	async setGitHubCliPath(value: string | null): Promise<void> {
		const settings = await this.readJsonRecord(this.shareSettingsPath);
		const next = { ...settings };
		if (value?.trim()) {
			const githubCliPath = path.resolve(value.trim());
			if (!existsSync(githubCliPath)) throw new Error(`GitHub CLI 路径不存在：${githubCliPath}`);
			next.githubCliPath = githubCliPath;
		} else {
			delete next.githubCliPath;
		}
		if (Object.keys(next).length === 0) {
			try {
				await unlink(this.shareSettingsPath);
			} catch (error) {
				if (!isNotFound(error)) throw error;
			}
			return;
		}
		await this.writeJsonRecord(this.shareSettingsPath, next);
	}

	async getPermissionDefaults(): Promise<PermissionDefaults> {
		try {
			return normalizePermissionDefaults(JSON.parse(await readFile(this.permissionDefaultsPath, "utf8")) as unknown);
		} catch (error) {
			if (isNotFound(error)) return { ...DEFAULT_PERMISSION_DEFAULTS };
			throw error;
		}
	}

	private async writePermissionPolicy(defaults: PermissionDefaults): Promise<void> {
		await mkdir(path.dirname(this.permissionPolicyPath), { recursive: true });
		await writeFile(
			this.permissionPolicyPath,
			`${JSON.stringify(createPermissionPolicy(defaults), null, 2)}\n`,
			"utf8",
		);
	}

	async ensurePermissionPolicy(): Promise<PermissionDefaults> {
		const defaults = await this.getPermissionDefaults();
		await this.writePermissionPolicy(defaults);
		return defaults;
	}

	async setPermissionDefaults(input: PermissionDefaults): Promise<PermissionDefaults> {
		const defaults = normalizePermissionDefaults(input);
		await mkdir(path.dirname(this.permissionDefaultsPath), { recursive: true });
		await writeFile(this.permissionDefaultsPath, `${JSON.stringify(defaults, null, 2)}\n`, "utf8");
		await this.writePermissionPolicy(defaults);
		return defaults;
	}

	private async readSecrets(): Promise<StoredSecrets> {
		try {
			const parsed = JSON.parse(await readFile(this.secretsPath, "utf8")) as unknown;
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
			const record = parsed as Record<string, unknown>;
			const providerApiKeys = record.providerApiKeys;
			const mcpOAuthClientSecrets = record.mcpOAuthClientSecrets;
			return {
				...(typeof record.tavilyApiKey === "string" ? { tavilyApiKey: record.tavilyApiKey } : {}),
				...(typeof providerApiKeys === "object" && providerApiKeys !== null && !Array.isArray(providerApiKeys)
					? {
							providerApiKeys: Object.fromEntries(
								Object.entries(providerApiKeys).filter(
									(entry): entry is [string, string] => typeof entry[1] === "string",
								),
							),
						}
					: {}),
				...(typeof mcpOAuthClientSecrets === "object" &&
				mcpOAuthClientSecrets !== null &&
				!Array.isArray(mcpOAuthClientSecrets)
					? {
							mcpOAuthClientSecrets: Object.fromEntries(
								Object.entries(mcpOAuthClientSecrets).filter(
									(entry): entry is [string, string] => typeof entry[1] === "string",
								),
							),
						}
					: {}),
			};
		} catch (error) {
			if (isNotFound(error)) return {};
			throw error;
		}
	}

	private async writeSecrets(secrets: StoredSecrets): Promise<void> {
		const hasProviderKeys = secrets.providerApiKeys && Object.keys(secrets.providerApiKeys).length > 0;
		const hasMcpOAuthSecrets = secrets.mcpOAuthClientSecrets && Object.keys(secrets.mcpOAuthClientSecrets).length > 0;
		if (!secrets.tavilyApiKey && !hasProviderKeys && !hasMcpOAuthSecrets) {
			try {
				await unlink(this.secretsPath);
			} catch (error) {
				if (!isNotFound(error)) throw error;
			}
			return;
		}
		await mkdir(path.dirname(this.secretsPath), { recursive: true });
		await writeFile(this.secretsPath, `${JSON.stringify(secrets, null, 2)}\n`, "utf8");
	}

	private decrypt(value: string | undefined): string | null {
		if (!value || !safeStorage.isEncryptionAvailable()) return null;
		return safeStorage.decryptString(Buffer.from(value, "base64"));
	}

	private encrypt(value: string): string {
		if (!safeStorage.isEncryptionAvailable()) throw new Error("当前系统无法使用 Electron safeStorage");
		return safeStorage.encryptString(value).toString("base64");
	}

	async getRoleSkillAssignments(): Promise<RoleSkillAssignments> {
		try {
			const parsed = JSON.parse(await readFile(this.roleSkillsPath, "utf8")) as unknown;
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
				return structuredClone(DEFAULT_ROLE_SKILL_ASSIGNMENTS);
			}
			const record = parsed as Record<string, unknown>;
			if (record.schemaVersion === ROLE_SKILLS_SCHEMA_VERSION) {
				return normalizeRoleSkillAssignments(record.assignments);
			}
			const migrated = addNewBuiltinDefaults(normalizeRoleSkillAssignments(record));
			await this.writeRoleSkillAssignments(migrated);
			return migrated;
		} catch (error) {
			if (isNotFound(error)) return structuredClone(DEFAULT_ROLE_SKILL_ASSIGNMENTS);
			throw error;
		}
	}

	private async writeRoleSkillAssignments(assignments: RoleSkillAssignments): Promise<void> {
		await mkdir(path.dirname(this.roleSkillsPath), { recursive: true });
		await writeFile(
			this.roleSkillsPath,
			`${JSON.stringify({ schemaVersion: ROLE_SKILLS_SCHEMA_VERSION, assignments }, null, 2)}\n`,
			"utf8",
		);
	}

	async setRoleSkillAssignments(input: SetRoleSkillAssignmentsInput): Promise<RoleSkillAssignments> {
		const assignments = await this.getRoleSkillAssignments();
		assignments[input.role] = [
			...new Set(input.skillIds.map((skillId) => skillId.trim()).filter((skillId) => skillId.length > 0)),
		];
		await this.writeRoleSkillAssignments(assignments);
		return assignments;
	}

	private async readJsonRecord(filePath: string): Promise<Record<string, unknown>> {
		try {
			const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
			if (isRecord(parsed)) return parsed;
		} catch (error) {
			if (!isNotFound(error)) throw error;
		}
		return {};
	}

	private async writeJsonRecord(filePath: string, value: Record<string, unknown>): Promise<void> {
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	}

	private projectMcpConfigPath(projectRoot: string): string {
		return path.join(projectRoot, ".pi", "mcp.json");
	}

	private async readProjectMcpOverrides(projectRoot?: string): Promise<Record<string, McpProjectOverride>> {
		if (!projectRoot) return {};
		const config = await this.readJsonRecord(this.projectMcpConfigPath(projectRoot));
		const servers = isRecord(config.mcpServers) ? config.mcpServers : {};
		return Object.fromEntries(
			Object.entries(servers).flatMap(([name, value]) => {
				const override = normalizeProjectOverride(value);
				return override ? [[name, override] as const] : [];
			}),
		);
	}

	async listMcpServers(projectRoot?: string): Promise<McpServerSummary[]> {
		const config = await this.readJsonRecord(this.mcpConfigPath);
		const servers = isRecord(config.mcpServers) ? config.mcpServers : {};
		const projectOverrides = await this.readProjectMcpOverrides(projectRoot);
		return Object.entries(servers)
			.filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
			.map(([name, value]) => normalizeMcpServer(name, value, projectOverrides[name] ?? null))
			.sort((left, right) => left.name.localeCompare(right.name));
	}

	async ensureTavilyMcpServer(): Promise<void> {
		if (!this.tavilyMcpRuntime) return;
		const config = await this.readJsonRecord(this.mcpConfigPath);
		const servers = isRecord(config.mcpServers) ? { ...config.mcpServers } : {};
		const existing = isRecord(servers.web_search) ? { ...servers.web_search } : {};
		const env = stringRecord(existing.env);
		delete env.ELECTRON_RUN_AS_NODE;
		const toolExposure = stringRecord(existing.toolExposure);
		const entry: Record<string, unknown> = {
			...existing,
			type: "stdio",
			command: this.tavilyMcpRuntime.command,
			args: [...this.tavilyMcpRuntime.args],
			env: {
				...env,
				...this.tavilyMcpRuntime.env,
				TAVILY_API_KEY: `\${TAVILY_API_KEY}`,
			},
			description: "Tavily web search",
			exposure: "direct",
			toolExposure: {
				...toolExposure,
				web_search: "direct",
			},
		};
		delete entry.disabled;
		if ((await this.getTavilyApiKey()) === null) entry.enabled = false;
		else delete entry.enabled;
		servers.web_search = entry;
		await this.writeJsonRecord(this.mcpConfigPath, { ...config, mcpServers: servers });
	}

	async saveMcpServer(input: McpServerInput): Promise<McpServerSummary[]> {
		const name = input.name.trim();
		if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error("MCP 服务名只能包含字母、数字、点、下划线和连字符");
		if (name === "web_search") throw new Error("web_search 由 Tavily Search 设置维护");
		if (input.transport === "stdio" && !input.command?.trim()) throw new Error("stdio 服务需要 command");
		if (input.transport === "http" && !input.url?.trim()) throw new Error("http 服务需要 url");
		const config = await this.readJsonRecord(this.mcpConfigPath);
		const servers = isRecord(config.mcpServers) ? { ...config.mcpServers } : {};
		const entry: Record<string, unknown> = isRecord(servers[name]) ? { ...servers[name] } : {};
		delete entry.disabled;
		if (input.transport === "http") {
			entry.type = "http";
			entry.url = input.url!.trim();
			delete entry.command;
			delete entry.args;
			delete entry.env;
			delete entry.cwd;
			const headers = Object.fromEntries(
				Object.entries(input.headers ?? {}).filter(([key, value]) => key.trim() && value.trim()),
			);
			if (Object.keys(headers).length > 0) entry.headers = headers;
			else delete entry.headers;
		} else {
			delete entry.type;
			delete entry.url;
			delete entry.headers;
			entry.command = input.command!.trim();
			const args = (input.args ?? []).map((arg) => arg.trim()).filter(Boolean);
			if (args.length > 0) entry.args = args;
			else delete entry.args;
			const env = Object.fromEntries(
				Object.entries(input.env ?? {}).filter(([key, value]) => key.trim() && value.trim()),
			);
			if (Object.keys(env).length > 0) entry.env = env;
			else delete entry.env;
		}
		if (input.enabled === false) entry.enabled = false;
		else if (input.enabled === true) delete entry.enabled;
		if (input.exposure !== undefined) {
			if (input.exposure === "codemode") delete entry.exposure;
			else entry.exposure = input.exposure;
		}
		if (input.toolExposure !== undefined) {
			const toolExposure = normalizeToolExposure(input.toolExposure);
			if (Object.keys(toolExposure).length > 0) entry.toolExposure = toolExposure;
			else delete entry.toolExposure;
		}
		if (input.description !== undefined) {
			const description = input.description.trim();
			if (description) entry.description = description;
			else delete entry.description;
		}
		if (input.timeout !== undefined) {
			if (input.timeout > 0) entry.timeout = input.timeout;
			else delete entry.timeout;
		}
		if (input.authProvider !== undefined) {
			const provider = input.authProvider.trim();
			if (provider && input.transport === "http") entry.auth = { provider };
			else delete entry.auth;
		}
		if (input.oauth !== undefined) {
			await this.updateMcpOAuthConfig(name, entry, input.oauth);
		} else if (input.transport === "stdio") {
			delete entry.oauth;
			await this.removeMcpOAuthClientSecret(name);
		}
		servers[name] = entry;
		await this.writeJsonRecord(this.mcpConfigPath, { ...config, mcpServers: servers });
		return this.listMcpServers();
	}

	async deleteMcpServer(name: string): Promise<McpServerSummary[]> {
		if (name === "web_search") throw new Error("web_search 由 Tavily Search 设置维护");
		const config = await this.readJsonRecord(this.mcpConfigPath);
		const servers = isRecord(config.mcpServers) ? { ...config.mcpServers } : {};
		delete servers[name];
		await this.writeJsonRecord(this.mcpConfigPath, { ...config, mcpServers: servers });
		await this.removeMcpOAuthClientSecret(name);
		return this.listMcpServers();
	}

	async saveMcpProjectOverride(input: McpProjectOverrideInput): Promise<McpServerSummary[]> {
		const name = input.name.trim();
		if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error("MCP 服务名只能包含字母、数字、点、下划线和连字符");
		const filePath = this.projectMcpConfigPath(input.projectRoot);
		const config = await this.readJsonRecord(filePath);
		const servers = isRecord(config.mcpServers) ? { ...config.mcpServers } : {};
		const existing = isRecord(servers[name]) ? { ...servers[name] } : {};
		const override: Record<string, unknown> = {
			...(typeof existing.enabled === "boolean" ? { enabled: existing.enabled } : {}),
			...(isMcpExposure(existing.exposure) ? { exposure: existing.exposure } : {}),
			...(Object.keys(normalizeToolExposure(existing.toolExposure)).length > 0
				? { toolExposure: normalizeToolExposure(existing.toolExposure) }
				: {}),
		};
		if (input.enabled !== undefined) {
			if (input.enabled === null) delete override.enabled;
			else override.enabled = input.enabled;
		}
		if (input.exposure !== undefined) {
			if (input.exposure === null) delete override.exposure;
			else override.exposure = input.exposure;
		}
		if (input.toolExposure !== undefined) {
			const toolExposure = input.toolExposure === null ? {} : normalizeToolExposure(input.toolExposure);
			if (Object.keys(toolExposure).length > 0) override.toolExposure = toolExposure;
			else delete override.toolExposure;
		}
		if (Object.keys(override).length > 0) servers[name] = override;
		else delete servers[name];
		await this.writeJsonRecord(filePath, { ...config, mcpServers: servers });
		return this.listMcpServers(input.projectRoot);
	}

	async deleteMcpProjectOverride(input: McpProjectOverrideLocator): Promise<McpServerSummary[]> {
		const filePath = this.projectMcpConfigPath(input.projectRoot);
		const config = await this.readJsonRecord(filePath);
		const servers = isRecord(config.mcpServers) ? { ...config.mcpServers } : {};
		delete servers[input.name];
		await this.writeJsonRecord(filePath, { ...config, mcpServers: servers });
		return this.listMcpServers(input.projectRoot);
	}

	private async removeMcpOAuthClientSecret(name: string): Promise<void> {
		const secrets = await this.readSecrets();
		if (!secrets.mcpOAuthClientSecrets?.[name]) return;
		const next = { ...secrets.mcpOAuthClientSecrets };
		delete next[name];
		secrets.mcpOAuthClientSecrets = next;
		await this.writeSecrets(secrets);
	}

	private async updateMcpOAuthConfig(
		name: string,
		entry: Record<string, unknown>,
		input: McpOAuthInput | null,
	): Promise<void> {
		if (input === null) {
			delete entry.oauth;
			await this.removeMcpOAuthClientSecret(name);
			return;
		}
		const oauth = isRecord(entry.oauth) ? { ...entry.oauth } : {};
		const setString = (key: string, value: string | undefined): void => {
			if (value === undefined) return;
			const normalized = value.trim();
			if (normalized) oauth[key] = normalized;
			else delete oauth[key];
		};
		setString("clientId", input.clientId);
		setString("callbackUrl", input.callbackUrl);
		setString("scope", input.scope);
		setString("clientName", input.clientName);
		setString("authServerMetadataUrl", input.authServerMetadataUrl);
		if (input.callbackPort !== undefined) {
			if (input.callbackPort === null) delete oauth.callbackPort;
			else oauth.callbackPort = input.callbackPort;
		}
		if (input.clientRegistration !== undefined) {
			if (input.clientRegistration === null) delete oauth.clientRegistration;
			else oauth.clientRegistration = input.clientRegistration;
		}
		if (input.clientSecret !== undefined) {
			const secrets = await this.readSecrets();
			const clientSecrets = { ...(secrets.mcpOAuthClientSecrets ?? {}) };
			const clientSecret = input.clientSecret.trim();
			if (clientSecret) {
				clientSecrets[name] = this.encrypt(clientSecret);
				oauth.clientSecret = `\${${mcpOAuthClientSecretEnvName(name)}}`;
			} else {
				delete clientSecrets[name];
				delete oauth.clientSecret;
			}
			secrets.mcpOAuthClientSecrets = clientSecrets;
			await this.writeSecrets(secrets);
		}
		if (Object.keys(oauth).length > 0) entry.oauth = oauth;
		else delete entry.oauth;
	}

	async listProviders(): Promise<ProviderSummary[]> {
		const config = await this.readJsonRecord(this.modelsConfigPath);
		const providers = isRecord(config.providers) ? config.providers : {};
		const secrets = await this.readSecrets();
		const keys = secrets.providerApiKeys ?? {};
		return Object.entries(providers)
			.filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
			.map(([id, value]) => {
				const credential = providerCredentialSource(value.apiKey, Boolean(keys[id]));
				return {
					id,
					baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : "",
					api: isProviderApi(value.api) ? value.api : "openai-completions",
					credentialSource: credential.source,
					credentialLabel: credential.label,
					models: Array.isArray(value.models)
						? value.models
								.map(normalizeProviderModel)
								.filter((model): model is ProviderModelSummary => model !== null)
						: [],
				};
			})
			.sort((left, right) => left.id.localeCompare(right.id));
	}

	async saveProvider(input: ProviderInput): Promise<ProviderSummary[]> {
		const id = input.id.trim();
		if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error("Provider ID 只能包含字母、数字、点、下划线和连字符");
		if (!input.baseUrl.trim()) throw new Error("baseUrl 不能为空");
		if (!isProviderApi(input.api)) throw new Error("Provider API 类型无效");
		const models = input.models
			.map((model) => normalizeProviderModel(model))
			.filter((model): model is ProviderModelSummary => model !== null);
		if (models.length === 0) throw new Error("至少需要一个模型");
		const config = await this.readJsonRecord(this.modelsConfigPath);
		const providers = isRecord(config.providers) ? { ...config.providers } : {};
		const existing = isRecord(providers[id]) ? (providers[id] as Record<string, unknown>) : {};
		const entry: Record<string, unknown> = {
			...existing,
			baseUrl: input.baseUrl.trim(),
			api: input.api,
			models: models.map((model) => ({ ...model, input: model.input.length > 0 ? model.input : ["text"] })),
		};
		const secrets = await this.readSecrets();
		const keys = { ...(secrets.providerApiKeys ?? {}) };
		if (input.apiKey !== undefined) {
			const apiKey = input.apiKey.trim();
			if (apiKey) keys[id] = this.encrypt(apiKey);
			else delete keys[id];
			secrets.providerApiKeys = keys;
			await this.writeSecrets(secrets);
		}
		if (keys[id]) entry.apiKey = `$${providerEnvName(id)}`;
		else if (typeof existing.apiKey === "string" && !existing.apiKey.startsWith("$")) entry.apiKey = existing.apiKey;
		else delete entry.apiKey;
		providers[id] = entry;
		await this.writeJsonRecord(this.modelsConfigPath, { ...config, providers });
		return this.listProviders();
	}

	async deleteProvider(id: string): Promise<ProviderSummary[]> {
		const config = await this.readJsonRecord(this.modelsConfigPath);
		const providers = isRecord(config.providers) ? { ...config.providers } : {};
		delete providers[id];
		await this.writeJsonRecord(this.modelsConfigPath, { ...config, providers });
		const secrets = await this.readSecrets();
		if (secrets.providerApiKeys?.[id]) {
			const keys = { ...secrets.providerApiKeys };
			delete keys[id];
			secrets.providerApiKeys = keys;
			await this.writeSecrets(secrets);
		}
		return this.listProviders();
	}

	async getProviderEnv(): Promise<Record<string, string>> {
		const secrets = await this.readSecrets();
		const env: Record<string, string> = {};
		for (const [id, encrypted] of Object.entries(secrets.providerApiKeys ?? {})) {
			const value = this.decrypt(encrypted);
			if (value) env[providerEnvName(id)] = value;
		}
		return env;
	}

	async getMcpEnv(): Promise<Record<string, string>> {
		const secrets = await this.readSecrets();
		const env: Record<string, string> = {};
		for (const [name, encrypted] of Object.entries(secrets.mcpOAuthClientSecrets ?? {})) {
			const value = this.decrypt(encrypted);
			if (value) env[mcpOAuthClientSecretEnvName(name)] = value;
		}
		return env;
	}

	async status(): Promise<SettingsStatus> {
		return {
			tavilyApiKeyConfigured: (await this.getTavilyApiKey()) !== null,
			encryptionAvailable: safeStorage.isEncryptionAvailable(),
			shellPath: await this.getShellPath(),
			cacheWarming: await this.getCacheWarmingSettings(),
			contextCompaction: await this.getContextCompactionSettings(),
			codemode: await this.getCodemodeSettings(),
		};
	}

	async getTavilyApiKey(): Promise<string | null> {
		return this.decrypt((await this.readSecrets()).tavilyApiKey);
	}

	async saveTavilyApiKey(value: string): Promise<SettingsStatus> {
		const apiKey = value.trim();
		if (!apiKey) throw new Error("Tavily API Key 不能为空");
		const secrets = await this.readSecrets();
		secrets.tavilyApiKey = this.encrypt(apiKey);
		await this.writeSecrets(secrets);
		await this.ensureTavilyMcpServer();
		return this.status();
	}

	async clearTavilyApiKey(): Promise<SettingsStatus> {
		const secrets = await this.readSecrets();
		delete secrets.tavilyApiKey;
		await this.writeSecrets(secrets);
		await this.ensureTavilyMcpServer();
		return this.status();
	}
}
