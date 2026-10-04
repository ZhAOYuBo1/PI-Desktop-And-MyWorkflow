import type { ProviderApi, ProviderInput, ProviderModelSummary, ProviderSummary } from "@codepiddy/shared";
import { KeyRound, Pencil, Plus, Server, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SelectMenu } from "./select-menu.tsx";
import { showSettingsToast } from "./settings-toast-store.ts";

const demoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo");

const DEMO_PROVIDERS: ProviderSummary[] = [
	{
		id: "deepseek",
		baseUrl: "https://api.deepseek.com",
		api: "openai-completions",
		apiKeyConfigured: true,
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

const API_LABELS: Record<ProviderApi, string> = {
	"openai-completions": "OpenAI Completions",
	"openai-responses": "OpenAI Responses",
	"anthropic-messages": "Anthropic Messages",
	"google-generative-ai": "Google Generative AI",
};

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

export function ProviderSettings({ onOpenAuth }: { onOpenAuth?: (mode: "login" | "logout") => void }) {
	const [providers, setProviders] = useState<ProviderSummary[] | null>(demoMode ? DEMO_PROVIDERS : null);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const refresh = useCallback(async (): Promise<void> => {
		if (demoMode) return;
		if (!("codepiddy" in window)) {
			setError("Provider 配置只在桌面客户端中可用。");
			return;
		}
		try {
			setProviders(await window.codepiddy.listProviders());
			setError(null);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "读取 Provider 配置失败");
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

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
			setProviders((current) => [
				...(current ?? []).filter((provider) => provider.id !== input.id),
				{
					id: input.id,
					baseUrl: input.baseUrl,
					api: input.api,
					apiKeyConfigured: !draft.clearApiKey,
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
						读写 Pi 原生 <code>~/.pi/agent/models.json</code>。API Key 用系统加密保存在本机，写进 models.json 的是{" "}
						<code>$ENV</code> 引用，不落明文。修改后新启动或重置的 Agent 生效。
					</p>
				</div>
				<div className="skill-settings-actions">
					<button className="secondary-button" type="button" onClick={() => onOpenAuth?.("login")}>
						登录 Provider
					</button>
					<button className="secondary-button" type="button" onClick={() => onOpenAuth?.("logout")}>
						退出登录
					</button>
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
						<Plus size={14} strokeWidth={2} /> 添加 Provider
					</button>
				</div>
			</div>

			<div className="provider-config-list">
				{(providers ?? []).map((provider) => (
					<div className="provider-config-row" key={provider.id}>
						<span className="mcp-server-icon">
							<Server size={14} strokeWidth={2} />
						</span>
						<span className="mcp-server-copy">
							<strong>{provider.id}</strong>
							<small title={provider.baseUrl}>
								{provider.baseUrl} · {provider.models.length} 个模型
							</small>
						</span>
						<span className="mcp-server-badge">{API_LABELS[provider.api]}</span>
						<span className={`mcp-server-badge${provider.apiKeyConfigured ? "" : " is-muted"}`}>
							<KeyRound size={11} strokeWidth={2} /> {provider.apiKeyConfigured ? "已配置" : "无 Key"}
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
					{providers?.some((provider) => provider.id === draft.id && provider.apiKeyConfigured) ? (
						<label className="settings-checkbox">
							<input
								type="checkbox"
								checked={draft.clearApiKey}
								onChange={(event) => setDraft({ ...draft, clearApiKey: event.target.checked })}
							/>
							<span>清除已保存的 API Key</span>
						</label>
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
								<label className="settings-checkbox">
									<input
										type="checkbox"
										checked={model.reasoning}
										onChange={(event) => updateModel(index, { reasoning: event.target.checked })}
									/>
									<span>推理</span>
								</label>
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
