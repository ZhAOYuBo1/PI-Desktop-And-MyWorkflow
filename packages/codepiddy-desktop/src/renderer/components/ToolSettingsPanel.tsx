import type { McpExposure, McpServerSummary, PiBuiltinToolName, SettingsStatus, ToolSettings } from "@codepiddy/shared";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppIcon } from "./app-icon.tsx";
import { SettingsCheckbox } from "./settings-checkbox.tsx";
import { showSettingsToast } from "./settings-toast-store.ts";
import { StateBlock } from "./state-block.tsx";

const demoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo");

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

const PI_DEFAULT_TOOL_NAMES: PiBuiltinToolName[] = ["read", "bash", "edit", "write"];

const BUILTIN_TOOL_OPTIONS: Array<{ name: PiBuiltinToolName; description: string }> = [
	{ name: "read", description: "读取文件和图片" },
	{ name: "bash", description: "通过 bash 执行命令" },
	{ name: "powershell", description: "通过 PowerShell 执行命令" },
	{ name: "edit", description: "精确修改文件内容" },
	{ name: "write", description: "创建或覆盖文件" },
	{ name: "grep", description: "搜索文件内容" },
	{ name: "find", description: "按路径和 glob 查找文件" },
	{ name: "ls", description: "列出目录内容" },
];

const EXPOSURE_GUIDE: Array<{ exposure: McpExposure; label: string; description: string }> = [
	{ exposure: "direct", label: "直接可见", description: "工具定义随每轮请求直接提供给模型" },
	{ exposure: "deferred", label: "按需加载", description: "由 tool_search 在需要时搜索并激活" },
	{ exposure: "codemode", label: "Codemode", description: "只出现在 Codemode 脚本工具目录中" },
	{ exposure: "hidden", label: "隐藏", description: "注册但不提供给模型调用" },
];

const PI_EXTENSION_TOOLS = [
	{
		name: "codemode",
		description: "批量脚本调用工具，读取 Codemode 设置中的模式与工具目录预算。",
		status: "已加载",
	},
	{
		name: "tool_search",
		description: "搜索 deferred / codemode 工具并按需激活；内置工具不参与搜索。",
		status: "按需加载",
	},
	{
		name: "mcp",
		description: "连接原生 mcp.json 服务，并把服务级和工具级 exposure 交给 Pi 处理。",
		status: "已加载",
	},
] as const;

const DEMO_MCP_SERVERS: McpServerSummary[] = [
	{
		name: "web_search",
		transport: "stdio",
		command: "node",
		args: ["tavily-search.js"],
		url: null,
		env: { TAVILY_API_KEY: `\${TAVILY_API_KEY}` },
		headers: {},
		enabled: true,
		exposure: "direct",
		toolExposure: { web_search: "direct" },
		description: "Tavily web search",
		timeout: null,
		oauth: null,
		authProvider: null,
		projectOverride: null,
		source: "builtin",
	},
	{
		name: "chrome-devtools",
		transport: "stdio",
		command: "npx",
		args: ["-y", "chrome-devtools-mcp@1.6.0"],
		url: null,
		env: {},
		headers: {},
		enabled: true,
		exposure: "codemode",
		toolExposure: {},
		description: "Browser inspection and automation tools",
		timeout: 30,
		oauth: null,
		authProvider: null,
		projectOverride: null,
		source: "global",
	},
];

function effectiveEnabled(server: McpServerSummary): boolean {
	return server.projectOverride?.enabled ?? server.enabled;
}

function effectiveExposure(server: McpServerSummary): McpExposure {
	return server.projectOverride?.exposure ?? server.exposure;
}

function effectiveToolExposure(server: McpServerSummary): Record<string, McpExposure> {
	return {
		...server.toolExposure,
		...(server.projectOverride?.toolExposure ?? {}),
	};
}

export function ToolSettingsPanel({
	settings,
	projectRoot,
	onStatusChange,
	onOpenMcp,
	onSaved,
}: {
	settings: ToolSettings | null;
	projectRoot: string | null;
	onStatusChange?: (status: SettingsStatus) => void;
	onOpenMcp: () => void;
	onSaved?: () => Promise<string | null> | string | null;
}) {
	const [draft, setDraft] = useState<ToolSettings>(() => settings ?? { defaultTools: null });
	const [dirty, setDirty] = useState(false);
	const [saving, setSaving] = useState(false);
	const [servers, setServers] = useState<McpServerSummary[] | null>(demoMode ? DEMO_MCP_SERVERS : null);
	const [serversLoading, setServersLoading] = useState(false);

	useEffect(() => {
		setDraft(settings ?? { defaultTools: null });
		setDirty(false);
	}, [settings]);

	const loadMcpServers = useCallback(async (): Promise<void> => {
		if (demoMode) {
			setServers(DEMO_MCP_SERVERS);
			return;
		}
		if (!("codepiddy" in window)) {
			setServers([]);
			return;
		}
		setServersLoading(true);
		try {
			setServers(await window.codepiddy.listMcpServers(projectRoot ?? undefined));
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "读取 MCP 配置失败", "error");
		} finally {
			setServersLoading(false);
		}
	}, [projectRoot]);

	useEffect(() => {
		void loadMcpServers();
	}, [loadMcpServers]);

	const effectiveTools = new Set<PiBuiltinToolName>(draft.defaultTools ?? PI_DEFAULT_TOOL_NAMES);
	const custom = draft.defaultTools !== null;

	function toggleTool(name: PiBuiltinToolName, checked: boolean): void {
		const next = new Set<PiBuiltinToolName>(draft.defaultTools ?? PI_DEFAULT_TOOL_NAMES);
		if (checked) next.add(name);
		else next.delete(name);
		setDraft({ defaultTools: PI_BUILTIN_TOOL_NAMES.filter((tool) => next.has(tool)) });
		setDirty(true);
	}

	function resetToPiDefault(): void {
		setDraft({ defaultTools: null });
		setDirty(true);
	}

	async function save(): Promise<void> {
		if (saving) return;
		if (demoMode || !("codepiddy" in window)) {
			setDirty(false);
			showSettingsToast("工具设置已保存。", "success");
			return;
		}
		setSaving(true);
		try {
			const status = await window.codepiddy.saveToolSettings(draft);
			setDraft(status.tools);
			setDirty(false);
			onStatusChange?.(status);
			const refreshMessage = (await onSaved?.()) ?? "工具设置已保存；新启动或重置后的 Agent 生效。";
			showSettingsToast(refreshMessage, "success");
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "保存工具设置失败", "error");
		} finally {
			setSaving(false);
		}
	}

	return (
		<>
			<section className="settings-card tool-settings-card">
				<div className="settings-card-heading">
					<div>
						<h2>内置工具</h2>
						<p>
							控制新 Agent 启动时默认激活哪些 Pi 内置工具。这里写入原生 <code>settings.json</code> 的{" "}
							<code>defaultTools</code>；扩展工具和 MCP 工具不受这项开关影响。
						</p>
					</div>
					<div className="skill-settings-actions">
						<div className="settings-status">{custom ? "自定义" : "Pi 默认"}</div>
						<button className="secondary-button" type="button" disabled={!custom} onClick={resetToPiDefault}>
							恢复 Pi 默认
						</button>
					</div>
				</div>

				<div className="tool-settings-grid">
					{BUILTIN_TOOL_OPTIONS.map((tool) => (
						<SettingsCheckbox
							className="tool-settings-option"
							key={tool.name}
							checked={effectiveTools.has(tool.name)}
							onChange={(checked) => toggleTool(tool.name, checked)}
							trailing={<span className="tool-settings-kind">内置</span>}
						>
							<span className="tool-settings-option-copy">
								<strong>{tool.name}</strong>
								<small>{tool.description}</small>
							</span>
						</SettingsCheckbox>
					))}
				</div>

				<StateBlock tone="neutral" icon="settings" compact>
					Pi 默认集合是 <code>read / bash / edit / write</code>
					。未勾选的内置工具会从 Agent 的工具注册表中排除，Codemode 也不能调用；扩展工具和 MCP 不受影响。
				</StateBlock>

				<div className="settings-actions">
					<button className="primary-button" type="button" disabled={saving || !dirty} onClick={() => void save()}>
						{saving ? "保存中…" : "保存工具设置"}
					</button>
				</div>
				<small>保存后空闲 Agent 会自动重连；运行中的 Agent 停止或手动重连后生效。</small>
			</section>

			<section className="settings-card tool-discovery-card">
				<div className="settings-card-heading">
					<div>
						<h2>工具发现与曝光</h2>
						<p>
							Pi 的 <code>tool_search</code> 会自动发现 deferred / codemode 工具。曝光值属于 MCP
							服务或扩展工具定义， 不是内置工具的全局开关。
						</p>
					</div>
					<div className="skill-settings-actions">
						<div className="settings-status">只读汇总</div>
						<button className="secondary-button" type="button" onClick={onOpenMcp}>
							在 MCP 中配置
						</button>
					</div>
				</div>

				<div className="tool-exposure-list">
					{EXPOSURE_GUIDE.map((item) => (
						<div className="tool-exposure-row" key={item.exposure}>
							<code>{item.exposure}</code>
							<div>
								<strong>{item.label}</strong>
								<small>{item.description}</small>
							</div>
						</div>
					))}
				</div>

				<div className="tool-catalog-section">
					<div className="tool-catalog-heading">
						<div>
							<h3>Pi 内置扩展</h3>
							<p>这些工具由启动参数显式加载，和用户安装的第三方扩展隔离。</p>
						</div>
						<span className="settings-status">3 个</span>
					</div>
					<div className="tool-catalog-list">
						{PI_EXTENSION_TOOLS.map((tool) => (
							<div className="tool-catalog-row" key={tool.name}>
								<div className="tool-catalog-icon">
									<AppIcon
										name={tool.name === "mcp" ? "plug" : tool.name === "codemode" ? "braces" : "search"}
									/>
								</div>
								<div className="tool-catalog-copy">
									<strong>{tool.name}</strong>
									<small>{tool.description}</small>
								</div>
								<span className="tool-settings-badge">{tool.status}</span>
							</div>
						))}
					</div>
				</div>

				<div className="tool-catalog-section">
					<div className="tool-catalog-heading">
						<div>
							<h3>MCP 服务</h3>
							<p>显示当前项目的有效开关、服务级 exposure 和工具级覆盖；运行状态在 MCP 服务页查看。</p>
						</div>
						<button
							className="work-panel-icon-button"
							type="button"
							aria-label="刷新 MCP 配置"
							title="刷新 MCP 配置"
							disabled={serversLoading}
							onClick={() => void loadMcpServers()}
						>
							<RefreshCw size={14} strokeWidth={2} />
						</button>
					</div>

					{serversLoading && servers === null ? (
						<StateBlock tone="loading" title="正在读取 MCP 配置" compact>
							正在检查项目级覆盖和工具级 exposure。
						</StateBlock>
					) : servers && servers.length > 0 ? (
						<div className="tool-mcp-list">
							{servers.map((server) => {
								const enabled = effectiveEnabled(server);
								const exposure = effectiveExposure(server);
								const toolExposure = effectiveToolExposure(server);
								const overrides = Object.entries(toolExposure);
								return (
									<div className={`tool-mcp-row${enabled ? "" : " is-disabled"}`} key={server.name}>
										<div className="tool-mcp-icon">
											<AppIcon name="plug" />
										</div>
										<div className="tool-mcp-copy">
											<strong>{server.name}</strong>
											<small>{server.description || server.transport}</small>
											<small>
												{overrides.length > 0
													? overrides.map(([tool, value]) => `${tool}=${value}`).join(" · ")
													: "工具级 exposure 继承服务级"}
											</small>
										</div>
										<div className="tool-mcp-badges">
											<span className={`tool-settings-badge${enabled ? " is-enabled" : ""}`}>
												{enabled ? "启用" : "禁用"}
											</span>
											<span className="tool-settings-badge">{exposure}</span>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<StateBlock
							tone="neutral"
							icon="plug"
							title="未配置 MCP 服务"
							compact
							actions={
								<button className="secondary-button" type="button" onClick={onOpenMcp}>
									打开 MCP 设置
								</button>
							}
						>
							添加 MCP 服务后，这里会显示服务级和工具级 exposure。
						</StateBlock>
					)}
				</div>
			</section>
		</>
	);
}
