import type {
	AgentInstanceLocator,
	HuggingFaceModelDetails,
	HuggingFaceModelSummary,
	LlamaCppConfigStatus,
	LlamaCppModelSummary,
	LlamaCppRuntimeStatus,
} from "@codepiddy/shared";
import { Download, HardDrive, Loader2, Play, RefreshCw, Search, Server, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { showSettingsToast } from "./settings-toast-store.ts";

const demoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo");

const DEMO_CONFIG: LlamaCppConfigStatus = {
	configured: true,
	serverUrl: "http://127.0.0.1:8080",
	apiKeyConfigured: false,
	source: "stored",
};

const DEMO_MODELS: LlamaCppModelSummary[] = [
	{
		id: "Qwen3-Coder-30B-A3B-Instruct-Q4_K_M",
		status: "loaded",
		failed: false,
		exitCode: null,
		contextWindow: 131_072,
		size: 18_600_000_000,
		source: "preset",
		input: ["text"],
		progress: null,
	},
	{
		id: "gemma-3-12b-it-Q4_K_M",
		status: "unloaded",
		failed: false,
		exitCode: null,
		contextWindow: 32_768,
		size: 7_100_000_000,
		source: "preset",
		input: ["text", "image"],
		progress: null,
	},
	{
		id: "deepseek-r1-distill-7b-Q5_K_M",
		status: "downloading",
		failed: false,
		exitCode: null,
		contextWindow: 65_536,
		size: 5_400_000_000,
		source: "huggingface",
		input: ["text"],
		progress: {
			"model.gguf": { done: 3_800_000_000, total: 5_400_000_000 },
		},
	},
];

const DEMO_RUNTIME: LlamaCppRuntimeStatus = {
	...DEMO_CONFIG,
	connected: true,
	routerAutoload: true,
	models: DEMO_MODELS,
	error: null,
};

const DEMO_SEARCH: HuggingFaceModelSummary[] = [
	{ id: "Qwen/Qwen3-Coder-30B-A3B-Instruct-GGUF", downloads: 428_000 },
	{ id: "unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF", downloads: 216_000 },
	{ id: "bartowski/Qwen3-Coder-30B-A3B-Instruct-GGUF", downloads: 94_000 },
];

const DEMO_DETAILS: HuggingFaceModelDetails = {
	id: "Qwen/Qwen3-Coder-30B-A3B-Instruct-GGUF",
	gated: false,
	quantizations: [
		{ name: "Q4_K_M", size: 18_600_000_000 },
		{ name: "Q5_K_M", size: 21_300_000_000 },
		{ name: "Q8_0", size: 32_500_000_000 },
	],
};

function formatBytes(bytes: number | null): string {
	if (bytes === null) return "未知";
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KiB", "MiB", "GiB", "TiB"];
	let value = bytes / 1024;
	let unit = units[0]!;
	for (let index = 1; index < units.length && value >= 1024; index += 1) {
		value /= 1024;
		unit = units[index]!;
	}
	return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}

function statusLabel(model: LlamaCppModelSummary): string {
	if (model.failed) return "失败";
	if (model.status === "loaded") return "已加载";
	if (model.status === "sleeping") return "休眠";
	if (model.status === "loading") return "加载中";
	if (model.status === "downloading") return "下载中";
	return "未加载";
}

function statusTone(model: LlamaCppModelSummary): string {
	if (model.failed) return "is-error";
	if (model.status === "loaded" || model.status === "sleeping") return "is-success";
	if (model.status === "loading" || model.status === "downloading") return "is-active";
	return "";
}

function modelProgress(model: LlamaCppModelSummary): number | null {
	if (!model.progress) return null;
	let done = 0;
	let total = 0;
	for (const entry of Object.values(model.progress)) {
		done += entry.done;
		total += entry.total;
	}
	return total > 0 ? done / total : null;
}

export function LlamaCppSettings({ activeAgent }: { activeAgent: AgentInstanceLocator | null }) {
	const [config, setConfig] = useState<LlamaCppConfigStatus | null>(demoMode ? DEMO_CONFIG : null);
	const [runtime, setRuntime] = useState<LlamaCppRuntimeStatus | null>(demoMode ? DEMO_RUNTIME : null);
	const [serverUrl, setServerUrl] = useState(demoMode ? (DEMO_CONFIG.serverUrl ?? "") : "");
	const [apiKey, setApiKey] = useState("");
	const [clearApiKey, setClearApiKey] = useState(false);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [activeAction, setActiveAction] = useState<string | null>(null);
	const [progress, setProgress] = useState<{ message: string; ratio?: number; detail?: string } | null>(null);
	const [downloadOpen, setDownloadOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [searching, setSearching] = useState(false);
	const [searchResults, setSearchResults] = useState<HuggingFaceModelSummary[]>([]);
	const [details, setDetails] = useState<HuggingFaceModelDetails | null>(null);
	const [quantization, setQuantization] = useState("");
	const [detailsLoading, setDetailsLoading] = useState(false);

	const refresh = useCallback(async (): Promise<void> => {
		if (demoMode) {
			setConfig(DEMO_CONFIG);
			setRuntime(DEMO_RUNTIME);
			setServerUrl(DEMO_CONFIG.serverUrl ?? "");
			return;
		}
		if (!("codepiddy" in window)) return;
		setLoading(true);
		try {
			const [nextConfig, nextRuntime] = await Promise.all([
				window.codepiddy.getLlamaCppConfig(),
				window.codepiddy.getLlamaCppStatus(),
			]);
			setConfig(nextConfig);
			setRuntime(nextRuntime);
			setServerUrl(nextConfig.serverUrl ?? "");
		} catch (error) {
			showSettingsToast(error instanceof Error ? error.message : "读取 llama.cpp 状态失败", "error");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useEffect(() => {
		if (demoMode || !("codepiddy" in window)) return;
		return window.codepiddy.onLlamaCppEvent((event) => {
			if (event.type === "progress") {
				setProgress({
					message: event.message,
					...(event.ratio === undefined ? {} : { ratio: event.ratio }),
					...(event.detail === undefined ? {} : { detail: event.detail }),
				});
			} else if (event.type === "complete") {
				setRuntime(event.status);
				setProgress(null);
			} else {
				showSettingsToast(event.error, "error");
				setProgress(null);
			}
		});
	}, []);

	async function save(): Promise<void> {
		if (!serverUrl.trim()) {
			showSettingsToast("请输入 llama.cpp server 地址", "error");
			return;
		}
		if (demoMode) {
			const next = { ...DEMO_CONFIG, serverUrl: serverUrl.trim(), apiKeyConfigured: Boolean(apiKey) };
			setConfig(next);
			setRuntime({ ...DEMO_RUNTIME, ...next });
			setApiKey("");
			setClearApiKey(false);
			showSettingsToast("llama.cpp 配置已保存。", "success");
			return;
		}
		if (!("codepiddy" in window)) return;
		setSaving(true);
		try {
			const next = await window.codepiddy.saveLlamaCppConfig({
				serverUrl,
				...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
				...(clearApiKey ? { clearApiKey: true } : {}),
			});
			setConfig(next);
			setApiKey("");
			setClearApiKey(false);
			setRuntime(await window.codepiddy.getLlamaCppStatus());
			showSettingsToast("llama.cpp 配置已保存。", "success");
		} catch (error) {
			showSettingsToast(error instanceof Error ? error.message : "保存 llama.cpp 配置失败", "error");
		} finally {
			setSaving(false);
		}
	}

	async function clear(): Promise<void> {
		if (demoMode) {
			setConfig({ configured: false, serverUrl: null, apiKeyConfigured: false, source: "none" });
			setRuntime({ ...DEMO_RUNTIME, configured: false, connected: false, models: [], error: null });
			setServerUrl("");
			setApiKey("");
			setClearApiKey(false);
			showSettingsToast("llama.cpp 配置已清除。", "success");
			return;
		}
		if (!("codepiddy" in window)) return;
		setSaving(true);
		try {
			const next = await window.codepiddy.clearLlamaCppConfig();
			setConfig(next);
			setRuntime(await window.codepiddy.getLlamaCppStatus());
			setServerUrl(next.serverUrl ?? "");
			setApiKey("");
			setClearApiKey(false);
			showSettingsToast("llama.cpp 配置已清除。", "success");
		} catch (error) {
			showSettingsToast(error instanceof Error ? error.message : "清除 llama.cpp 配置失败", "error");
		} finally {
			setSaving(false);
		}
	}

	async function runAction(action: "refresh" | "load" | "unload" | "download", modelId?: string): Promise<void> {
		const key = `${action}:${modelId ?? ""}`;
		if (activeAction) return;
		if (demoMode) {
			setActiveAction(key);
			setProgress({ message: action === "load" ? "正在加载模型" : "正在处理", ratio: 0.45 });
			await new Promise((resolve) => setTimeout(resolve, 350));
			setActiveAction(null);
			setProgress(null);
			showSettingsToast("llama.cpp 操作已完成。", "success");
			return;
		}
		if (!("codepiddy" in window)) return;
		setActiveAction(key);
		setProgress(null);
		try {
			const next = await window.codepiddy.runLlamaCppAction({
				action,
				...(modelId ? { modelId } : {}),
			});
			setRuntime(next);
			showSettingsToast("llama.cpp 操作已完成。", "success");
		} catch (error) {
			showSettingsToast(error instanceof Error ? error.message : "llama.cpp 操作失败", "error");
		} finally {
			setActiveAction(null);
			setProgress(null);
		}
	}

	async function search(): Promise<void> {
		if (searchQuery.trim().length < 2) {
			showSettingsToast("请输入至少 2 个字符", "error");
			return;
		}
		if (demoMode) {
			setSearchResults(DEMO_SEARCH);
			setDetails(null);
			return;
		}
		if (!("codepiddy" in window)) return;
		setSearching(true);
		try {
			setSearchResults(await window.codepiddy.searchLlamaCppModels(searchQuery));
			setDetails(null);
		} catch (error) {
			showSettingsToast(error instanceof Error ? error.message : "搜索 Hugging Face 失败", "error");
		} finally {
			setSearching(false);
		}
	}

	async function selectDownloadModel(modelId: string): Promise<void> {
		if (demoMode) {
			setDetails({ ...DEMO_DETAILS, id: modelId });
			setQuantization(DEMO_DETAILS.quantizations[0]?.name ?? "");
			return;
		}
		if (!("codepiddy" in window)) return;
		setDetailsLoading(true);
		try {
			const next = await window.codepiddy.getLlamaCppModelDetails(modelId);
			setDetails(next);
			setQuantization(next.quantizations[0]?.name ?? "");
		} catch (error) {
			showSettingsToast(error instanceof Error ? error.message : "读取模型详情失败", "error");
		} finally {
			setDetailsLoading(false);
		}
	}

	const configured = config?.configured === true;
	const connectionLabel = runtime?.connected ? "已连接" : configured ? "连接失败" : "未配置";
	const downloadId = details ? `${details.id}${quantization ? `:${quantization}` : ""}` : "";

	return (
		<section className="settings-card llama-cpp-card">
			<div className="settings-card-heading">
				<div>
					<h2>llama.cpp</h2>
					<p>连接本地 llama.cpp router，管理 GGUF 模型并让 Pi 通过 OpenAI 兼容接口使用。</p>
				</div>
				<div className="skill-settings-actions">
					<span className={`settings-status${runtime?.connected ? " is-success" : ""}`}>{connectionLabel}</span>
					<button
						className="work-panel-icon-button"
						type="button"
						aria-label="刷新 llama.cpp 状态"
						title="刷新状态"
						disabled={loading || activeAction !== null}
						onClick={() => void runAction("refresh")}
					>
						<RefreshCw size={14} strokeWidth={2} />
					</button>
				</div>
			</div>

			<div className="llama-connection-card">
				<div className="llama-connection-heading">
					<span className="llama-connection-icon">
						<Server size={15} strokeWidth={2} />
					</span>
					<div>
						<strong>Router 连接</strong>
						<small>配置写入 Pi 原生 auth.json 的 llama.cpp 凭据，不修改 Pi core。</small>
					</div>
				</div>
				<div className="llama-connection-grid">
					<label className="settings-field">
						<span>Server URL</span>
						<input
							value={serverUrl}
							placeholder="http://127.0.0.1:8080"
							onChange={(event) => setServerUrl(event.target.value)}
						/>
					</label>
					<label className="settings-field">
						<span>API Key</span>
						<input
							type="password"
							value={apiKey}
							disabled={clearApiKey}
							placeholder={config?.apiKeyConfigured ? "已配置，留空保持不变" : "可选"}
							onChange={(event) => setApiKey(event.target.value)}
						/>
					</label>
				</div>
				<div className="llama-connection-actions">
					<label className="settings-checkbox">
						<input
							type="checkbox"
							checked={clearApiKey}
							disabled={!config?.apiKeyConfigured}
							onChange={(event) => setClearApiKey(event.target.checked)}
						/>
						<span>清除已保存的 API Key</span>
					</label>
					<div className="settings-actions">
						<button className="primary-button" type="button" disabled={saving} onClick={() => void save()}>
							{saving ? "保存中…" : "保存并测试"}
						</button>
						<button
							className="secondary-button"
							type="button"
							disabled={saving || (!config?.configured && !serverUrl)}
							onClick={() => void clear()}
						>
							清除配置
						</button>
					</div>
				</div>
			</div>

			{runtime?.error ? <div className="llama-error-note">{runtime.error}</div> : null}

			<div className="llama-model-heading">
				<div>
					<strong>Router 模型</strong>
					<small>
						{runtime?.models.length ?? 0} 个模型 · {runtime?.routerAutoload ? "支持自动加载" : "自动加载关闭"}
					</small>
				</div>
				<div className="settings-actions">
					<button
						className="secondary-button"
						type="button"
						disabled={!configured || activeAction !== null}
						onClick={() => setDownloadOpen((current) => !current)}
					>
						<Download size={13} strokeWidth={2} /> 下载模型
					</button>
					<button
						className="secondary-button"
						type="button"
						disabled={!configured || activeAction !== null}
						onClick={() => void runAction("refresh")}
					>
						<RefreshCw size={13} strokeWidth={2} /> 刷新
					</button>
				</div>
			</div>

			{downloadOpen ? (
				<div className="llama-download-panel">
					<div className="llama-download-search">
						<Search size={14} strokeWidth={2} />
						<input
							value={searchQuery}
							placeholder="搜索 Hugging Face GGUF 模型，例如 Qwen3-Coder"
							onChange={(event) => setSearchQuery(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") void search();
							}}
						/>
						<button className="secondary-button" type="button" disabled={searching} onClick={() => void search()}>
							{searching ? "搜索中…" : "搜索"}
						</button>
					</div>
					{searchResults.length > 0 ? (
						<div className="llama-search-results">
							{searchResults.map((model) => (
								<button
									type="button"
									key={model.id}
									className={details?.id === model.id ? "active" : ""}
									onClick={() => void selectDownloadModel(model.id)}
								>
									<span>
										<strong>{model.id}</strong>
										<small>{model.downloads.toLocaleString()} downloads</small>
									</span>
									{detailsLoading && details?.id === model.id ? <Loader2 size={13} /> : null}
								</button>
							))}
						</div>
					) : null}
					{details ? (
						<div className="llama-quantization">
							<div>
								<strong>{details.id}</strong>
								<small>
									{details.gated ? "需要 Hugging Face 授权" : "公开模型"} · {details.quantizations.length}{" "}
									个量化版本
								</small>
							</div>
							{details.quantizations.length > 0 ? (
								<div className="llama-quantization-list">
									{details.quantizations.map((entry) => (
										<button
											type="button"
											key={entry.name}
											className={quantization === entry.name ? "active" : ""}
											onClick={() => setQuantization(entry.name)}
										>
											<span>{entry.name}</span>
											<small>{formatBytes(entry.size ?? null)}</small>
										</button>
									))}
								</div>
							) : null}
							<button
								className="primary-button"
								type="button"
								disabled={!downloadId || activeAction !== null}
								onClick={() => void runAction("download", downloadId)}
							>
								<Download size={13} strokeWidth={2} /> 下载 {quantization || "模型"}
							</button>
						</div>
					) : null}
				</div>
			) : null}

			<div className="llama-model-list">
				{(runtime?.models ?? []).map((model) => {
					const progressRatio = modelProgress(model);
					const busy = activeAction === `load:${model.id}` || activeAction === `unload:${model.id}`;
					return (
						<div className="llama-model-row" key={model.id}>
							<span className="llama-model-icon">
								<HardDrive size={15} strokeWidth={2} />
							</span>
							<span className="llama-model-copy">
								<strong title={model.id}>{model.id}</strong>
								<small>
									{model.contextWindow ? `${Math.round(model.contextWindow / 1024)}K context` : "上下文未知"} ·{" "}
									{formatBytes(model.size)} · {model.source ?? "unknown"}
								</small>
								{progressRatio !== null ? (
									<span className="llama-inline-progress">
										<i style={{ width: `${Math.round(progressRatio * 100)}%` }} />
									</span>
								) : null}
							</span>
							<span className={`llama-status-chip ${statusTone(model)}`}>{statusLabel(model)}</span>
							<span className="llama-model-actions">
								{model.status === "loaded" || model.status === "sleeping" ? (
									<button
										type="button"
										className="secondary-button"
										disabled={activeAction !== null}
										onClick={() => void runAction("unload", model.id)}
									>
										{busy ? <Loader2 size={13} /> : <Square size={12} fill="currentColor" />} 卸载
									</button>
								) : model.status === "unloaded" && !model.failed ? (
									<button
										type="button"
										className="secondary-button"
										disabled={activeAction !== null}
										onClick={() => void runAction("load", model.id)}
									>
										{busy ? <Loader2 size={13} /> : <Play size={13} fill="currentColor" />} 加载
									</button>
								) : null}
							</span>
						</div>
					);
				})}
				{configured && runtime?.connected && (runtime.models.length ?? 0) === 0 ? (
					<div className="provider-empty">
						<HardDrive size={15} strokeWidth={2} />
						<span>Router 当前没有模型。可以先下载一个 GGUF 模型。</span>
					</div>
				) : null}
				{!configured ? (
					<div className="provider-empty">
						<Server size={15} strokeWidth={2} />
						<span>先配置 llama.cpp server 地址并保存。</span>
					</div>
				) : null}
			</div>

			{progress ? (
				<div className="llama-progress">
					<div>
						<strong>{progress.message}</strong>
						{progress.detail ? <small>{progress.detail}</small> : null}
					</div>
					{progress.ratio !== undefined ? (
						<span className="llama-progress-bar">
							<i style={{ width: `${Math.round(Math.max(0, Math.min(1, progress.ratio)) * 100)}%` }} />
						</span>
					) : (
						<Loader2 size={15} className="llama-spin" />
					)}
				</div>
			) : null}

			<div className="llama-settings-footer">
				<span>
					{activeAgent
						? "加载或切换模型后，重新连接当前 Agent 即可刷新模型列表。"
						: "打开一个 Agent 后可从设置页重新连接以刷新模型。"}
				</span>
				{activeAgent ? (
					<button
						className="secondary-button"
						type="button"
						disabled={activeAction !== null}
						onClick={() => {
							void window.codepiddy.reconnectAgent(activeAgent).then(
								() => showSettingsToast("当前 Agent 已重新连接。", "success"),
								(error: unknown) =>
									showSettingsToast(error instanceof Error ? error.message : "重新连接 Agent 失败", "error"),
							);
						}}
					>
						<RefreshCw size={13} strokeWidth={2} /> 重新连接 Agent
					</button>
				) : null}
			</div>
		</section>
	);
}
