import type {
	AgentInstanceLocator,
	SpecialModelCatalogEntry,
	SpecialModelCatalogSnapshot,
	SpecialModelCatalogSource,
	SpecialModelCatalogType,
} from "@codepiddy/shared";
import { RefreshCw, Search } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { ProviderIcon } from "./provider-icon.tsx";
import { StateBlock } from "./state-block.tsx";

const demoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo");

const DEMO_SNAPSHOT: SpecialModelCatalogSnapshot = {
	version: 1,
	updatedAt: new Date().toISOString(),
	models: [
		{
			provider: "openai",
			id: "gpt-5.5",
			name: "GPT-5.5",
			type: "chat",
			api: "openai-responses",
			source: "configured",
			available: true,
			contextWindow: 400_000,
			maxTokens: 128_000,
		},
		{
			provider: "router",
			id: "auto",
			name: "Auto Router",
			type: "virtual",
			api: "pi-virtual",
			source: "virtual",
			available: true,
		},
		{
			provider: "typesafe",
			id: "jev-latest",
			name: "Jev Classifier",
			type: "classifier",
			api: "typesafe",
			source: "extension",
			available: false,
		},
		{
			provider: "openai",
			id: "gpt-image-1",
			name: "GPT Image 1",
			type: "image",
			api: "openai-images",
			source: "configured",
			available: null,
		},
	],
	errors: [],
};

const TYPE_ORDER: readonly SpecialModelCatalogType[] = ["chat", "virtual", "classifier", "image"];
const INITIAL_MODELS_PER_TYPE = 40;
const MODEL_PAGE_SIZE = 40;

const TYPE_LABELS: Record<SpecialModelCatalogType, string> = {
	chat: "Chat",
	virtual: "Virtual",
	classifier: "Classifier",
	image: "Image",
};

const TYPE_DESCRIPTIONS: Record<SpecialModelCatalogType, string> = {
	chat: "可被模型选择器直接使用的对话模型",
	virtual: "由扩展注册、每次请求再路由到物理模型",
	classifier: "供 Codemode 结构化分类调用",
	image: "供 Codemode 图片生成调用",
};

const SOURCE_LABELS: Record<SpecialModelCatalogSource, string> = {
	configured: "Pi 目录",
	extension: "扩展 Provider",
	virtual: "虚拟模型",
};

function availabilityLabel(available: boolean | null): string {
	if (available === true) return "可用";
	if (available === false) return "缺少凭据";
	return "未检查";
}

function modelSearchText(model: SpecialModelCatalogEntry): string {
	return `${model.provider} ${model.id} ${model.name} ${model.type} ${model.api}`.toLowerCase();
}

function ModelCatalogRow({ model }: { model: SpecialModelCatalogEntry }) {
	const limits =
		model.contextWindow || model.maxTokens
			? `${model.contextWindow ? `${model.contextWindow.toLocaleString()} 上下文` : ""}${
					model.contextWindow && model.maxTokens ? " · " : ""
				}${model.maxTokens ? `${model.maxTokens.toLocaleString()} 最大输出` : ""}`
			: null;
	return (
		<div className="model-catalog-row">
			<ProviderIcon providerId={model.provider} size={15} />
			<div className="model-catalog-copy">
				<strong>{model.name}</strong>
				<small>
					{model.provider}/{model.id}
					{limits ? ` · ${limits}` : ""}
				</small>
			</div>
			<span className={`model-catalog-source is-${model.source}`}>{SOURCE_LABELS[model.source]}</span>
			<span className={`model-catalog-availability is-${model.available ?? "unknown"}`}>
				<i aria-hidden="true" />
				{availabilityLabel(model.available)}
			</span>
		</div>
	);
}

export function ModelCatalogSettings({
	activeAgent,
	refreshToken = 0,
}: {
	activeAgent: AgentInstanceLocator | null;
	refreshToken?: number;
}) {
	const [snapshot, setSnapshot] = useState<SpecialModelCatalogSnapshot | null>(demoMode ? DEMO_SNAPSHOT : null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [search, setSearch] = useState("");
	const [visibleLimits, setVisibleLimits] = useState<Partial<Record<SpecialModelCatalogType, number>>>({});
	const deferredSearch = useDeferredValue(search);

	const load = useCallback(async (): Promise<void> => {
		if (refreshToken < 0) return;
		if (demoMode) {
			setSnapshot(DEMO_SNAPSHOT);
			setError(null);
			return;
		}
		if (!activeAgent || !("codepiddy" in window)) {
			setSnapshot(null);
			setError(null);
			return;
		}
		setLoading(true);
		try {
			setSnapshot(await window.codepiddy.getAgentModelCatalog(activeAgent));
			setError(null);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "读取特殊模型目录失败");
		} finally {
			setLoading(false);
		}
	}, [activeAgent, refreshToken]);

	useEffect(() => {
		void load();
	}, [load]);

	const visibleModels = useMemo(() => {
		const query = deferredSearch.trim().toLowerCase();
		return (snapshot?.models ?? []).filter((model) => !query || modelSearchText(model).includes(query));
	}, [deferredSearch, snapshot]);

	const groups = useMemo(
		() =>
			TYPE_ORDER.map((type) => ({
				type,
				models: visibleModels.filter((model) => model.type === type),
			})).filter((group) => group.models.length > 0),
		[visibleModels],
	);

	if (!activeAgent && !demoMode) {
		return (
			<section className="settings-card model-catalog-card">
				<div className="settings-card-heading">
					<div>
						<h2>特殊模型目录</h2>
						<p>展示 Pi runtime 中的 chat、virtual、classifier 和 image 模型。先打开一个 Agent 再查看。</p>
					</div>
					<div className="settings-status">需要 Agent</div>
				</div>
			</section>
		);
	}

	return (
		<section className="settings-card model-catalog-card">
			<div className="settings-card-heading">
				<div>
					<h2>特殊模型目录</h2>
					<p>只读展示当前 Agent runtime 的完整模型注册表。classifier 和 image 不会出现在普通模型选择器中。</p>
				</div>
				<div className="skill-settings-actions">
					<div className="settings-status">
						{snapshot ? `${snapshot.models.length} 个模型` : loading ? "读取中" : "尚无快照"}
					</div>
					<button
						className="work-panel-icon-button"
						type="button"
						aria-label="刷新特殊模型目录"
						title="刷新特殊模型目录"
						disabled={loading}
						onClick={() => void load()}
					>
						<RefreshCw size={14} strokeWidth={2} />
					</button>
				</div>
			</div>

			{error ? (
				<StateBlock tone="error" title="特殊模型目录读取失败" compact>
					{error}
				</StateBlock>
			) : null}
			{!error && snapshot?.errors.length ? (
				<StateBlock tone="warning" title="部分模型可用性未检查" compact>
					{snapshot.errors.join("\n")}
				</StateBlock>
			) : null}
			{!error && !snapshot ? (
				<StateBlock tone="neutral" title="当前 Agent 还没有生成模型目录快照" compact>
					目录会在 Agent 启动或重新连接时生成；点击刷新可重新读取。
				</StateBlock>
			) : null}

			{snapshot ? (
				<>
					<label className="model-catalog-search">
						<Search size={14} strokeWidth={2} aria-hidden="true" />
						<input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="搜索模型、Provider 或 API"
							aria-label="搜索特殊模型"
						/>
					</label>
					<div className="model-catalog-groups">
						{groups.map((group) => (
							<section className="model-catalog-group" key={group.type}>
								<div className="model-catalog-group-heading">
									<strong>{TYPE_LABELS[group.type]}</strong>
									<span>{TYPE_DESCRIPTIONS[group.type]}</span>
									<em>{group.models.length}</em>
								</div>
								<div className="model-catalog-list">
									{group.models.slice(0, visibleLimits[group.type] ?? INITIAL_MODELS_PER_TYPE).map((model) => (
										<ModelCatalogRow key={`${model.type}:${model.provider}:${model.id}`} model={model} />
									))}
								</div>
								{group.models.length > (visibleLimits[group.type] ?? INITIAL_MODELS_PER_TYPE) ? (
									<button
										className="model-catalog-more"
										type="button"
										onClick={() =>
											setVisibleLimits((current) => ({
												...current,
												[group.type]: (current[group.type] ?? INITIAL_MODELS_PER_TYPE) + MODEL_PAGE_SIZE,
											}))
										}
									>
										显示更多（剩余{" "}
										{group.models.length - (visibleLimits[group.type] ?? INITIAL_MODELS_PER_TYPE)}）
									</button>
								) : null}
							</section>
						))}
						{groups.length === 0 ? <StateBlock tone="neutral" title="没有匹配的模型" compact /> : null}
					</div>
					<small className="model-catalog-updated">
						快照更新时间：{new Date(snapshot.updatedAt).toLocaleString()}
					</small>
				</>
			) : null}
		</section>
	);
}
