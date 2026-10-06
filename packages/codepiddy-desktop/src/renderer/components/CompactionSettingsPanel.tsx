import type {
	AgentInstanceLocator,
	AgentModelOption,
	CompactionModelOverride,
	ContextCompactionSettings,
	SettingsStatus,
} from "@codepiddy/shared";
import { RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProviderIcon } from "./provider-icon.tsx";
import { SelectMenu } from "./select-menu.tsx";
import { SettingsCheckbox } from "./settings-checkbox.tsx";
import { showSettingsToast } from "./settings-toast-store.ts";
import { StateBlock } from "./state-block.tsx";

const demoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo");

const DEMO_MODELS: AgentModelOption[] = [
	{ provider: "openai", id: "gpt-5.5", name: "GPT-5.5", reasoning: true },
	{ provider: "openai", id: "gpt-5.4-mini", name: "GPT-5.4 Mini", reasoning: true },
	{ provider: "anthropic", id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", reasoning: true },
	{ provider: "deepseek", id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", reasoning: true },
];

const DEFAULT_COMPACTION_SETTINGS = {
	enabled: true,
	reserveTokens: 16384,
	keepRecentTokens: 20000,
} as const;
const DEFAULT_BRANCH_SUMMARY_SETTINGS = {
	reserveTokens: 16384,
	skipPrompt: false,
} as const;

interface OverrideDraft {
	reserveTokens: string;
	keepRecentTokens: string;
}

interface CompactionDraft {
	enabled: boolean;
	reserveTokens: string;
	keepRecentTokens: string;
	modelOverrides: Record<string, OverrideDraft>;
	branchSummaryReserveTokens: string;
	branchSummarySkipPrompt: boolean;
}

function defaultContextCompactionSettings(): ContextCompactionSettings {
	return {
		compaction: {
			...DEFAULT_COMPACTION_SETTINGS,
			modelOverrides: {},
		},
		branchSummary: { ...DEFAULT_BRANCH_SUMMARY_SETTINGS },
	};
}

function toDraft(settings: ContextCompactionSettings): CompactionDraft {
	return {
		enabled: settings.compaction.enabled,
		reserveTokens: String(settings.compaction.reserveTokens),
		keepRecentTokens: String(settings.compaction.keepRecentTokens),
		modelOverrides: Object.fromEntries(
			Object.entries(settings.compaction.modelOverrides).map(([key, override]) => [
				key,
				{
					reserveTokens: override.reserveTokens === undefined ? "" : String(override.reserveTokens),
					keepRecentTokens: override.keepRecentTokens === undefined ? "" : String(override.keepRecentTokens),
				},
			]),
		),
		branchSummaryReserveTokens: String(settings.branchSummary.reserveTokens),
		branchSummarySkipPrompt: settings.branchSummary.skipPrompt,
	};
}

function parseToken(value: string, label: string): number {
	const text = value.trim();
	if (!/^\d+$/.test(text)) throw new Error(`${label} 必须是非负整数`);
	const parsed = Number(text);
	if (!Number.isSafeInteger(parsed)) throw new Error(`${label} 超出可保存范围`);
	return parsed;
}

function toSettings(draft: CompactionDraft): ContextCompactionSettings {
	const modelOverrides = Object.fromEntries(
		Object.entries(draft.modelOverrides).flatMap(([key, override]) => {
			const next: CompactionModelOverride = {};
			if (override.reserveTokens.trim()) {
				next.reserveTokens = parseToken(override.reserveTokens, `${key} 的预留 Token`);
			}
			if (override.keepRecentTokens.trim()) {
				next.keepRecentTokens = parseToken(override.keepRecentTokens, `${key} 的保留最近 Token`);
			}
			return Object.keys(next).length > 0 ? [[key, next] as const] : [];
		}),
	);
	return {
		compaction: {
			enabled: draft.enabled,
			reserveTokens: parseToken(draft.reserveTokens, "压缩预留 Token"),
			keepRecentTokens: parseToken(draft.keepRecentTokens, "压缩保留最近 Token"),
			modelOverrides,
		},
		branchSummary: {
			reserveTokens: parseToken(draft.branchSummaryReserveTokens, "分支摘要预留 Token"),
			skipPrompt: draft.branchSummarySkipPrompt,
		},
	};
}

function modelKey(model: AgentModelOption): string {
	return `${model.provider}/${model.id}`;
}

export function CompactionSettingsPanel({
	settings,
	activeAgent,
	onStatusChange,
}: {
	settings: ContextCompactionSettings | null;
	activeAgent: AgentInstanceLocator | null;
	onStatusChange?: (status: SettingsStatus) => void;
}) {
	const [draft, setDraft] = useState<CompactionDraft>(() => toDraft(settings ?? defaultContextCompactionSettings()));
	const [models, setModels] = useState<AgentModelOption[]>([]);
	const [modelsLoading, setModelsLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [dirty, setDirty] = useState(false);

	useEffect(() => {
		setDraft(toDraft(settings ?? defaultContextCompactionSettings()));
		setDirty(false);
	}, [settings]);

	const loadModels = useCallback(async (): Promise<void> => {
		if (demoMode) {
			setModels(DEMO_MODELS);
			return;
		}
		if (!activeAgent || !("codepiddy" in window)) {
			setModels([]);
			return;
		}
		setModelsLoading(true);
		try {
			const scope = await window.codepiddy.getAgentModelScope(activeAgent);
			setModels(scope.availableModels);
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "读取可用模型失败", "error");
		} finally {
			setModelsLoading(false);
		}
	}, [activeAgent]);

	useEffect(() => {
		void loadModels();
	}, [loadModels]);

	const modelByKey = useMemo(() => new Map(models.map((model) => [modelKey(model), model])), [models]);
	const availableModels = useMemo(
		() => models.filter((model) => !(modelKey(model) in draft.modelOverrides)),
		[draft.modelOverrides, models],
	);
	const configuredOverrideKeys = useMemo(() => Object.keys(draft.modelOverrides), [draft.modelOverrides]);

	function updateDraft(patch: Partial<CompactionDraft>): void {
		setDraft((current) => ({ ...current, ...patch }));
		setDirty(true);
	}

	function updateOverride(key: string, patch: Partial<OverrideDraft>): void {
		setDraft((current) => ({
			...current,
			modelOverrides: {
				...current.modelOverrides,
				[key]: { ...current.modelOverrides[key]!, ...patch },
			},
		}));
		setDirty(true);
	}

	function addOverride(key: string): void {
		if (!key || draft.modelOverrides[key]) return;
		setDraft((current) => ({
			...current,
			modelOverrides: {
				...current.modelOverrides,
				[key]: { reserveTokens: "", keepRecentTokens: "" },
			},
		}));
		setDirty(true);
	}

	function removeOverride(key: string): void {
		setDraft((current) => {
			const next = { ...current.modelOverrides };
			delete next[key];
			return { ...current, modelOverrides: next };
		});
		setDirty(true);
	}

	async function save(): Promise<void> {
		if (saving) return;
		let next: ContextCompactionSettings;
		try {
			next = toSettings(draft);
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "压缩设置无效", "error");
			return;
		}

		if (demoMode || !("codepiddy" in window)) {
			setDraft(toDraft(next));
			setDirty(false);
			showSettingsToast("上下文压缩设置已保存。", "success");
			return;
		}

		setSaving(true);
		try {
			const status = await window.codepiddy.saveContextCompactionSettings(next);
			setDraft(toDraft(status.contextCompaction));
			setDirty(false);
			onStatusChange?.(status);
			showSettingsToast("上下文压缩设置已保存；新启动或重置后的 Agent 生效。", "success");
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "保存上下文压缩设置失败", "error");
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="settings-card compaction-settings-card">
			<div className="settings-card-heading">
				<div>
					<h2>上下文压缩</h2>
					<p>
						配置 Pi 原生的自动压缩和分支摘要参数。手动 <code>/compact</code> 仍然可用；这里控制的是自动触发阈值和
						压缩后保留的上下文。
					</p>
				</div>
				<div className="skill-settings-actions">
					<div className="settings-status">{saving ? "保存中" : dirty ? "未保存" : "已保存"}</div>
					<button
						className="work-panel-icon-button"
						type="button"
						aria-label="刷新可用模型"
						title="刷新可用模型"
						disabled={modelsLoading || saving}
						onClick={() => void loadModels()}
					>
						<RefreshCw size={14} strokeWidth={2} />
					</button>
				</div>
			</div>

			<div className="compaction-section">
				<div className="compaction-section-heading">
					<div>
						<h3>自动压缩</h3>
						<p>上下文接近模型窗口上限时，Pi 自动压缩旧消息并继续对话。</p>
					</div>
					<SettingsCheckbox checked={draft.enabled} onChange={(enabled) => updateDraft({ enabled })}>
						<span className="compaction-inline-label">{draft.enabled ? "已启用" : "已关闭"}</span>
					</SettingsCheckbox>
				</div>
				<div className="compaction-token-grid">
					<label className="settings-field">
						<span>预留 Token</span>
						<input
							type="number"
							min={0}
							step={1024}
							value={draft.reserveTokens}
							onChange={(event) => updateDraft({ reserveTokens: event.target.value })}
						/>
						<small>越大越早触发压缩，给下一轮请求和回复留出空间。</small>
					</label>
					<label className="settings-field">
						<span>保留最近 Token</span>
						<input
							type="number"
							min={0}
							step={1024}
							value={draft.keepRecentTokens}
							onChange={(event) => updateDraft({ keepRecentTokens: event.target.value })}
						/>
						<small>压缩后保留的最近原始对话越多，上下文越完整，请求也越大。</small>
					</label>
				</div>
			</div>

			<div className="compaction-section">
				<div className="compaction-section-heading">
					<div>
						<h3>分支摘要</h3>
						<p>Pi 在会话树切换分支时生成摘要，避免离开的分支上下文完全丢失。</p>
					</div>
				</div>
				<div className="compaction-token-grid">
					<label className="settings-field">
						<span>摘要预留 Token</span>
						<input
							type="number"
							min={0}
							step={1024}
							value={draft.branchSummaryReserveTokens}
							onChange={(event) => updateDraft({ branchSummaryReserveTokens: event.target.value })}
						/>
						<small>用于摘要请求的预留空间。</small>
					</label>
				</div>
				<SettingsCheckbox
					className="compaction-checkbox"
					checked={draft.branchSummarySkipPrompt}
					onChange={(skipPrompt) => updateDraft({ branchSummarySkipPrompt: skipPrompt })}
				>
					<strong>跳过分支摘要确认</strong>
					<small>开启后切换分支时不询问，默认不生成摘要；关闭时保留 Pi 的确认流程。</small>
				</SettingsCheckbox>
			</div>

			<div className="compaction-section">
				<div className="compaction-section-heading">
					<div>
						<h3>单模型覆盖</h3>
						<p>这是全局自动压缩的补充：未配置的模型继续使用上面的全局参数，只有这里添加的模型使用自己的值。</p>
					</div>
					<span className="settings-status">{configuredOverrideKeys.length} 个</span>
				</div>
				<div className="settings-field compaction-override-add">
					<span>添加模型</span>
					<SelectMenu
						label="添加模型覆盖"
						value=""
						placeholder={models.length > 0 ? "选择模型" : "打开一个 Agent 后读取模型"}
						searchable
						searchPlaceholder="搜索模型或 Provider"
						options={availableModels.map((model) => ({
							value: modelKey(model),
							label: model.name,
							description: modelKey(model),
							icon: <ProviderIcon providerId={model.provider} size={14} />,
						}))}
						onChange={addOverride}
						disabled={modelsLoading || models.length === 0}
					/>
				</div>
				{configuredOverrideKeys.length > 0 ? (
					<div className="compaction-override-list">
						{configuredOverrideKeys.map((key) => {
							const model = modelByKey.get(key);
							const provider = model?.provider ?? key.split("/")[0] ?? "unknown";
							return (
								<div className="compaction-override-row" key={key}>
									<div className="compaction-override-model">
										<ProviderIcon providerId={provider} size={15} />
										<div>
											<strong>{model?.name ?? key}</strong>
											<small title={key}>{key}</small>
										</div>
									</div>
									<label className="compaction-override-field">
										<span>预留</span>
										<input
											type="number"
											min={0}
											step={1024}
											value={draft.modelOverrides[key]?.reserveTokens ?? ""}
											placeholder={draft.reserveTokens}
											onChange={(event) => updateOverride(key, { reserveTokens: event.target.value })}
										/>
									</label>
									<label className="compaction-override-field">
										<span>保留最近</span>
										<input
											type="number"
											min={0}
											step={1024}
											value={draft.modelOverrides[key]?.keepRecentTokens ?? ""}
											placeholder={draft.keepRecentTokens}
											onChange={(event) => updateOverride(key, { keepRecentTokens: event.target.value })}
										/>
									</label>
									<button
										className="compaction-override-remove"
										type="button"
										aria-label={`删除 ${key} 的覆盖`}
										title="删除覆盖"
										onClick={() => removeOverride(key)}
									>
										<Trash2 size={14} strokeWidth={2} />
									</button>
								</div>
							);
						})}
					</div>
				) : (
					<StateBlock
						className="compaction-empty-state"
						tone="neutral"
						icon="list"
						title="未配置单模型覆盖"
						compact
					>
						所有模型都使用上面的全局压缩参数。
					</StateBlock>
				)}
			</div>

			<div className="settings-actions">
				<button className="primary-button" type="button" disabled={saving} onClick={() => void save()}>
					{saving ? "保存中…" : "保存压缩设置"}
				</button>
			</div>
			<small>设置写入 Pi 原生 settings.json；修改后，新启动或重置后的 Agent 才会使用新值。</small>
		</section>
	);
}
