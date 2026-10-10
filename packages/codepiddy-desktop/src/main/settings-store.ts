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
	InstallTelemetryEnvironmentOverride,
	InstallTelemetrySettings,
	JsonObject,
	JsonValue,
	McpClientRegistration,
	McpExposure,
	McpOAuthInput,
	McpOAuthSummary,
	McpProjectOverride,
	McpProjectOverrideInput,
	McpProjectOverrideLocator,
	McpServerInput,
	McpServerSummary,
	PiBuiltinToolName,
	ProviderInput,
	ProviderModelCost,
	ProviderModelInput,
	ProviderModelOverride,
	ProviderModelSummary,
	ProviderPromptCache,
	ProviderSummary,
	ProviderThinkingLevelMap,
	RoleSkillAssignments,
	SetRoleSkillAssignmentsInput,
	SettingsStatus,
	ToolSettings,
} from "@codepiddy/shared";
import { safeStorage } from "electron";
import { DEFAULT_ROLE_SKILL_ASSIGNMENTS } from "./skill-catalog.ts";

interface StoredSecrets {
	providerApiKeys?: Record<string, string>;
	mcpOAuthClientSecrets?: Record<string, string>;
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
const PI_BUILTIN_TOOL_NAMES = [
	"read",
	"bash",
	"powershell",
	"edit",
	"write",
	"grep",
	"find",
	"ls",
] as const satisfies readonly PiBuiltinToolName[];
const PI_DEFAULT_TOOL_NAMES = ["read", "bash", "edit", "write"] as const satisfies readonly PiBuiltinToolName[];

function isPiBuiltinToolName(value: unknown): value is PiBuiltinToolName {
	return typeof value === "string" && (PI_BUILTIN_TOOL_NAMES as readonly string[]).includes(value);
}

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

function normalizeToolSettings(value: unknown): ToolSettings {
	const record = isRecord(value) ? value : {};
	if (!Array.isArray(record.defaultTools)) return { defaultTools: null };
	return {
		defaultTools: [...new Set(record.defaultTools.filter(isPiBuiltinToolName))],
	};
}

function normalizeInstallTelemetryEnvironmentOverride(value: string | undefined): InstallTelemetryEnvironmentOverride {
	if (value === undefined) return null;
	const normalized = value.toLowerCase();
	return value === "1" || normalized === "true" || normalized === "yes" ? "enabled" : "disabled";
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

const PROVIDER_KNOWN_FIELDS = new Set([
	"name",
	"baseUrl",
	"apiKey",
	"api",
	"oauth",
	"headers",
	"compat",
	"authHeader",
	"models",
	"modelOverrides",
]);

const PROVIDER_MODEL_KNOWN_FIELDS = new Set([
	"id",
	"name",
	"api",
	"baseUrl",
	"reasoning",
	"thinkingLevelMap",
	"input",
	"inputLimits",
	"cost",
	"promptCache",
	"contextWindow",
	"maxTokens",
	"samplingParams",
	"headers",
	"compat",
]);

const MODEL_COST_KEYS = ["input", "output", "cacheRead", "cacheWrite"] as const;
const PROVIDER_ADVANCED_FIELDS = new Set(["headers", "authHeader", "compat", "modelOverrides"]);
const MODEL_ADVANCED_FIELDS = new Set([
	"thinkingLevelMap",
	"inputLimits",
	"cost",
	"promptCache",
	"samplingParams",
	"headers",
	"compat",
]);

function cloneJsonValue(value: unknown, depth = 0): JsonValue | undefined {
	if (depth > 32) return undefined;
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
	if (Array.isArray(value)) {
		const items: JsonValue[] = [];
		for (const item of value) {
			const cloned = cloneJsonValue(item, depth + 1);
			if (cloned === undefined) return undefined;
			items.push(cloned);
		}
		return items;
	}
	if (!isRecord(value)) return undefined;
	const cloned: JsonObject = {};
	for (const [key, item] of Object.entries(value)) {
		const child = cloneJsonValue(item, depth + 1);
		if (child === undefined) return undefined;
		cloned[key] = child;
	}
	return cloned;
}

function cloneJsonObject(value: unknown): JsonObject | null {
	const cloned = cloneJsonValue(value);
	return cloned !== undefined && copiedJsonObject(cloned) ? cloned : null;
}

function copiedJsonObject(value: JsonValue): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extraJsonObject(value: Record<string, unknown>, knownFields: ReadonlySet<string>): JsonObject {
	const extra: JsonObject = {};
	for (const [key, item] of Object.entries(value)) {
		if (knownFields.has(key)) continue;
		const cloned = cloneJsonValue(item);
		if (cloned !== undefined) extra[key] = cloned;
	}
	return extra;
}

function replaceUnknownFields(
	target: Record<string, unknown>,
	knownFields: ReadonlySet<string>,
	extra: JsonObject | undefined,
): void {
	if (extra === undefined) return;
	for (const key of Object.keys(target)) {
		if (!knownFields.has(key)) delete target[key];
	}
	Object.assign(target, extra);
}

function stringOrUndefined(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function finiteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringRecordOrUndefined(value: unknown): Record<string, string> | undefined {
	if (!isRecord(value)) return undefined;
	const result = stringRecord(value);
	return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeThinkingLevelMap(value: unknown): ProviderThinkingLevelMap | undefined {
	if (!isRecord(value)) return undefined;
	const map: ProviderThinkingLevelMap = {};
	for (const [level, mapped] of Object.entries(value)) {
		if (mapped === null || typeof mapped === "string") map[level] = mapped;
	}
	return Object.keys(map).length > 0 ? map : undefined;
}

function normalizePromptCache(value: unknown): ProviderPromptCache | undefined {
	if (!isRecord(value)) return undefined;
	const promptCache: ProviderPromptCache = {};
	if (finiteNumber(value.short) !== undefined) promptCache.short = value.short as number;
	if (finiteNumber(value.long) !== undefined) promptCache.long = value.long as number;
	return Object.keys(promptCache).length > 0 ? promptCache : undefined;
}

function normalizeModelCost(value: unknown): ProviderModelCost | undefined {
	if (!isRecord(value)) return undefined;
	const rates: Partial<ProviderModelCost> = {};
	for (const key of MODEL_COST_KEYS) {
		const rate = finiteNumber(value[key]);
		if (rate === undefined) return undefined;
		rates[key] = rate;
	}
	const tiers = Array.isArray(value.tiers)
		? value.tiers.flatMap((tier) => {
				if (!isRecord(tier)) return [];
				const inputTokensAbove = finiteNumber(tier.inputTokensAbove);
				const tierRates = MODEL_COST_KEYS.map((key) => finiteNumber(tier[key]));
				if (inputTokensAbove === undefined || tierRates.some((rate) => rate === undefined)) return [];
				return [
					{
						inputTokensAbove,
						input: tierRates[0] as number,
						output: tierRates[1] as number,
						cacheRead: tierRates[2] as number,
						cacheWrite: tierRates[3] as number,
					},
				];
			})
		: [];
	const cost: ProviderModelCost = {
		input: rates.input as number,
		output: rates.output as number,
		cacheRead: rates.cacheRead as number,
		cacheWrite: rates.cacheWrite as number,
	};
	if (tiers.length > 0) cost.tiers = tiers;
	return cost;
}

function normalizeProviderModelOverrides(value: unknown): Record<string, ProviderModelOverride> | undefined {
	if (!isRecord(value)) return undefined;
	const overrides: Record<string, ProviderModelOverride> = {};
	for (const [modelId, override] of Object.entries(value)) {
		const cloned = cloneJsonObject(override);
		if (!modelId.trim() || cloned === null) continue;
		overrides[modelId] = cloned;
	}
	return Object.keys(overrides).length > 0 ? overrides : undefined;
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
	};
}

function normalizeProviderModel(value: unknown): ProviderModelSummary | null {
	if (!isRecord(value) || typeof value.id !== "string" || value.id.trim() === "") return null;
	const id = value.id.trim();
	const extra = extraJsonObject(value, PROVIDER_MODEL_KNOWN_FIELDS);
	const model: ProviderModelSummary = {
		id,
		name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : id,
		reasoning: value.reasoning === true,
		input: Array.isArray(value.input)
			? value.input.filter((item): item is "text" | "image" => item === "text" || item === "image")
			: ["text"],
		advanced: advancedJsonObject(value, MODEL_ADVANCED_FIELDS, extra),
		extra,
	};
	const api = stringOrUndefined(value.api);
	if (api) model.api = api;
	const baseUrl = stringOrUndefined(value.baseUrl);
	if (baseUrl) model.baseUrl = baseUrl;
	const contextWindow = finiteNumber(value.contextWindow);
	if (contextWindow !== undefined) model.contextWindow = contextWindow;
	const maxTokens = finiteNumber(value.maxTokens);
	if (maxTokens !== undefined) model.maxTokens = maxTokens;
	const thinkingLevelMap = normalizeThinkingLevelMap(value.thinkingLevelMap);
	if (thinkingLevelMap) model.thinkingLevelMap = thinkingLevelMap;
	const inputLimits = cloneJsonObject(value.inputLimits);
	if (inputLimits) model.inputLimits = inputLimits;
	const cost = normalizeModelCost(value.cost);
	if (cost) model.cost = cost;
	const promptCache = normalizePromptCache(value.promptCache);
	if (promptCache) model.promptCache = promptCache;
	const samplingParams = cloneJsonObject(value.samplingParams);
	if (samplingParams) model.samplingParams = samplingParams;
	const headers = stringRecordOrUndefined(value.headers);
	if (headers) model.headers = headers;
	const compat = cloneJsonObject(value.compat);
	if (compat) model.compat = compat;
	return model;
}

function advancedJsonObject(
	value: Record<string, unknown>,
	advancedFields: ReadonlySet<string>,
	extra: JsonObject,
): JsonObject {
	const advanced: JsonObject = { ...extra };
	for (const key of advancedFields) {
		if (!Object.hasOwn(value, key)) continue;
		const cloned = cloneJsonValue(value[key]);
		if (cloned !== undefined) advanced[key] = cloned;
	}
	return advanced;
}

function requireJsonObject(value: unknown, label: string): JsonObject {
	const object = cloneJsonObject(value);
	if (!object) throw new Error(`${label}必须是 JSON 对象`);
	return object;
}

function setOptionalString(target: Record<string, unknown>, key: string, value: string | null | undefined): void {
	if (value === undefined) return;
	const normalized = typeof value === "string" ? value.trim() : "";
	if (normalized) target[key] = normalized;
	else delete target[key];
}

function setOptionalJsonObject(
	target: Record<string, unknown>,
	key: string,
	value: JsonObject | null | undefined,
	label: string,
): void {
	if (value === undefined) return;
	if (value === null || Object.keys(value).length === 0) {
		delete target[key];
		return;
	}
	target[key] = requireJsonObject(value, label);
}

function assertNoReservedAdvancedFields(
	advanced: JsonObject,
	knownFields: ReadonlySet<string>,
	allowedFields: ReadonlySet<string>,
	label: string,
): void {
	for (const key of Object.keys(advanced)) {
		if (knownFields.has(key) && !allowedFields.has(key)) {
			throw new Error(`${label}不能包含字段 ${key}`);
		}
	}
}

function applyProviderAdvancedInput(entry: Record<string, unknown>, advanced: JsonObject): void {
	assertNoReservedAdvancedFields(advanced, PROVIDER_KNOWN_FIELDS, PROVIDER_ADVANCED_FIELDS, "Provider 高级配置");
	if (Object.hasOwn(advanced, "headers")) {
		const value = advanced.headers;
		if (value === null) {
			delete entry.headers;
		} else {
			if (!isRecord(value) || Object.values(value).some((item) => typeof item !== "string")) {
				throw new Error("Provider advanced.headers 必须是字符串对象");
			}
			const headers = stringRecord(value);
			if (Object.keys(headers).length > 0) entry.headers = headers;
			else delete entry.headers;
		}
	}
	if (Object.hasOwn(advanced, "authHeader")) {
		const value = advanced.authHeader;
		if (value === null) delete entry.authHeader;
		else if (typeof value === "boolean") entry.authHeader = value;
		else throw new Error("Provider advanced.authHeader 必须是布尔值");
	}
	if (Object.hasOwn(advanced, "compat")) {
		setOptionalJsonObject(entry, "compat", advanced.compat as JsonObject | null, "Provider advanced.compat");
	}
	if (Object.hasOwn(advanced, "modelOverrides")) {
		const value = advanced.modelOverrides;
		const overrides = value === null ? undefined : normalizeProviderModelOverrides(value as Record<string, unknown>);
		if (overrides) entry.modelOverrides = overrides;
		else delete entry.modelOverrides;
	}
	const extra = extraJsonObject(advanced, PROVIDER_ADVANCED_FIELDS);
	replaceUnknownFields(entry, PROVIDER_KNOWN_FIELDS, extra);
}

function applyModelAdvancedInput(entry: Record<string, unknown>, advanced: JsonObject): void {
	assertNoReservedAdvancedFields(advanced, PROVIDER_MODEL_KNOWN_FIELDS, MODEL_ADVANCED_FIELDS, "模型高级配置");
	if (Object.hasOwn(advanced, "thinkingLevelMap")) {
		const value = advanced.thinkingLevelMap;
		if (value === null || (isRecord(value) && Object.keys(value).length === 0)) delete entry.thinkingLevelMap;
		else {
			const map = normalizeThinkingLevelMap(value);
			if (!map) throw new Error("模型 advanced.thinkingLevelMap 必须是字符串或 null 对象");
			entry.thinkingLevelMap = map;
		}
	}
	for (const key of ["inputLimits", "samplingParams", "compat"] as const) {
		if (!Object.hasOwn(advanced, key)) continue;
		setOptionalJsonObject(entry, key, advanced[key] as JsonObject | null, `模型 advanced.${key}`);
	}
	if (Object.hasOwn(advanced, "cost")) {
		const value = advanced.cost;
		if (value === null || (isRecord(value) && Object.keys(value).length === 0)) delete entry.cost;
		else {
			const cost = normalizeModelCost(value);
			if (!cost) throw new Error("模型 advanced.cost 必须包含 input / output / cacheRead / cacheWrite");
			entry.cost = cost;
		}
	}
	if (Object.hasOwn(advanced, "promptCache")) {
		const value = advanced.promptCache;
		if (value === null || (isRecord(value) && Object.keys(value).length === 0)) delete entry.promptCache;
		else {
			const promptCache = normalizePromptCache(value);
			if (!promptCache) throw new Error("模型 advanced.promptCache 必须包含 short 或 long 数值");
			entry.promptCache = promptCache;
		}
	}
	if (Object.hasOwn(advanced, "headers")) {
		const value = advanced.headers;
		if (value === null) delete entry.headers;
		else {
			if (!isRecord(value) || Object.values(value).some((item) => typeof item !== "string")) {
				throw new Error("模型 advanced.headers 必须是字符串对象");
			}
			const headers = stringRecord(value);
			if (Object.keys(headers).length > 0) entry.headers = headers;
			else delete entry.headers;
		}
	}
	const extra = extraJsonObject(advanced, MODEL_ADVANCED_FIELDS);
	replaceUnknownFields(entry, PROVIDER_MODEL_KNOWN_FIELDS, extra);
}

function applyProviderModelInput(
	existing: Record<string, unknown>,
	input: ProviderModelInput,
): Record<string, unknown> {
	const entry: Record<string, unknown> = { ...existing, id: input.id.trim() };
	if (!entry.id) throw new Error("模型 ID 不能为空");

	if (input.advanced !== undefined) {
		applyModelAdvancedInput(entry, requireJsonObject(input.advanced, "模型高级字段"));
	}
	setOptionalString(entry, "name", input.name);
	setOptionalString(entry, "api", input.api);
	setOptionalString(entry, "baseUrl", input.baseUrl);

	if (input.reasoning !== undefined) entry.reasoning = input.reasoning;
	if (input.thinkingLevelMap !== undefined) {
		const map = input.thinkingLevelMap === null ? undefined : normalizeThinkingLevelMap(input.thinkingLevelMap);
		if (map) entry.thinkingLevelMap = map;
		else delete entry.thinkingLevelMap;
	}
	if (input.input !== undefined) {
		const values = [...new Set(input.input.filter((item) => item === "text" || item === "image"))];
		if (values.length > 0) entry.input = values;
		else delete entry.input;
	}
	if (input.inputLimits !== undefined) {
		setOptionalJsonObject(entry, "inputLimits", input.inputLimits, "模型 inputLimits");
	}
	if (input.cost !== undefined) {
		if (input.cost === null) {
			delete entry.cost;
		} else {
			const cost = normalizeModelCost(input.cost);
			if (!cost) throw new Error("模型 cost 必须包含 input / output / cacheRead / cacheWrite");
			entry.cost = cost;
		}
	}
	if (input.promptCache !== undefined) {
		if (input.promptCache === null) {
			delete entry.promptCache;
		} else {
			const promptCache = normalizePromptCache(input.promptCache);
			if (!promptCache) throw new Error("模型 promptCache 必须包含 short 或 long 数值");
			entry.promptCache = promptCache;
		}
	}
	if (input.contextWindow !== undefined) {
		if (input.contextWindow === null) delete entry.contextWindow;
		else if (!Number.isFinite(input.contextWindow) || input.contextWindow <= 0) {
			throw new Error("模型上下文窗口必须是正数");
		} else entry.contextWindow = input.contextWindow;
	}
	if (input.maxTokens !== undefined) {
		if (input.maxTokens === null) delete entry.maxTokens;
		else if (!Number.isFinite(input.maxTokens) || input.maxTokens <= 0) {
			throw new Error("模型最大 Token 必须是正数");
		} else entry.maxTokens = input.maxTokens;
	}
	if (input.samplingParams !== undefined) {
		setOptionalJsonObject(entry, "samplingParams", input.samplingParams, "模型 samplingParams");
	}
	if (input.headers !== undefined) {
		if (input.headers === null) delete entry.headers;
		else {
			const headers = stringRecordOrUndefined(input.headers);
			if (headers) entry.headers = headers;
			else delete entry.headers;
		}
	}
	if (input.compat !== undefined) {
		setOptionalJsonObject(entry, "compat", input.compat, "模型 compat");
	}
	if (input.extra !== undefined) {
		replaceUnknownFields(entry, PROVIDER_MODEL_KNOWN_FIELDS, requireJsonObject(input.extra, "模型高级字段"));
	}
	return entry;
}

function mergeProviderModels(existingValue: unknown, inputs: ProviderModelInput[]): Record<string, unknown>[] {
	const existing = Array.isArray(existingValue)
		? existingValue.filter((item): item is Record<string, unknown> => isRecord(item))
		: [];
	const used = new Set<number>();
	const seenIds = new Set<string>();
	return inputs.map((input) => {
		const id = input.id.trim();
		if (!id) throw new Error("模型 ID 不能为空");
		if (seenIds.has(id)) throw new Error(`模型 ID 重复：${id}`);
		seenIds.add(id);
		const locator = input.originalId?.trim() || id;
		const index = existing.findIndex(
			(item, current) => !used.has(current) && typeof item.id === "string" && item.id.trim() === locator,
		);
		if (index >= 0) used.add(index);
		return applyProviderModelInput(index >= 0 ? existing[index] : {}, input);
	});
}

function applyProviderInput(existing: Record<string, unknown>, input: ProviderInput): Record<string, unknown> {
	const entry: Record<string, unknown> = { ...existing };
	if (input.advanced !== undefined) {
		applyProviderAdvancedInput(entry, requireJsonObject(input.advanced, "Provider 高级字段"));
	}
	setOptionalString(entry, "name", input.name);
	setOptionalString(entry, "baseUrl", input.baseUrl);
	setOptionalString(entry, "api", input.api);

	if (input.headers !== undefined) {
		if (input.headers === null) delete entry.headers;
		else {
			const headers = stringRecordOrUndefined(input.headers);
			if (headers) entry.headers = headers;
			else delete entry.headers;
		}
	}
	if (input.authHeader !== undefined) {
		if (input.authHeader === null) delete entry.authHeader;
		else entry.authHeader = input.authHeader;
	}
	setOptionalJsonObject(entry, "compat", input.compat, "Provider compat");
	if (input.modelOverrides !== undefined) {
		const modelOverrides =
			input.modelOverrides === null ? undefined : normalizeProviderModelOverrides(input.modelOverrides);
		if (modelOverrides) entry.modelOverrides = modelOverrides;
		else delete entry.modelOverrides;
	}
	if (input.models !== undefined) {
		const models = mergeProviderModels(entry.models, input.models);
		if (models.length > 0) entry.models = models;
		else delete entry.models;
	}
	if (input.extra !== undefined) {
		replaceUnknownFields(entry, PROVIDER_KNOWN_FIELDS, requireJsonObject(input.extra, "Provider 高级字段"));
	}
	return entry;
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
	private readonly shellPathFile: string;
	private readonly shareSettingsPath: string;
	private readonly piSettingsPath: string;
	private readonly mcpConfigPath: string;
	private readonly modelsConfigPath: string;

	constructor(userDataPath: string) {
		const settingsDirectory = path.join(userDataPath, "settings");
		this.secretsPath = path.join(settingsDirectory, "secrets.json");
		this.roleSkillsPath = path.join(settingsDirectory, "role-skills.json");
		this.shellPathFile = path.join(settingsDirectory, "shell.json");
		this.shareSettingsPath = path.join(settingsDirectory, "share.json");
		this.piSettingsPath = path.join(resolvePiAgentDir(), "settings.json");
		this.mcpConfigPath = path.join(resolvePiAgentDir(), "mcp.json");
		this.modelsConfigPath = path.join(resolvePiAgentDir(), "models.json");
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

	/**
	 * 读写 Pi 原生 settings.json 的 defaultTools。
	 *
	 * 这里只控制内置工具在新 Agent 启动时是否默认激活；MCP 和扩展工具的曝光仍由
	 * mcp.json / extension 定义管理，不能在这里伪装成 direct/deferred/codemode/hidden。
	 */
	async getToolSettings(): Promise<ToolSettings> {
		let settings: Record<string, unknown> = {};
		try {
			settings = await this.readJsonRecord(this.piSettingsPath);
		} catch {
			// 配置损坏时设置页仍可打开；写入时再报错。
		}
		return normalizeToolSettings(settings);
	}

	async setToolSettings(input: ToolSettings): Promise<void> {
		const settings = await this.readJsonRecord(this.piSettingsPath);
		if (input.defaultTools === null) {
			delete settings.defaultTools;
		} else {
			if (!Array.isArray(input.defaultTools)) throw new Error("内置工具列表无效");
			const defaultTools = [...new Set(input.defaultTools)];
			if (!defaultTools.every(isPiBuiltinToolName)) throw new Error("内置工具列表包含无效工具名");
			settings.defaultTools = defaultTools;
		}
		await this.writeJsonRecord(this.piSettingsPath, settings);
	}

	/**
	 * `defaultTools` 只控制直接激活的内置工具，Codemode 仍可能调用已注册但未激活的工具。
	 * 启动 Agent 时还要把未勾选的内置工具传给 `--exclude-tools`，才能让 UI 的开关真正生效。
	 */
	async getBuiltinToolExclusions(): Promise<PiBuiltinToolName[]> {
		const settings = await this.getToolSettings();
		const enabled = new Set(settings.defaultTools ?? PI_DEFAULT_TOOL_NAMES);
		return PI_BUILTIN_TOOL_NAMES.filter((tool) => !enabled.has(tool));
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

	async getShellCommandPrefix(): Promise<string | null> {
		const settings = await this.readJsonRecord(this.piSettingsPath);
		const value = settings.shellCommandPrefix;
		return typeof value === "string" && value.trim() ? value : null;
	}

	async setShellCommandPrefix(value: string): Promise<SettingsStatus> {
		const normalized = value.replace(/\r\n?/gu, "\n");
		const shellCommandPrefix = normalized.trim() ? normalized : null;
		const settings = await this.readJsonRecord(this.piSettingsPath);
		if (shellCommandPrefix) settings.shellCommandPrefix = shellCommandPrefix;
		else delete settings.shellCommandPrefix;
		await this.writeJsonRecord(this.piSettingsPath, settings);
		return this.status();
	}

	/**
	 * 读写 Pi 原生 settings.json 的 enableInstallTelemetry。
	 *
	 * PI_TELEMETRY 优先于文件设置；这里同时返回规范化后的覆盖状态和实际生效值，
	 * 避免界面把 settings.json 的值误当成 Pi 的真实行为。
	 */
	async getInstallTelemetrySettings(): Promise<InstallTelemetrySettings> {
		let settings: Record<string, unknown> = {};
		try {
			settings = await this.readJsonRecord(this.piSettingsPath);
		} catch {
			// 配置损坏时设置页仍可打开；写入时会正常报错。
		}
		const enabled = Boolean(settings.enableInstallTelemetry ?? true);
		const environmentOverride = normalizeInstallTelemetryEnvironmentOverride(process.env.PI_TELEMETRY);
		return {
			enabled,
			effectiveEnabled: environmentOverride === null ? enabled : environmentOverride === "enabled",
			environmentOverride,
		};
	}

	async setInstallTelemetrySettings(enabled: boolean): Promise<SettingsStatus> {
		const settings = await this.readJsonRecord(this.piSettingsPath);
		settings.enableInstallTelemetry = enabled;
		await this.writeJsonRecord(this.piSettingsPath, settings);
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

	private async readSecrets(): Promise<StoredSecrets> {
		try {
			const parsed = JSON.parse(await readFile(this.secretsPath, "utf8")) as unknown;
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
			const record = parsed as Record<string, unknown>;
			const providerApiKeys = record.providerApiKeys;
			const mcpOAuthClientSecrets = record.mcpOAuthClientSecrets;
			return {
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
		if (!hasProviderKeys && !hasMcpOAuthSecrets) {
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

	async saveMcpServer(input: McpServerInput): Promise<McpServerSummary[]> {
		const name = input.name.trim();
		if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error("MCP 服务名只能包含字母、数字、点、下划线和连字符");
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
				const credentialCommand =
					typeof value.apiKey === "string" && value.apiKey.startsWith("!")
						? value.apiKey.slice(1).trim()
						: undefined;
				const extra = extraJsonObject(value, PROVIDER_KNOWN_FIELDS);
				const provider: ProviderSummary = {
					id,
					advanced: advancedJsonObject(value, PROVIDER_ADVANCED_FIELDS, extra),
					extra,
					credentialSource: credential.source,
					credentialLabel: credential.label,
					models: Array.isArray(value.models)
						? value.models
								.map(normalizeProviderModel)
								.filter((model): model is ProviderModelSummary => model !== null)
						: [],
				};
				if (credentialCommand) provider.credentialCommand = credentialCommand;
				const name = stringOrUndefined(value.name);
				if (name) provider.name = name;
				const baseUrl = stringOrUndefined(value.baseUrl);
				if (baseUrl) provider.baseUrl = baseUrl;
				const api = stringOrUndefined(value.api);
				if (api) provider.api = api;
				const headers = stringRecordOrUndefined(value.headers);
				if (headers) provider.headers = headers;
				if (typeof value.authHeader === "boolean") provider.authHeader = value.authHeader;
				const compat = cloneJsonObject(value.compat);
				if (compat) provider.compat = compat;
				const modelOverrides = normalizeProviderModelOverrides(value.modelOverrides);
				if (modelOverrides) provider.modelOverrides = modelOverrides;
				return provider;
			})
			.sort((left, right) => left.id.localeCompare(right.id));
	}

	async saveProvider(input: ProviderInput): Promise<ProviderSummary[]> {
		const id = input.id.trim();
		if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error("Provider ID 只能包含字母、数字、点、下划线和连字符");
		if ((input.models?.length ?? 0) > 200) throw new Error("单个 Provider 最多配置 200 个模型");
		const config = await this.readJsonRecord(this.modelsConfigPath);
		const providers = isRecord(config.providers) ? { ...config.providers } : {};
		const existing = isRecord(providers[id]) ? (providers[id] as Record<string, unknown>) : {};
		const entry = applyProviderInput(existing, input);
		const secrets = await this.readSecrets();
		const keys = { ...(secrets.providerApiKeys ?? {}) };
		if (input.apiKey !== undefined) {
			const apiKey = input.apiKey.trim();
			if (!apiKey) {
				delete keys[id];
				delete entry.apiKey;
			} else if ((input.apiKeySource ?? "secret") === "command") {
				const command = apiKey.replace(/^!/u, "").trim();
				if (!command) throw new Error("Provider Shell 命令不能为空");
				delete keys[id];
				entry.apiKey = `!${command}`;
			} else {
				keys[id] = this.encrypt(apiKey);
				entry.apiKey = `$${providerEnvName(id)}`;
			}
			secrets.providerApiKeys = keys;
			await this.writeSecrets(secrets);
		} else if (keys[id]) {
			entry.apiKey = `$${providerEnvName(id)}`;
		}
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
			encryptionAvailable: safeStorage.isEncryptionAvailable(),
			shellPath: await this.getShellPath(),
			shellCommandPrefix: await this.getShellCommandPrefix(),
			installTelemetry: await this.getInstallTelemetrySettings(),
			cacheWarming: await this.getCacheWarmingSettings(),
			contextCompaction: await this.getContextCompactionSettings(),
			codemode: await this.getCodemodeSettings(),
			tools: await this.getToolSettings(),
		};
	}
}
