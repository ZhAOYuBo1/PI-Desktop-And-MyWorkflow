import type {
	AuthProviderSummary,
	CredentialSource,
	ProviderApi,
	ProviderInput,
	ProviderModelSummary,
	ProviderSummary,
} from "@codepiddy/shared";
import { KeyRound, LogIn, LogOut, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProviderIcon } from "./provider-icon.tsx";
import { SelectMenu } from "./select-menu.tsx";
import { SettingsCheckbox } from "./settings-checkbox.tsx";
import { showSettingsToast } from "./settings-toast-store.ts";

const demoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo");

const DEMO_PROVIDERS: ProviderSummary[] = [
	{
		id: "deepseek",
		baseUrl: "https://api.deepseek.com",
		api: "openai-completions",
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

const API_LABELS: Record<ProviderApi, string> = {
	"openai-completions": "OpenAI Completions",
	"openai-responses": "OpenAI Responses",
	"anthropic-messages": "Anthropic Messages",
	"google-generative-ai": "Google Generative AI",
};

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

interface Draft {
	id: string;
	baseUrl: string;
	api: ProviderApi;
	apiKey: string;
	clearApiKey: boolean;
	models: ProviderModelSummary[];
}

function emptyModel(): ProviderModelSummary {
	return { id: "", name: "", contextWindow: 128_000, maxTokens: 8192, reasoning: false, input: ["text"] };
}

function emptyDraft(): Draft {
	return {
		id: "",
		baseUrl: "",
		api: "openai-completions",
		apiKey: "",
		clearApiKey: false,
		models: [emptyModel()],
	};
}

function draftFrom(provider: ProviderSummary): Draft {
	return {
		id: provider.id,
		baseUrl: provider.baseUrl,
		api: provider.api,
		apiKey: "",
		clearApiKey: false,
		models: provider.models.length > 0 ? provider.models.map((model) => ({ ...model })) : [emptyModel()],
	};
}

export function ProviderSettings({
	onOpenAuth,
	refreshToken = 0,
}: {
	onOpenAuth?: (mode: "login" | "logout", providerId?: string) => void;
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

	function updateModel(index: number, patch: Partial<ProviderModelSummary>): void {
		if (!draft) return;
		setDraft({
			...draft,
			models: draft.models.map((model, current) => (current === index ? { ...model, ...patch } : model)),
		});
	}

	async function save(): Promise<void> {
		if (!draft) return;
		const input: ProviderInput = {
			id: draft.id,
			baseUrl: draft.baseUrl,
			api: draft.api,
			...(draft.clearApiKey ? { apiKey: "" } : draft.apiKey.trim() ? { apiKey: draft.apiKey } : {}),
			models: draft.models,
		};
		if (demoMode) {
			const existing = providers?.find((provider) => provider.id === input.id);
			const credentialSource: CredentialSource = draft.clearApiKey
				? "none"
				: draft.apiKey.trim()
					? "codepiddy_secret"
					: (existing?.credentialSource ?? "none");
			setProviders((current) => [
				...(current ?? []).filter((provider) => provider.id !== input.id),
				{
					id: input.id,
					baseUrl: input.baseUrl,
					api: input.api,
					credentialSource,
					credentialLabel: credentialSource === "environment" ? (existing?.credentialLabel ?? null) : null,
					models: input.models,
				},
			]);
			setDraft(null);
			setNotice("Provider 已保存。");
			return;
		}
		if (!("codepiddy" in window)) return;
		setBusy(true);
		try {
			setProviders(await window.codepiddy.saveProvider(input));
			setDraft(null);
			setNotice("Provider 已保存。");
			setError(null);
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
			return;
		}
		if (!("codepiddy" in window)) return;
		setBusy(true);
		try {
			setProviders(await window.codepiddy.deleteProvider(id));
			setNotice("Provider 已删除。");
			setError(null);
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
						。API Key 由系统加密保存，不落明文。Radius 登录已移到“设置 &gt; 分享”。
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
					<small>写入 models.json，用于自定义接口、Base URL 和模型列表。</small>
				</div>
			</div>
			<div className="provider-config-list">
				{(providers ?? []).map((provider) => (
					<div className="provider-config-row" key={provider.id}>
						<span className="mcp-server-icon">
							<ProviderIcon providerId={provider.id} size={15} />
						</span>
						<span className="mcp-server-copy">
							<strong>{provider.id}</strong>
							<small title={provider.baseUrl}>
								{provider.baseUrl} · {provider.models.length} 个模型
							</small>
						</span>
						<span className="mcp-server-badges">
							{authProviders?.some((auth) => auth.id === provider.id) ? (
								<span className="mcp-server-badge is-project">内置 Provider 覆盖</span>
							) : null}
							<span className="mcp-server-badge">{API_LABELS[provider.api]}</span>
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
					<p className="work-change-note">还没有自定义 Provider。内置 Provider 由 Pi 自身提供。</p>
				) : null}
			</div>

			{draft ? (
				<div className="mcp-editor provider-editor">
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
						<div className="settings-field">
							<span>API 类型</span>
							<SelectMenu
								label="API 类型"
								value={draft.api}
								options={Object.entries(API_LABELS).map(([value, label]) => ({ value, label }))}
								onChange={(value) => setDraft({ ...draft, api: value as ProviderApi })}
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

					<div className="provider-model-list">
						<div className="provider-model-heading">
							<strong>模型</strong>
							<button
								className="secondary-button"
								type="button"
								onClick={() => setDraft({ ...draft, models: [...draft.models, emptyModel()] })}
							>
								<Plus size={13} strokeWidth={2} /> 添加模型
							</button>
						</div>
						{draft.models.map((model, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: 模型 ID 允许为空，编辑中的行身份只能靠顺序
							<div className="provider-model-row" key={`model-${index}`}>
								<input
									value={model.id}
									placeholder="模型 ID"
									onChange={(event) => updateModel(index, { id: event.target.value })}
								/>
								<input
									value={model.name}
									placeholder="显示名"
									onChange={(event) => updateModel(index, { name: event.target.value })}
								/>
								<input
									type="number"
									value={model.contextWindow}
									title="上下文窗口"
									onChange={(event) => updateModel(index, { contextWindow: Number(event.target.value) })}
								/>
								<input
									type="number"
									value={model.maxTokens}
									title="最大输出 Token"
									onChange={(event) => updateModel(index, { maxTokens: Number(event.target.value) })}
								/>
								<SettingsCheckbox
									checked={model.reasoning}
									onChange={(reasoning) => updateModel(index, { reasoning })}
								>
									推理
								</SettingsCheckbox>
								<button
									type="button"
									className="work-panel-icon-button"
									aria-label="删除模型"
									title="删除模型"
									disabled={draft.models.length <= 1}
									onClick={() =>
										setDraft({ ...draft, models: draft.models.filter((_, current) => current !== index) })
									}
								>
									<Trash2 size={14} strokeWidth={2} />
								</button>
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
