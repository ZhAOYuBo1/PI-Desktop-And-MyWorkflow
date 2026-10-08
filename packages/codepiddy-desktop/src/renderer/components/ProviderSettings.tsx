import {
	type AuthProviderSummary,
	type CredentialSource,
	type JsonObject,
	PROVIDER_APIS,
	type ProviderInput,
	type ProviderModelInput,
	type ProviderModelSummary,
	type ProviderSummary,
} from "@codepiddy/shared";
import { KeyRound, LogIn, LogOut, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProviderIcon } from "./provider-icon.tsx";
import { SelectMenu } from "./select-menu.tsx";
import { SettingsCheckbox } from "./settings-checkbox.tsx";
import { showSettingsToast } from "./settings-toast-store.ts";
import { StateBlock } from "./state-block.tsx";

const demoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo");

const DEMO_PROVIDERS: ProviderSummary[] = [
	{
		id: "deepseek",
		name: "DeepSeek",
		baseUrl: "https://api.deepseek.com",
		api: "openai-completions",
		advanced: {},
		extra: {},
		credentialSource: "codepiddy_secret",
		credentialLabel: null,
		models: [
			{
				id: "deepseek-v4-pro",
				name: "DeepSeek V4 Pro",
				contextWindow: 1_000_000,
				maxTokens: 384_000,
				reasoning: true,
				input: ["text"],
				advanced: {},
				extra: {},
			},
		],
	},
];

const DEMO_AUTH_PROVIDERS: AuthProviderSummary[] = [
	{
		id: "deepseek",
		name: "DeepSeek",
		configured: true,
		authType: "api_key",
		source: "models_json_key",
		sourceLabel: null,
		methods: [{ type: "api_key", name: "DeepSeek API key" }],
	},
	{
		id: "openrouter",
		name: "OpenRouter",
		configured: true,
		authType: "oauth",
		source: "stored",
		sourceLabel: null,
		methods: [{ type: "oauth", name: "OpenRouter OAuth" }],
	},
	{
		id: "openai",
		name: "OpenAI",
		configured: false,
		authType: null,
		source: null,
		sourceLabel: null,
		methods: [{ type: "api_key", name: "OpenAI API key" }],
	},
	{
		id: "openai-codex",
		name: "OpenAI Codex",
		configured: false,
		authType: null,
		source: null,
		sourceLabel: null,
		methods: [{ type: "oauth", name: "OpenAI (ChatGPT Plus/Pro)", isSubscription: true }],
	},
];

const API_LABELS: Record<string, string> = {
	"openai-completions": "OpenAI Completions",
	"openai-responses": "OpenAI Responses",
	"anthropic-messages": "Anthropic Messages",
	"google-generative-ai": "Google Generative AI",
	"google-vertex": "Google Vertex",
	"bedrock-converse": "Bedrock Converse",
	"mistral-conversations": "Mistral Conversations",
	"pi-messages": "Pi Messages",
};

const CUSTOM_API_OPTION = "__custom_api__";

function credentialSourceLabel(source: CredentialSource | null, label: string | null): string {
	switch (source) {
		case "codepiddy_secret":
			return "CodePIddy 加密 Key";
		case "models_json_key":
			return "models.json Key";
		case "models_json_command":
			return "命令输出 Key";
		case "environment":
			return label ? `环境变量 ${label}` : "环境变量";
		case "stored":
			return "auth.json";
		case "runtime":
			return "运行时 Key";
		case "fallback":
			return "内置默认 Key";
		default:
			return "无凭据";
	}
}

function apiLabel(api: string | undefined): string {
	if (!api) return "继承 API";
	return API_LABELS[api] ?? api;
}

function advancedText(value: JsonObject | undefined): string {
	return JSON.stringify(value ?? {}, null, 2);
}

function parseAdvancedJson(value: string, label: string): JsonObject {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value.trim() || "{}") as unknown;
	} catch (error) {
		throw new Error(`${label} 不是有效 JSON：${error instanceof Error ? error.message : "解析失败"}`);
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(`${label} 必须是 JSON 对象`);
	}
	return parsed as JsonObject;
}

function optionalPositiveNumber(value: string, label: string): number | null {
	const normalized = value.trim();
	if (!normalized) return null;
	const number = Number(normalized);
	if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} 必须是正数`);
	return number;
}

interface ModelDraft {
	draftKey: string;
	originalId?: string;
	id: string;
	name: string;
	api: string;
	baseUrl: string;
	contextWindow: string;
	maxTokens: string;
	reasoning: boolean;
	input: ("text" | "image")[];
	advancedText: string;
}

interface Draft {
	id: string;
	name: string;
	baseUrl: string;
	api: string;
	apiKey: string;
	clearApiKey: boolean;
	advancedText: string;
	models: ModelDraft[];
}

function emptyModel(): ModelDraft {
	return {
		draftKey: crypto.randomUUID(),
		id: "",
		name: "",
		api: "",
		baseUrl: "",
		contextWindow: "",
		maxTokens: "",
		reasoning: false,
		input: [],
		advancedText: "{}",
	};
}

function emptyDraft(): Draft {
	return {
		id: "",
		name: "",
		baseUrl: "",
		api: "",
		apiKey: "",
		clearApiKey: false,
		advancedText: "{}",
		models: [emptyModel()],
	};
}

function modelDraftFrom(model: ProviderModelSummary): ModelDraft {
	return {
		draftKey: crypto.randomUUID(),
		originalId: model.id,
		id: model.id,
		name: model.name,
		api: model.api ?? "",
		baseUrl: model.baseUrl ?? "",
		contextWindow: model.contextWindow === undefined ? "" : String(model.contextWindow),
		maxTokens: model.maxTokens === undefined ? "" : String(model.maxTokens),
		reasoning: model.reasoning,
		input: [...model.input],
		advancedText: advancedText(model.advanced),
	};
}

function draftFrom(provider: ProviderSummary): Draft {
	return {
		id: provider.id,
		name: provider.name ?? "",
		baseUrl: provider.baseUrl ?? "",
		api: provider.api ?? "",
		apiKey: "",
		clearApiKey: false,
		advancedText: advancedText(provider.advanced),
		models: provider.models.length > 0 ? provider.models.map(modelDraftFrom) : [emptyModel()],
	};
}

function modelInputFromDraft(model: ModelDraft): ProviderModelInput {
	const id = model.id.trim();
	if (!id) throw new Error("模型 ID 不能为空");
	return {
		...(model.originalId ? { originalId: model.originalId } : {}),
		id,
		name: model.name.trim(),
		api: model.api.trim() || null,
		baseUrl: model.baseUrl.trim() || null,
		contextWindow: optionalPositiveNumber(model.contextWindow, "上下文窗口"),
		maxTokens: optionalPositiveNumber(model.maxTokens, "最大 Token"),
		reasoning: model.reasoning,
		input: model.input,
		advanced: parseAdvancedJson(model.advancedText, `模型 ${id} 高级配置`),
	};
}

function ProviderApiField({
	value,
	onChange,
	placeholder,
	label,
	allowEmpty = false,
}: {
	value: string;
	onChange(value: string): void;
	placeholder: string;
	label: string;
	allowEmpty?: boolean;
}) {
	const [customMode, setCustomMode] = useState(
		value.length > 0 && !(PROVIDER_APIS as readonly string[]).includes(value),
	);

	useEffect(() => {
		if (!value) return;
		setCustomMode(!(PROVIDER_APIS as readonly string[]).includes(value));
	}, [value]);

	if (customMode) {
		return (
			<div className="provider-api-custom">
				<input
					value={value}
					aria-label={label}
					placeholder={placeholder}
					onChange={(event) => onChange(event.target.value)}
				/>
				<button
					className="secondary-button"
					type="button"
					onClick={() => {
						setCustomMode(false);
						onChange("");
					}}
				>
					常用类型
				</button>
			</div>
		);
	}

	return (
		<SelectMenu
			label={label}
			value={value}
			searchable
			searchPlaceholder="搜索 API 类型"
			placeholder="继承 Provider"
			options={[
				...(allowEmpty
					? [
							{
								value: "",
								label: "继承 Provider",
								description: "不覆盖 Provider API",
							},
						]
					: []),
				...PROVIDER_APIS.map((api) => ({
					value: api,
					label: api,
					description: API_LABELS[api],
				})),
				{
					value: CUSTOM_API_OPTION,
					label: "自定义 API...",
					description: "手动输入 Pi 支持的 API id",
				},
			]}
			onChange={(next) => {
				if (next === CUSTOM_API_OPTION) {
					setCustomMode(true);
					onChange("");
					return;
				}
				onChange(next);
			}}
		/>
	);
}

export function ProviderSettings({
	onOpenAuth,
	onProvidersChanged,
	refreshToken = 0,
}: {
	onOpenAuth?: (mode: "login" | "logout", providerId?: string) => void;
	onProvidersChanged?: () => void;
	refreshToken?: number;
}) {
	const [providers, setProviders] = useState<ProviderSummary[] | null>(demoMode ? DEMO_PROVIDERS : null);
	const [authProviders, setAuthProviders] = useState<AuthProviderSummary[] | null>(
		demoMode ? DEMO_AUTH_PROVIDERS : null,
	);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [authLoading, setAuthLoading] = useState(false);
	const [showAllAuthProviders, setShowAllAuthProviders] = useState(false);

	const refresh = useCallback(async (): Promise<void> => {
		if (demoMode) return;
		if (!("codepiddy" in window)) {
			setError("Provider 配置只在桌面客户端中可用。");
			return;
		}
		setAuthLoading(true);
		try {
			const [providerResult, authResult] = await Promise.allSettled([
				window.codepiddy.listProviders(),
				window.codepiddy.listAuthProviders(),
			]);
			if (providerResult.status === "fulfilled") setProviders(providerResult.value);
			if (authResult.status === "fulfilled") setAuthProviders(authResult.value);
			const failure = [providerResult, authResult].find((result) => result.status === "rejected");
			if (failure?.status === "rejected") {
				setError(failure.reason instanceof Error ? failure.reason.message : "读取 Provider 配置失败");
			} else {
				setError(null);
			}
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "读取 Provider 配置失败");
		} finally {
			setAuthLoading(false);
		}
	}, []);

	useEffect(() => {
		if (refreshToken < 0) return;
		void refresh();
	}, [refresh, refreshToken]);

	const providerPageAuthProviders = useMemo(
		() => (authProviders ?? []).filter((provider) => provider.id !== "radius"),
		[authProviders],
	);
	const configuredAuthProviders = useMemo(
		() => providerPageAuthProviders.filter((provider) => provider.configured),
		[providerPageAuthProviders],
	);
	const customProviderIds = useMemo(() => new Set((providers ?? []).map((provider) => provider.id)), [providers]);
	const visibleAuthProviders = useMemo(() => {
		const sorted = [...providerPageAuthProviders].sort(
			(left, right) => Number(right.configured) - Number(left.configured) || left.name.localeCompare(right.name),
		);
		return showAllAuthProviders ? sorted : sorted.filter((provider) => provider.configured);
	}, [providerPageAuthProviders, showAllAuthProviders]);

	useEffect(() => {
		if (!notice) return;
		showSettingsToast(notice, "success");
		setNotice(null);
	}, [notice]);

	useEffect(() => {
		if (!error) return;
		showSettingsToast(error, "error");
		setError(null);
	}, [error]);

	function updateModel(index: number, patch: Partial<ModelDraft>): void {
		if (!draft) return;
		setDraft({
			...draft,
			models: draft.models.map((model, current) => (current === index ? { ...model, ...patch } : model)),
		});
	}

	function toggleModelInput(index: number, input: "text" | "image"): void {
		if (!draft) return;
		const model = draft.models[index];
		if (!model) return;
		const next = model.input.includes(input) ? model.input.filter((item) => item !== input) : [...model.input, input];
		updateModel(index, { input: next });
	}

	async function save(): Promise<void> {
		if (!draft) return;
		let input: ProviderInput;
		try {
			input = {
				id: draft.id.trim(),
				name: draft.name.trim() || null,
				baseUrl: draft.baseUrl.trim() || null,
				api: draft.api.trim() || null,
				advanced: parseAdvancedJson(draft.advancedText, "Provider 高级配置"),
				models: draft.models.filter((model) => model.id.trim()).map(modelInputFromDraft),
				...(draft.clearApiKey ? { apiKey: "" } : draft.apiKey.trim() ? { apiKey: draft.apiKey } : {}),
			};
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Provider 配置无效");
			return;
		}
		if (demoMode) {
			const existing = providers?.find((provider) => provider.id === input.id);
			const credentialSource: CredentialSource = draft.clearApiKey
				? "none"
				: draft.apiKey.trim()
					? "codepiddy_secret"
					: (existing?.credentialSource ?? "none");
			const models: ProviderModelSummary[] = (input.models ?? []).map((model) => ({
				id: model.id,
				name: model.name?.trim() || model.id,
				...(model.api ? { api: model.api } : {}),
				...(model.baseUrl ? { baseUrl: model.baseUrl } : {}),
				...(model.contextWindow === null || model.contextWindow === undefined
					? {}
					: { contextWindow: model.contextWindow }),
				...(model.maxTokens === null || model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens }),
				reasoning: model.reasoning === true,
				input: model.input ?? [],
				advanced: model.advanced ?? {},
				extra: {},
			}));
			setProviders((current) => [
				...(current ?? []).filter((provider) => provider.id !== input.id),
				{
					id: input.id,
					...(input.name ? { name: input.name } : {}),
					...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
					...(input.api ? { api: input.api } : {}),
					advanced: input.advanced ?? {},
					extra: {},
					credentialSource,
					credentialLabel: credentialSource === "environment" ? (existing?.credentialLabel ?? null) : null,
					models,
				},
			]);
			setDraft(null);
			setNotice("Provider 已保存。");
			onProvidersChanged?.();
			return;
		}
		if (!("codepiddy" in window)) return;
		setBusy(true);
		try {
			setProviders(await window.codepiddy.saveProvider(input));
			setDraft(null);
			setNotice("Provider 已保存。");
			setError(null);
			onProvidersChanged?.();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "保存 Provider 失败");
		} finally {
			setBusy(false);
		}
	}

	async function remove(id: string): Promise<void> {
		if (demoMode) {
			setProviders((current) => (current ?? []).filter((provider) => provider.id !== id));
			setNotice("Provider 已删除。");
			onProvidersChanged?.();
			return;
		}
		if (!("codepiddy" in window)) return;
		setBusy(true);
		try {
			setProviders(await window.codepiddy.deleteProvider(id));
			setNotice("Provider 已删除。");
			setError(null);
			onProvidersChanged?.();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "删除 Provider 失败");
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="settings-card provider-settings-card">
			<div className="settings-card-heading">
				<div>
					<h2>Provider 与模型</h2>
					<p>
						官方 Provider 用账户登录写入 <code>auth.json</code>；自定义接口和模型列表写入 <code>models.json</code>
						。API Key 由系统加密保存，不落明文。
					</p>
				</div>
				<div className="skill-settings-actions">
					<button
						className="secondary-button"
						type="button"
						onClick={() => {
							if ("codepiddy" in window) void window.codepiddy.openPiConfigFolder();
						}}
					>
						打开配置目录
					</button>
					<button className="primary-button" type="button" onClick={() => setDraft(emptyDraft())}>
						<Plus size={14} strokeWidth={2} /> 添加自定义 Provider
					</button>
				</div>
			</div>

			<div className="provider-auth-section">
				<div className="provider-auth-toolbar">
					<div className="provider-auth-title">
						<span className="provider-auth-title-icon">
							<ShieldCheck size={14} strokeWidth={2} />
						</span>
						<div>
							<strong>Provider 凭据状态</strong>
							<small>
								{configuredAuthProviders.length} / {providerPageAuthProviders.length} 已配置 · auth.json /
								models.json / 环境变量
							</small>
						</div>
					</div>
					<div className="provider-auth-actions">
						<button
							className="work-panel-icon-button"
							type="button"
							aria-label="刷新认证状态"
							title="刷新认证状态"
							disabled={authLoading}
							onClick={() => void refresh()}
						>
							<RefreshCw size={14} strokeWidth={2} />
						</button>
						<button className="secondary-button" type="button" onClick={() => onOpenAuth?.("login")}>
							<LogIn size={13} strokeWidth={2} /> 登录
						</button>
						<button className="secondary-button" type="button" onClick={() => onOpenAuth?.("logout")}>
							<LogOut size={13} strokeWidth={2} /> 退出
						</button>
					</div>
				</div>

				<div className="provider-auth-list">
					{visibleAuthProviders.map((provider) => (
						<div
							className={`provider-auth-row${provider.configured ? " is-configured" : " is-unconfigured"}`}
							key={provider.id}
						>
							<span className="provider-auth-icon">
								<ProviderIcon providerId={provider.id} size={16} />
								<span
									className={`provider-auth-state-dot${provider.configured ? " is-configured" : ""}`}
									title={provider.configured ? "已配置" : "未配置"}
								/>
							</span>
							<span className="mcp-server-copy">
								<strong>{provider.name}</strong>
								<small title={provider.id}>{provider.id}</small>
							</span>
							<span className="mcp-server-badges">
								{customProviderIds.has(provider.id) ? (
									<span className="mcp-server-badge is-project">models.json 覆盖</span>
								) : null}
								{provider.authType ? (
									<span className="mcp-server-badge">
										{provider.authType === "oauth" ? "OAuth" : "API Key"}
									</span>
								) : null}
								<span className={`mcp-server-badge${provider.configured ? "" : " is-muted"}`}>
									{provider.configured
										? credentialSourceLabel(provider.source, provider.sourceLabel)
										: "未配置"}
								</span>
							</span>
							<span className="mcp-server-actions">
								{provider.configured && provider.source === "stored" ? (
									<button
										type="button"
										className="work-panel-icon-button"
										aria-label={`退出 ${provider.name}`}
										title="退出登录"
										onClick={() => onOpenAuth?.("logout", provider.id)}
									>
										<LogOut size={14} strokeWidth={2} />
									</button>
								) : provider.configured ? null : (
									<button
										type="button"
										className="work-panel-icon-button"
										aria-label={`登录 ${provider.name}`}
										title="登录"
										onClick={() => onOpenAuth?.("login", provider.id)}
									>
										<LogIn size={14} strokeWidth={2} />
									</button>
								)}
							</span>
						</div>
					))}
					{visibleAuthProviders.length === 0 ? (
						<p className="provider-auth-empty">还没有通过 Pi 配置的 Provider。</p>
					) : null}
				</div>
				{providerPageAuthProviders.length > configuredAuthProviders.length ? (
					<button
						className="provider-auth-toggle"
						type="button"
						onClick={() => setShowAllAuthProviders((current) => !current)}
					>
						{showAllAuthProviders ? "只看已配置" : `显示全部 ${providerPageAuthProviders.length} 个 Provider`}
					</button>
				) : null}
			</div>

			<div className="provider-config-heading">
				<div>
					<strong>自定义模型接入</strong>
					<small>写入 models.json，用于自定义接口、Base URL、高级兼容字段和模型列表。</small>
				</div>
			</div>
			<div className="provider-config-list">
				{(providers ?? []).map((provider) => (
					<div className="provider-config-row" key={provider.id}>
						<span className="mcp-server-icon">
							<ProviderIcon providerId={provider.id} size={15} />
						</span>
						<span className="mcp-server-copy">
							<strong>{provider.name ?? provider.id}</strong>
							<small title={provider.baseUrl}>
								{provider.id} · {provider.baseUrl ?? "继承内置 baseUrl"} · {provider.models.length} 个模型
							</small>
						</span>
						<span className="mcp-server-badges">
							{authProviders?.some((auth) => auth.id === provider.id) ? (
								<span className="mcp-server-badge is-project">内置 Provider 覆盖</span>
							) : null}
							<span className="mcp-server-badge">{apiLabel(provider.api)}</span>
							<span
								className={`mcp-server-badge${provider.credentialSource === "none" ? " is-muted" : ""}`}
								title={credentialSourceLabel(provider.credentialSource, provider.credentialLabel)}
							>
								<KeyRound size={11} strokeWidth={2} />{" "}
								{credentialSourceLabel(provider.credentialSource, provider.credentialLabel)}
							</span>
						</span>
						<span className="mcp-server-actions">
							<button
								type="button"
								className="work-panel-icon-button"
								aria-label="编辑 Provider"
								title="编辑"
								onClick={() => setDraft(draftFrom(provider))}
							>
								<Pencil size={14} strokeWidth={2} />
							</button>
							<button
								type="button"
								className="work-panel-icon-button"
								aria-label="删除 Provider"
								title="删除"
								disabled={busy}
								onClick={() => void remove(provider.id)}
							>
								<Trash2 size={14} strokeWidth={2} />
							</button>
						</span>
					</div>
				))}
				{providers !== null && providers.length === 0 ? (
					<StateBlock compact tone="neutral" title="还没有自定义 Provider">
						内置 Provider 由 Pi 自身提供；需要自定义接口时再添加。
					</StateBlock>
				) : null}
			</div>

			{draft ? (
				<div className="mcp-editor provider-editor">
					<div className="mcp-editor-heading">
						<div>
							<strong>{draft.id ? `编辑 ${draft.id}` : "添加自定义 Provider"}</strong>
							<small>未在表单中展示的字段会保留；高级 JSON 用于 compat、headers、modelOverrides 等配置。</small>
						</div>
					</div>
					<div className="provider-editor-grid">
						<label className="settings-field">
							<span>Provider ID</span>
							<input
								value={draft.id}
								disabled={providers?.some((provider) => provider.id === draft.id)}
								placeholder="deepseek"
								onChange={(event) => setDraft({ ...draft, id: event.target.value })}
							/>
						</label>
						<label className="settings-field">
							<span>显示名称</span>
							<input
								value={draft.name}
								placeholder="DeepSeek"
								onChange={(event) => setDraft({ ...draft, name: event.target.value })}
							/>
						</label>
						<div className="settings-field">
							<span>API 类型</span>
							<ProviderApiField
								label="API 类型"
								value={draft.api}
								placeholder="如 pi-messages"
								onChange={(api) => setDraft({ ...draft, api })}
							/>
						</div>
						<label className="settings-field">
							<span>Base URL</span>
							<input
								value={draft.baseUrl}
								placeholder="https://api.deepseek.com"
								onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
							/>
						</label>
						<label className="settings-field">
							<span>API Key</span>
							<input
								type="password"
								value={draft.apiKey}
								disabled={draft.clearApiKey}
								placeholder="留空保持不变"
								onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
							/>
						</label>
					</div>
					{providers?.some((provider) => provider.id === draft.id && provider.credentialSource !== "none") ? (
						<SettingsCheckbox
							checked={draft.clearApiKey}
							onChange={(clearApiKey) => setDraft({ ...draft, clearApiKey })}
						>
							清除已保存的 API Key
						</SettingsCheckbox>
					) : null}

					<details className="provider-advanced-section">
						<summary>Provider 高级配置</summary>
						<p>
							支持 <code>headers</code>、<code>authHeader</code>、<code>compat</code>、
							<code>modelOverrides</code> 和未知字段。留空对象表示不设置。
						</p>
						<textarea
							className="provider-json-field"
							value={draft.advancedText}
							spellCheck={false}
							onChange={(event) => setDraft({ ...draft, advancedText: event.target.value })}
						/>
					</details>

					<div className="provider-model-list">
						<div className="provider-model-heading">
							<div>
								<strong>模型</strong>
								<small>模型字段按 ID 补丁写回；改 ID 时原未知字段仍会保留。</small>
							</div>
							<button
								className="secondary-button"
								type="button"
								onClick={() => setDraft({ ...draft, models: [...draft.models, emptyModel()] })}
							>
								<Plus size={13} strokeWidth={2} /> 添加模型
							</button>
						</div>
						{draft.models.map((model, index) => (
							<div className="provider-model-card" key={model.draftKey}>
								<div className="provider-model-grid">
									<label className="settings-field">
										<span>模型 ID</span>
										<input
											value={model.id}
											placeholder="model-id"
											onChange={(event) => updateModel(index, { id: event.target.value })}
										/>
									</label>
									<label className="settings-field">
										<span>显示名</span>
										<input
											value={model.name}
											placeholder="Model name"
											onChange={(event) => updateModel(index, { name: event.target.value })}
										/>
									</label>
									<div className="settings-field">
										<span>模型 API</span>
										<ProviderApiField
											label="模型 API"
											value={model.api}
											placeholder="继承 Provider"
											allowEmpty
											onChange={(api) => updateModel(index, { api })}
										/>
									</div>
									<label className="settings-field">
										<span>模型 Base URL</span>
										<input
											value={model.baseUrl}
											placeholder="继承 Provider"
											onChange={(event) => updateModel(index, { baseUrl: event.target.value })}
										/>
									</label>
									<label className="settings-field">
										<span>上下文窗口</span>
										<input
											type="number"
											value={model.contextWindow}
											placeholder="沿用 Pi 默认"
											onChange={(event) => updateModel(index, { contextWindow: event.target.value })}
										/>
									</label>
									<label className="settings-field">
										<span>最大输出 Token</span>
										<input
											type="number"
											value={model.maxTokens}
											placeholder="沿用 Pi 默认"
											onChange={(event) => updateModel(index, { maxTokens: event.target.value })}
										/>
									</label>
								</div>
								<div className="provider-model-controls">
									<SettingsCheckbox
										checked={model.reasoning}
										onChange={(reasoning) => updateModel(index, { reasoning })}
									>
										推理模型
									</SettingsCheckbox>
									<SettingsCheckbox
										checked={model.input.includes("text")}
										onChange={() => toggleModelInput(index, "text")}
									>
										文本输入
									</SettingsCheckbox>
									<SettingsCheckbox
										checked={model.input.includes("image")}
										onChange={() => toggleModelInput(index, "image")}
									>
										图片输入
									</SettingsCheckbox>
									<button
										type="button"
										className="work-panel-icon-button provider-model-remove"
										aria-label="删除模型"
										title="删除模型"
										onClick={() =>
											setDraft({ ...draft, models: draft.models.filter((_, current) => current !== index) })
										}
									>
										<Trash2 size={14} strokeWidth={2} />
									</button>
								</div>
								<details className="provider-model-advanced">
									<summary>模型高级配置</summary>
									<p>
										支持 <code>thinkingLevelMap</code>、<code>inputLimits</code>、<code>cost</code>、
										<code>promptCache</code>、<code>samplingParams</code>、<code>headers</code>、
										<code>compat</code> 和未知字段。
									</p>
									<textarea
										className="provider-json-field"
										value={model.advancedText}
										spellCheck={false}
										onChange={(event) => updateModel(index, { advancedText: event.target.value })}
									/>
								</details>
							</div>
						))}
					</div>

					<div className="settings-actions">
						<button className="primary-button" type="button" disabled={busy} onClick={() => void save()}>
							保存
						</button>
						<button className="secondary-button" type="button" onClick={() => setDraft(null)}>
							取消
						</button>
					</div>
				</div>
			) : null}
		</section>
	);
}
