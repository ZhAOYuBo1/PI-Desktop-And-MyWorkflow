import type { AgentInstanceLocator, AgentModelOption, AgentModelScope } from "@codepiddy/shared";
import { ChevronDown, ChevronUp, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProviderIcon } from "./provider-icon.tsx";
import { SettingsCheckbox } from "./settings-checkbox.tsx";
import { showSettingsToast } from "./settings-toast-store.ts";

const demoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo");

const DEMO_MODELS: AgentModelOption[] = [
	{ provider: "openai", id: "gpt-5.5", name: "GPT-5.5", reasoning: true },
	{ provider: "openai", id: "gpt-5.4-mini", name: "GPT-5.4 Mini", reasoning: true },
	{ provider: "anthropic", id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", reasoning: true },
	{ provider: "deepseek", id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", reasoning: true },
];

function modelId(model: AgentModelOption): string {
	return `${model.provider}/${model.id}`;
}

function normalizeSelection(selection: string[], allIds: string[]): string[] | null {
	return selection.length === allIds.length && allIds.every((id) => selection.includes(id)) ? null : selection;
}

export function ModelScopeSettings({
	activeAgent,
	refreshToken = 0,
}: {
	activeAgent: AgentInstanceLocator | null;
	refreshToken?: number;
}) {
	const [scope, setScope] = useState<AgentModelScope | null>(null);
	const [draft, setDraft] = useState<string[] | null>(null);
	const [search, setSearch] = useState("");
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);

	const load = useCallback(async (): Promise<void> => {
		if (refreshToken < 0) return;
		if (demoMode) {
			const next = { enabledModelIds: null, availableModels: DEMO_MODELS, applyPending: false };
			setScope(next);
			setDraft(next.enabledModelIds);
			return;
		}
		if (!activeAgent || !("codepiddy" in window)) {
			setScope(null);
			setDraft(null);
			return;
		}
		setLoading(true);
		try {
			const next = await window.codepiddy.getAgentModelScope(activeAgent);
			setScope(next);
			setDraft(next.enabledModelIds);
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "读取常用模型失败", "error");
		} finally {
			setLoading(false);
		}
	}, [activeAgent, refreshToken]);

	useEffect(() => {
		void load();
	}, [load]);

	const allIds = useMemo(() => (scope?.availableModels ?? []).map(modelId), [scope]);
	const enabledIds = useMemo(() => (draft === null ? allIds : draft), [allIds, draft]);
	const enabledSet = useMemo(() => new Set(enabledIds), [enabledIds]);
	const normalizedSearch = search.trim().toLowerCase();
	const visibleModels = useMemo(
		() =>
			(scope?.availableModels ?? []).filter((model) =>
				`${model.provider} ${model.name} ${model.id}`.toLowerCase().includes(normalizedSearch),
			),
		[normalizedSearch, scope],
	);
	const visibleProviders = useMemo(() => [...new Set(visibleModels.map((model) => model.provider))], [visibleModels]);
	const orderedVisibleModels = useMemo(() => {
		const rank = new Map(enabledIds.map((id, index) => [id, index]));
		return [...visibleModels].sort((left, right) => {
			const leftEnabled = enabledSet.has(modelId(left));
			const rightEnabled = enabledSet.has(modelId(right));
			if (leftEnabled !== rightEnabled) return leftEnabled ? -1 : 1;
			if (leftEnabled && rightEnabled) return (rank.get(modelId(left)) ?? 0) - (rank.get(modelId(right)) ?? 0);
			return 0;
		});
	}, [enabledIds, enabledSet, visibleModels]);

	function materializedSelection(): string[] {
		return draft === null ? [...allIds] : [...draft];
	}

	function toggleModel(id: string): void {
		const current = materializedSelection();
		const next = current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id];
		setDraft(normalizeSelection(next, allIds));
	}

	function toggleProvider(provider: string): void {
		const providerIds = (scope?.availableModels ?? []).filter((model) => model.provider === provider).map(modelId);
		const allProviderEnabled = providerIds.every((id) => enabledSet.has(id));
		const current = materializedSelection();
		const next = allProviderEnabled
			? current.filter((id) => !providerIds.includes(id))
			: [...current, ...providerIds.filter((id) => !current.includes(id))];
		setDraft(normalizeSelection(next, allIds));
	}

	function moveModel(id: string, delta: -1 | 1): void {
		const current = materializedSelection();
		const index = current.indexOf(id);
		if (index < 0) return;
		const target = index + delta;
		if (target < 0 || target >= current.length) return;
		const next = [...current];
		[next[index], next[target]] = [next[target]!, next[index]!];
		setDraft(next);
	}

	async function save(): Promise<void> {
		if (!scope || !activeAgent) return;
		if (demoMode || !("codepiddy" in window)) {
			setScope({ ...scope, enabledModelIds: draft });
			showSettingsToast("常用模型已保存。", "success");
			return;
		}
		setSaving(true);
		try {
			const next = await window.codepiddy.setAgentModelScope({ ...activeAgent, enabledModelIds: draft });
			setScope(next);
			setDraft(next.enabledModelIds);
			showSettingsToast(
				next.applyPending ? "常用模型已保存；当前 Agent 运行结束后重新连接生效。" : "常用模型已保存。",
				"success",
			);
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "保存常用模型失败", "error");
		} finally {
			setSaving(false);
		}
	}

	if (!activeAgent && !demoMode) {
		return (
			<section className="settings-card model-scope-card">
				<div className="settings-card-heading">
					<div>
						<h2>常用模型范围</h2>
						<p>选择要固定显示在模型选择器顶部的模型。先在左侧打开一个 Agent，再配置常用模型。</p>
					</div>
					<div className="settings-status">需要 Agent</div>
				</div>
			</section>
		);
	}

	return (
		<section className="settings-card model-scope-card">
			<div className="settings-card-heading">
				<div>
					<h2>常用模型范围</h2>
					<p>
						选择并排序后写入 Pi 原生 <code>settings.json</code>
						。常用模型会显示在模型选择器顶部，仍然可以切换到全部模型。
					</p>
				</div>
				<div className="skill-settings-actions">
					<div className="settings-status">
						{draft === null ? "全部常用" : `${enabledIds.length} / ${allIds.length} 常用`}
					</div>
					<button
						className="work-panel-icon-button"
						type="button"
						aria-label="刷新常用模型"
						title="刷新常用模型"
						disabled={loading || saving}
						onClick={() => void load()}
					>
						<RefreshCw size={14} strokeWidth={2} />
					</button>
				</div>
			</div>

			<div className="model-scope-toolbar">
				<label className="model-scope-search">
					<Search size={14} strokeWidth={2} aria-hidden="true" />
					<input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="搜索模型或 Provider"
						aria-label="搜索模型或 Provider"
					/>
				</label>
				<div className="model-scope-bulk-actions">
					<button className="secondary-button" type="button" onClick={() => setDraft(null)}>
						全部设为常用
					</button>
					<button className="secondary-button" type="button" onClick={() => setDraft([])}>
						清空常用
					</button>
				</div>
			</div>

			<div className="model-scope-list">
				{visibleProviders.map((provider) => {
					const providerModels = orderedVisibleModels.filter((model) => model.provider === provider);
					const providerIds = providerModels.map(modelId);
					const providerEnabled = providerIds.length > 0 && providerIds.every((id) => enabledSet.has(id));
					return (
						<section className="model-scope-provider" key={provider}>
							<div className="model-scope-provider-heading">
								<ProviderIcon providerId={provider} size={15} />
								<strong>{provider}</strong>
								<span>
									{providerIds.filter((id) => enabledSet.has(id)).length}/{providerIds.length}
								</span>
								<button
									className="model-scope-provider-toggle"
									type="button"
									aria-pressed={providerEnabled}
									onClick={() => toggleProvider(provider)}
								>
									{providerEnabled ? "取消常用" : "全部设为常用"}
								</button>
							</div>
							<div className="model-scope-model-list">
								{providerModels.map((model) => {
									const id = modelId(model);
									const enabled = enabledSet.has(id);
									return (
										<div className={`model-scope-row${enabled ? " is-enabled" : ""}`} key={id}>
											<SettingsCheckbox
												className="model-scope-check"
												checked={enabled}
												onChange={() => toggleModel(id)}
											>
												<span className="model-scope-model-copy">
													<strong>{model.name}</strong>
													<small title={id}>{id}</small>
												</span>
											</SettingsCheckbox>
											<span className="model-scope-reorder">
												<button
													type="button"
													aria-label={`上移 ${model.name}`}
													title="上移"
													disabled={!enabled}
													onClick={() => moveModel(id, -1)}
												>
													<ChevronUp size={14} strokeWidth={2} />
												</button>
												<button
													type="button"
													aria-label={`下移 ${model.name}`}
													title="下移"
													disabled={!enabled}
													onClick={() => moveModel(id, 1)}
												>
													<ChevronDown size={14} strokeWidth={2} />
												</button>
											</span>
										</div>
									);
								})}
							</div>
						</section>
					);
				})}
				{visibleModels.length === 0 ? <p className="provider-empty">没有匹配的模型。</p> : null}
			</div>

			<div className="settings-actions">
				<button
					className="primary-button"
					type="button"
					disabled={saving || loading || !scope}
					onClick={() => void save()}
				>
					{saving ? "保存中…" : "保存常用模型"}
				</button>
			</div>
		</section>
	);
}
