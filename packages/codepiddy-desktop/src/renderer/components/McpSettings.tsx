import type {
	AgentInstanceLocator,
	McpClientRegistration,
	McpExposure,
	McpProjectOverrideInput,
	McpRuntimeSnapshot,
	McpServerInput,
	McpServerSummary,
	McpTransport,
} from "@codepiddy/shared";
import { Activity, Globe, LogIn, LogOut, Pencil, Plug, Plus, RefreshCw, SlidersHorizontal, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SelectMenu } from "./select-menu.tsx";
import { SettingsCheckbox } from "./settings-checkbox.tsx";
import { showSettingsToast } from "./settings-toast-store.ts";
import { StateBlock } from "./state-block.tsx";

const demoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo");

const EXPOSURE_OPTIONS: Array<{ value: McpExposure; label: string; description: string }> = [
	{ value: "codemode", label: "codemode", description: "通过 codemode 脚本调用，默认值" },
	{ value: "deferred", label: "deferred", description: "由 tool_search 按需加载" },
	{ value: "direct", label: "direct", description: "像内置工具一样直接声明给模型" },
	{ value: "hidden", label: "hidden", description: "注册但不可调用" },
];

const DEMO_SERVERS: McpServerSummary[] = [
	{
		name: "filesystem",
		transport: "stdio",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-filesystem@2026.1.14"],
		url: null,
		env: {},
		headers: {},
		enabled: true,
		exposure: "codemode",
		toolExposure: {},
		description: "Filesystem access tools",
		timeout: 30,
		oauth: null,
		authProvider: null,
		projectOverride: null,
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
	},
];

const DEMO_RUNTIME: McpRuntimeSnapshot = {
	servers: [
		{
			name: "filesystem",
			scope: "global",
			source: "~/.pi/agent/mcp.json",
			enabled: true,
			exposure: "codemode",
			transport: "npx @modelcontextprotocol/server-filesystem@2026.1.14",
			state: "connected",
			tools: [{ name: "read_file" }, { name: "write_file" }],
		},
		{
			name: "chrome-devtools",
			scope: "global",
			source: "~/.pi/agent/mcp.json",
			enabled: true,
			exposure: "codemode",
			transport: "npx chrome-devtools-mcp@1.6.0",
			state: "connected",
			tools: [{ name: "navigate" }, { name: "screenshot" }, { name: "evaluate" }],
		},
	],
	errors: [],
};

function runtimeStateLabel(state: McpRuntimeSnapshot["servers"][number]["state"]): string {
	if (state === "connected") return "已连接";
	if (state === "disabled") return "已禁用";
	if (state === "failed") return "失败";
	if (state === "disconnected") return "未连接";
	if (state === "needs-auth") return "需要登录";
	if (state === "starting") return "连接中";
	return "未知";
}

interface ServerDraft {
	name: string;
	transport: McpTransport;
	command: string;
	argsText: string;
	url: string;
	envText: string;
	headersText: string;
	enabled: boolean;
	exposure: McpExposure;
	toolExposureText: string;
	description: string;
	timeoutText: string;
	oauthClientId: string;
	oauthClientSecret: string;
	oauthClientSecretConfigured: boolean;
	oauthClientSecretTouched: boolean;
	oauthCallbackPort: string;
	oauthCallbackUrl: string;
	oauthScope: string;
	oauthClientName: string;
	oauthClientRegistration: "" | McpClientRegistration;
	oauthAuthServerMetadataUrl: string;
	authProvider: string;
}

type OverrideMode = "inherit" | "enabled" | "disabled";

interface OverrideDraft {
	name: string;
	enabled: OverrideMode;
	exposure: "inherit" | McpExposure;
	toolExposureText: string;
}

function emptyDraft(): ServerDraft {
	return {
		name: "",
		transport: "stdio",
		command: "",
		argsText: "",
		url: "",
		envText: "",
		headersText: "",
		enabled: true,
		exposure: "codemode",
		toolExposureText: "",
		description: "",
		timeoutText: "",
		oauthClientId: "",
		oauthClientSecret: "",
		oauthClientSecretConfigured: false,
		oauthClientSecretTouched: false,
		oauthCallbackPort: "",
		oauthCallbackUrl: "",
		oauthScope: "",
		oauthClientName: "",
		oauthClientRegistration: "",
		oauthAuthServerMetadataUrl: "",
		authProvider: "",
	};
}

function formatKeyValueLines(value: Record<string, string>): string {
	return Object.entries(value)
		.map(([key, entry]) => `${key}=${entry}`)
		.join("\n");
}

function formatToolExposureLines(value: Record<string, McpExposure>): string {
	return Object.entries(value)
		.map(([tool, exposure]) => `${tool}=${exposure}`)
		.join("\n");
}

function draftFrom(server: McpServerSummary): ServerDraft {
	return {
		name: server.name,
		transport: server.transport,
		command: server.command ?? "",
		argsText: server.args.join("\n"),
		url: server.url ?? "",
		envText: formatKeyValueLines(server.env),
		headersText: formatKeyValueLines(server.headers),
		enabled: server.enabled,
		exposure: server.exposure,
		toolExposureText: formatToolExposureLines(server.toolExposure),
		description: server.description ?? "",
		timeoutText: server.timeout === null ? "" : String(server.timeout),
		oauthClientId: server.oauth?.clientId ?? "",
		oauthClientSecret: "",
		oauthClientSecretConfigured: server.oauth?.clientSecretConfigured ?? false,
		oauthClientSecretTouched: false,
		oauthCallbackPort:
			server.oauth?.callbackPort === null || server.oauth?.callbackPort === undefined
				? ""
				: String(server.oauth.callbackPort),
		oauthCallbackUrl: server.oauth?.callbackUrl ?? "",
		oauthScope: server.oauth?.scope ?? "",
		oauthClientName: server.oauth?.clientName ?? "",
		oauthClientRegistration: server.oauth?.clientRegistration ?? "",
		oauthAuthServerMetadataUrl: server.oauth?.authServerMetadataUrl ?? "",
		authProvider: server.authProvider ?? "",
	};
}

function overrideDraftFrom(server: McpServerSummary): OverrideDraft {
	const override = server.projectOverride;
	return {
		name: server.name,
		enabled: override?.enabled === undefined ? "inherit" : override.enabled === false ? "disabled" : "enabled",
		exposure: override?.exposure ?? "inherit",
		toolExposureText: override?.toolExposure ? formatToolExposureLines(override.toolExposure) : "",
	};
}

function parseKeyValueLines(value: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const line of value.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const separator = trimmed.indexOf("=");
		if (separator <= 0) throw new Error(`环境变量或 Header 格式无效：${trimmed}`);
		result[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
	}
	return result;
}

function parseToolExposureLines(value: string): Record<string, McpExposure> {
	const result: Record<string, McpExposure> = {};
	for (const line of value.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const separator = trimmed.indexOf("=");
		if (separator <= 0) throw new Error(`工具曝光格式无效：${trimmed}`);
		const tool = trimmed.slice(0, separator).trim();
		const exposure = trimmed.slice(separator + 1).trim();
		if (exposure !== "codemode" && exposure !== "deferred" && exposure !== "direct" && exposure !== "hidden") {
			throw new Error(`工具 ${tool} 的 exposure 无效：${exposure}`);
		}
		result[tool] = exposure;
	}
	return result;
}

function parseOptionalInteger(value: string, label: string, maximum: number): number | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const number = Number(trimmed);
	if (!Number.isInteger(number) || number < 1 || number > maximum) {
		throw new Error(`${label}必须是 1-${maximum} 的整数`);
	}
	return number;
}

export function McpSettings({
	projectRoot,
	activeAgent,
	onConfigChanged,
}: {
	projectRoot: string | null;
	activeAgent: AgentInstanceLocator | null;
	onConfigChanged?: () => Promise<string | null> | string | null;
}) {
	const [servers, setServers] = useState<McpServerSummary[] | null>(demoMode ? DEMO_SERVERS : null);
	const [draft, setDraft] = useState<ServerDraft | null>(null);
	const [overrideDraft, setOverrideDraft] = useState<OverrideDraft | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [runtimeSnapshot, setRuntimeSnapshot] = useState<McpRuntimeSnapshot | null>(demoMode ? DEMO_RUNTIME : null);
	const [runtimeBusy, setRuntimeBusy] = useState(false);

	const refresh = useCallback(async (): Promise<void> => {
		if (demoMode) return;
		if (!("codepiddy" in window)) {
			setError("MCP 配置只在桌面客户端中可用。");
			return;
		}
		try {
			setServers(await window.codepiddy.listMcpServers(projectRoot ?? undefined));
			setError(null);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "读取 MCP 配置失败");
		}
	}, [projectRoot]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const refreshRuntime = useCallback(async (): Promise<void> => {
		if (demoMode) {
			setRuntimeSnapshot(DEMO_RUNTIME);
			return;
		}
		if (!("codepiddy" in window)) return;
		setRuntimeBusy(true);
		try {
			const result = await window.codepiddy.runMcpAction({ action: "list" });
			setRuntimeSnapshot(result.snapshot ?? { servers: [], errors: [result.output] });
			setError(null);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "读取 MCP 运行状态失败");
		} finally {
			setRuntimeBusy(false);
		}
	}, []);

	useEffect(() => {
		void refreshRuntime();
	}, [refreshRuntime]);

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

	async function announceChange(message: string): Promise<void> {
		let refreshMessage: string | null = null;
		try {
			refreshMessage = (await onConfigChanged?.()) ?? null;
		} catch (caught) {
			refreshMessage = caught instanceof Error ? caught.message : "刷新当前 Agent 失败";
		}
		setNotice(refreshMessage ? `${message} ${refreshMessage}` : message);
		void refreshRuntime();
	}

	async function saveServer(): Promise<void> {
		if (!draft) return;
		const timeout = parseOptionalInteger(draft.timeoutText, "超时", 3600);
		const oauthCallbackPort = parseOptionalInteger(draft.oauthCallbackPort, "OAuth 回调端口", 65535);
		const input: McpServerInput = {
			name: draft.name,
			transport: draft.transport,
			...(draft.transport === "stdio"
				? {
						command: draft.command,
						args: draft.argsText
							.split("\n")
							.map((line) => line.trim())
							.filter(Boolean),
						env: parseKeyValueLines(draft.envText),
					}
				: { url: draft.url, headers: parseKeyValueLines(draft.headersText) }),
			enabled: draft.enabled,
			exposure: draft.exposure,
			toolExposure: parseToolExposureLines(draft.toolExposureText),
			description: draft.description,
			timeout: timeout ?? 0,
			authProvider: draft.authProvider,
			oauth:
				draft.transport === "http"
					? {
							clientId: draft.oauthClientId,
							...(draft.oauthClientSecretTouched ? { clientSecret: draft.oauthClientSecret } : {}),
							callbackPort: oauthCallbackPort,
							callbackUrl: draft.oauthCallbackUrl,
							scope: draft.oauthScope,
							clientName: draft.oauthClientName,
							clientRegistration: draft.oauthClientRegistration || null,
							authServerMetadataUrl: draft.oauthAuthServerMetadataUrl,
						}
					: null,
		};
		if (demoMode) {
			setServers((current) => {
				const previous = (current ?? []).find((server) => server.name === input.name);
				const next = (current ?? []).filter((server) => server.name !== input.name);
				const created: McpServerSummary = {
					name: input.name,
					transport: input.transport,
					command: input.command ?? null,
					args: input.args ?? [],
					url: input.url ?? null,
					env: input.env ?? {},
					headers: input.headers ?? {},
					enabled: input.enabled !== false,
					exposure: input.exposure ?? "codemode",
					toolExposure: input.toolExposure ?? {},
					description: input.description?.trim() || null,
					timeout: input.timeout && input.timeout > 0 ? input.timeout : null,
					oauth:
						input.oauth && input.transport === "http"
							? {
									clientId: input.oauth.clientId?.trim() || null,
									clientSecretConfigured:
										(input.oauth.clientSecret?.trim().length ?? 0) > 0 ||
										(previous?.oauth?.clientSecretConfigured ?? false),
									callbackPort: input.oauth.callbackPort ?? null,
									callbackUrl: input.oauth.callbackUrl?.trim() || null,
									scope: input.oauth.scope?.trim() || null,
									clientName: input.oauth.clientName?.trim() || null,
									clientRegistration: input.oauth.clientRegistration ?? null,
									authServerMetadataUrl: input.oauth.authServerMetadataUrl?.trim() || null,
								}
							: null,
					authProvider: input.authProvider?.trim() || null,
					projectOverride: previous?.projectOverride ?? null,
				};
				return [...next, created].sort((left, right) => left.name.localeCompare(right.name));
			});
			setDraft(null);
			setNotice("MCP 服务已保存。");
			return;
		}
		if (!("codepiddy" in window)) return;
		setBusy("save-server");
		try {
			setServers(await window.codepiddy.saveMcpServer(input));
			setDraft(null);
			setError(null);
			await announceChange("MCP 服务已保存。");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "保存 MCP 配置失败");
		} finally {
			setBusy(null);
		}
	}

	async function saveOverride(): Promise<void> {
		if (!overrideDraft || !projectRoot) return;
		const parsedToolExposure = parseToolExposureLines(overrideDraft.toolExposureText);
		const input: McpProjectOverrideInput = {
			projectRoot,
			name: overrideDraft.name,
			enabled: overrideDraft.enabled === "inherit" ? null : overrideDraft.enabled === "enabled",
			exposure: overrideDraft.exposure === "inherit" ? null : overrideDraft.exposure,
			toolExposure: Object.keys(parsedToolExposure).length > 0 ? parsedToolExposure : null,
		};
		if (demoMode) {
			setServers((current) =>
				(current ?? []).map((server) =>
					server.name === input.name
						? {
								...server,
								projectOverride: {
									...(input.enabled === null ? {} : { enabled: input.enabled }),
									...(input.exposure === null ? {} : { exposure: input.exposure }),
									...(input.toolExposure === null ? {} : { toolExposure: input.toolExposure }),
								},
							}
						: server,
				),
			);
			setOverrideDraft(null);
			setNotice("项目覆盖已保存。");
			return;
		}
		if (!("codepiddy" in window)) return;
		setBusy("save-override");
		try {
			setServers(await window.codepiddy.saveMcpProjectOverride(input));
			setOverrideDraft(null);
			setError(null);
			await announceChange("项目覆盖已保存。");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "保存项目覆盖失败");
		} finally {
			setBusy(null);
		}
	}

	async function removeServer(name: string): Promise<void> {
		if (!window.confirm(`删除 MCP 服务「${name}」？`)) return;
		if (demoMode) {
			setServers((current) => (current ?? []).filter((server) => server.name !== name));
			return;
		}
		if (!("codepiddy" in window)) return;
		setBusy(`delete:${name}`);
		try {
			setServers(await window.codepiddy.deleteMcpServer(name));
			setError(null);
			await announceChange("MCP 服务已删除。");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "删除 MCP 配置失败");
		} finally {
			setBusy(null);
		}
	}

	async function removeOverride(name: string): Promise<void> {
		if (!projectRoot) return;
		if (demoMode) {
			setServers((current) =>
				(current ?? []).map((server) => (server.name === name ? { ...server, projectOverride: null } : server)),
			);
			setOverrideDraft(null);
			return;
		}
		if (!("codepiddy" in window)) return;
		setBusy(`delete-override:${name}`);
		try {
			setServers(await window.codepiddy.deleteMcpProjectOverride({ projectRoot, name }));
			setOverrideDraft(null);
			setError(null);
			await announceChange("项目覆盖已移除。");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "移除项目覆盖失败");
		} finally {
			setBusy(null);
		}
	}

	async function runAction(name: string, action: "login" | "logout"): Promise<void> {
		if (demoMode) {
			setNotice(action === "login" ? `${name} 已登录。` : `${name} 已退出。`);
			return;
		}
		if (!("codepiddy" in window)) return;
		setBusy(`${action}:${name}`);
		try {
			const result = await window.codepiddy.runMcpAction({ action, name });
			setError(null);
			await announceChange(result.output || (action === "login" ? "登录完成。" : "已退出。"));
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : `MCP ${action} 失败`);
		} finally {
			setBusy(null);
		}
	}

	const draftServerExists = Boolean(draft && (servers ?? []).some((server) => server.name === draft.name));

	async function reconnectActiveAgent(): Promise<void> {
		if (!activeAgent || !("codepiddy" in window)) return;
		setBusy("reconnect-agent");
		try {
			await window.codepiddy.reconnectAgent(activeAgent);
			setNotice("当前 Agent 已重连，MCP 配置已重新加载。");
			setError(null);
			void refreshRuntime();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "重连 Agent 失败");
		} finally {
			setBusy(null);
		}
	}

	return (
		<section className="settings-card mcp-settings-card">
			<div className="settings-card-heading">
				<div>
					<h2>MCP 服务</h2>
					<p>
						读写 Pi 原生 <code>mcp.json</code> 和项目级 <code>.pi/mcp.json</code>。修改后新启动或重连的 Agent
						生效。
					</p>
				</div>
				<button className="primary-button" type="button" onClick={() => setDraft(emptyDraft())}>
					<Plus size={14} strokeWidth={2} /> 添加服务
				</button>
			</div>

			<div className="mcp-settings-toolbar">
				<div>
					<strong>连接控制</strong>
					<small>{activeAgent ? "重连当前 Agent 会重新连接全部 MCP 服务。" : "打开一个 Agent 后可重连。"}</small>
				</div>
				<div className="mcp-settings-actions">
					<button
						className="secondary-button"
						type="button"
						disabled={runtimeBusy}
						onClick={() => void refreshRuntime()}
					>
						<Activity size={14} strokeWidth={2} /> 刷新状态
					</button>
					<button
						className="secondary-button"
						type="button"
						disabled={!activeAgent || busy !== null}
						onClick={() => void reconnectActiveAgent()}
					>
						<RefreshCw size={14} strokeWidth={2} /> 重连当前 Agent
					</button>
				</div>
			</div>

			<div className="mcp-runtime-panel">
				<div className="mcp-runtime-heading">
					<div>
						<strong>运行状态</strong>
						<small>来自 Pi 原生 `pi mcp list --json`，不代表设置是否已保存。</small>
					</div>
					{runtimeBusy ? <span className="settings-status">读取中</span> : null}
				</div>
				{runtimeSnapshot?.servers.length ? (
					<div className="mcp-runtime-list">
						{runtimeSnapshot.servers.map((server) => (
							<div className={`mcp-runtime-row is-${server.state}`} key={server.name}>
								<span className="mcp-runtime-dot" aria-hidden="true" />
								<span className="mcp-runtime-copy">
									<strong>{server.name}</strong>
									<small title={server.transport}>{server.transport}</small>
								</span>
								<span className="mcp-runtime-tools">
									{server.tools.length > 0 ? `${server.tools.length} 个工具` : "无工具"}
								</span>
								<span className={`mcp-runtime-state is-${server.state}`}>
									{runtimeStateLabel(server.state)}
								</span>
								{server.error ? <StateBlock compact tone="error" title={server.error} /> : null}
							</div>
						))}
					</div>
				) : (
					<p className="work-change-note">{runtimeSnapshot?.errors[0] || "没有可显示的 MCP 运行状态。"}</p>
				)}
				{runtimeSnapshot && runtimeSnapshot.errors.length > 1
					? runtimeSnapshot.errors
							.slice(1)
							.map((entry) => <StateBlock compact tone="error" title={entry} key={entry} />)
					: null}
			</div>

			<div className="mcp-server-list">
				{(servers ?? []).map((server) => {
					const override = server.projectOverride;
					const effectiveEnabled = override?.enabled ?? server.enabled;
					const effectiveExposure = override?.exposure ?? server.exposure;
					return (
						<div className={`mcp-server-row${effectiveEnabled ? "" : " is-disabled"}`} key={server.name}>
							<span className="mcp-server-icon">
								{server.transport === "http" ? (
									<Globe size={14} strokeWidth={2} />
								) : (
									<Plug size={14} strokeWidth={2} />
								)}
							</span>
							<span className="mcp-server-copy">
								<strong>{server.name}</strong>
								<small title={server.description ?? undefined}>
									{server.description ||
										(server.transport === "http"
											? (server.url ?? "")
											: [server.command, ...server.args].filter(Boolean).join(" "))}
								</small>
							</span>
							<span className="mcp-server-badges">
								<span className="mcp-server-badge">{server.transport === "http" ? "HTTP" : "stdio"}</span>
								<span className="mcp-server-badge">{effectiveExposure}</span>
								{!effectiveEnabled ? <span className="mcp-server-badge is-muted">禁用</span> : null}
								{override ? <span className="mcp-server-badge is-project">项目覆盖</span> : null}
								{server.oauth ? <span className="mcp-server-badge">OAuth</span> : null}
							</span>
							<span className="mcp-server-actions">
								<button
									type="button"
									className="work-panel-icon-button"
									aria-label="配置项目覆盖"
									title={projectRoot ? "项目覆盖" : "打开项目后可配置"}
									disabled={!projectRoot || busy !== null}
									onClick={() => setOverrideDraft(overrideDraftFrom(server))}
								>
									<SlidersHorizontal size={14} strokeWidth={2} />
								</button>
								<button
									type="button"
									className="work-panel-icon-button"
									aria-label="编辑 MCP 服务"
									title="编辑"
									onClick={() => setDraft(draftFrom(server))}
								>
									<Pencil size={14} strokeWidth={2} />
								</button>
								<button
									type="button"
									className="work-panel-icon-button"
									aria-label="删除 MCP 服务"
									title="删除"
									disabled={busy !== null}
									onClick={() => void removeServer(server.name)}
								>
									<Trash2 size={14} strokeWidth={2} />
								</button>
							</span>
						</div>
					);
				})}
				{servers !== null && servers.length === 0 ? (
					<p className="work-change-note">还没有配置 MCP 服务。</p>
				) : null}
			</div>

			{draft ? (
				<div className="mcp-editor">
					<div className="mcp-editor-heading">
						<div>
							<strong>{draft.name || "新 MCP 服务"}</strong>
							<small>全局服务定义</small>
						</div>
					</div>

					<section className="mcp-editor-section">
						<div className="mcp-editor-section-heading">
							<h3>连接</h3>
							<p>定义服务如何启动或连接。</p>
						</div>
						<div className="provider-editor-grid">
							<label className="settings-field">
								<span>名称</span>
								<input
									value={draft.name}
									placeholder="chrome-devtools"
									onChange={(event) => setDraft({ ...draft, name: event.target.value })}
								/>
							</label>
							<div className="settings-field">
								<span>类型</span>
								<SelectMenu
									label="MCP 服务类型"
									value={draft.transport}
									options={[
										{ value: "stdio", label: "stdio", description: "本地命令" },
										{ value: "http", label: "HTTP", description: "远程 streamable HTTP" },
									]}
									onChange={(value) => setDraft({ ...draft, transport: value as McpTransport })}
								/>
							</div>
						</div>
						{draft.transport === "stdio" ? (
							<>
								<label className="settings-field">
									<span>命令</span>
									<input
										value={draft.command}
										placeholder="npx"
										onChange={(event) => setDraft({ ...draft, command: event.target.value })}
									/>
								</label>
								<label className="settings-field">
									<span>参数（每行一个）</span>
									<textarea
										value={draft.argsText}
										rows={3}
										placeholder={"-y\nchrome-devtools-mcp@1.6.0"}
										onChange={(event) => setDraft({ ...draft, argsText: event.target.value })}
									/>
								</label>
								<label className="settings-field">
									<span>环境变量（每行 KEY=VALUE）</span>
									<textarea
										value={draft.envText}
										rows={3}
										onChange={(event) => setDraft({ ...draft, envText: event.target.value })}
									/>
								</label>
							</>
						) : (
							<>
								<label className="settings-field">
									<span>URL</span>
									<input
										value={draft.url}
										placeholder="https://example.com/mcp"
										onChange={(event) => setDraft({ ...draft, url: event.target.value })}
									/>
								</label>
								<label className="settings-field">
									<span>Headers（每行 KEY=VALUE）</span>
									<textarea
										value={draft.headersText}
										rows={3}
										onChange={(event) => setDraft({ ...draft, headersText: event.target.value })}
									/>
								</label>
							</>
						)}
					</section>

					<section className="mcp-editor-section">
						<div className="mcp-editor-section-heading">
							<h3>行为</h3>
							<p>控制启用状态、上下文暴露和连接超时。</p>
						</div>
						<div className="provider-editor-grid">
							<SettingsCheckbox
								className="mcp-checkbox-field"
								checked={draft.enabled}
								onChange={(enabled) => setDraft({ ...draft, enabled })}
							>
								启用这个 MCP 服务
							</SettingsCheckbox>
							<label className="settings-field">
								<span>超时（秒）</span>
								<input
									value={draft.timeoutText}
									inputMode="numeric"
									placeholder="30"
									onChange={(event) => setDraft({ ...draft, timeoutText: event.target.value })}
								/>
							</label>
						</div>
						<div className="settings-field">
							<span>默认 exposure</span>
							<SelectMenu
								label="MCP exposure"
								value={draft.exposure}
								options={EXPOSURE_OPTIONS.map((option) => ({
									value: option.value,
									label: option.label,
									description: option.description,
								}))}
								onChange={(value) => setDraft({ ...draft, exposure: value as McpExposure })}
							/>
						</div>
						<label className="settings-field">
							<span>服务说明</span>
							<input
								value={draft.description}
								placeholder="浏览器检查与自动化工具"
								onChange={(event) => setDraft({ ...draft, description: event.target.value })}
							/>
						</label>
					</section>

					<section className="mcp-editor-section">
						<div className="mcp-editor-section-heading">
							<h3>工具级 exposure</h3>
							<p>
								每行一个工具，格式为 <code>tool=direct</code>；支持 <code>*</code> 通配。
							</p>
						</div>
						<label className="settings-field">
							<span>工具覆盖（每行 TOOL=EXPOSURE）</span>
							<textarea
								value={draft.toolExposureText}
								rows={4}
								placeholder={"search=direct\n*=deferred"}
								onChange={(event) => setDraft({ ...draft, toolExposureText: event.target.value })}
							/>
						</label>
					</section>

					{draft.transport === "http" ? (
						<section className="mcp-editor-section">
							<div className="mcp-editor-section-heading">
								<h3>OAuth</h3>
								<p>远程 MCP 需要浏览器授权时填写；stdio 服务通常不需要。</p>
							</div>
							<div className="provider-editor-grid">
								<label className="settings-field">
									<span>Client ID</span>
									<input
										value={draft.oauthClientId}
										onChange={(event) => setDraft({ ...draft, oauthClientId: event.target.value })}
									/>
								</label>
								<label className="settings-field">
									<span>Client Secret</span>
									<input
										type="password"
										value={draft.oauthClientSecret}
										placeholder={draft.oauthClientSecretConfigured ? "已配置，留空保持不变" : "可选"}
										onChange={(event) =>
											setDraft({
												...draft,
												oauthClientSecret: event.target.value,
												oauthClientSecretTouched: true,
											})
										}
									/>
								</label>
								<label className="settings-field">
									<span>回调端口</span>
									<input
										value={draft.oauthCallbackPort}
										inputMode="numeric"
										onChange={(event) => setDraft({ ...draft, oauthCallbackPort: event.target.value })}
									/>
								</label>
								<label className="settings-field">
									<span>回调地址</span>
									<input
										value={draft.oauthCallbackUrl}
										placeholder="http://localhost:3334/callback"
										onChange={(event) => setDraft({ ...draft, oauthCallbackUrl: event.target.value })}
									/>
								</label>
								<label className="settings-field">
									<span>Scope</span>
									<input
										value={draft.oauthScope}
										onChange={(event) => setDraft({ ...draft, oauthScope: event.target.value })}
									/>
								</label>
								<label className="settings-field">
									<span>Client Name</span>
									<input
										value={draft.oauthClientName}
										onChange={(event) => setDraft({ ...draft, oauthClientName: event.target.value })}
									/>
								</label>
							</div>
							<div className="provider-editor-grid">
								<div className="settings-field">
									<span>客户端注册</span>
									<SelectMenu
										label="OAuth 客户端注册"
										value={draft.oauthClientRegistration}
										options={[
											{ value: "", label: "未设置", description: "让 Pi 按服务端能力选择" },
											{ value: "dcr", label: "dcr", description: "动态客户端注册" },
											{ value: "cimd", label: "cimd", description: "Client ID Metadata Document" },
										]}
										onChange={(value) =>
											setDraft({
												...draft,
												oauthClientRegistration: value as "" | McpClientRegistration,
											})
										}
									/>
								</div>
								<label className="settings-field">
									<span>Auth Provider</span>
									<input
										value={draft.authProvider}
										placeholder="例如 openai"
										onChange={(event) => setDraft({ ...draft, authProvider: event.target.value })}
									/>
								</label>
							</div>
							<label className="settings-field">
								<span>Auth Server Metadata URL</span>
								<input
									value={draft.oauthAuthServerMetadataUrl}
									onChange={(event) => setDraft({ ...draft, oauthAuthServerMetadataUrl: event.target.value })}
								/>
							</label>
							<div className="mcp-oauth-actions">
								<small>登录和退出使用已保存配置；修改字段后先保存。</small>
								<button
									className="secondary-button"
									type="button"
									disabled={!draftServerExists || busy !== null}
									onClick={() => void runAction(draft.name, "login")}
								>
									<LogIn size={14} strokeWidth={2} /> 登录
								</button>
								<button
									className="secondary-button"
									type="button"
									disabled={!draftServerExists || busy !== null}
									onClick={() => void runAction(draft.name, "logout")}
								>
									<LogOut size={14} strokeWidth={2} /> 退出
								</button>
							</div>
						</section>
					) : null}

					<div className="settings-actions">
						<button
							className="primary-button"
							type="button"
							disabled={busy !== null}
							onClick={() => void saveServer()}
						>
							保存
						</button>
						<button className="secondary-button" type="button" onClick={() => setDraft(null)}>
							取消
						</button>
					</div>
				</div>
			) : null}

			{overrideDraft ? (
				<div className="mcp-editor mcp-override-editor">
					<div className="mcp-editor-heading">
						<div>
							<strong>{overrideDraft.name}</strong>
							<small>项目级覆盖 · .pi/mcp.json</small>
						</div>
						<SlidersHorizontal size={16} strokeWidth={2} aria-hidden="true" />
					</div>
					<div className="provider-editor-grid">
						<div className="settings-field">
							<span>启用状态</span>
							<SelectMenu
								label="项目启用状态"
								value={overrideDraft.enabled}
								options={[
									{ value: "inherit", label: "继承全局" },
									{ value: "enabled", label: "启用" },
									{ value: "disabled", label: "禁用" },
								]}
								onChange={(value) => setOverrideDraft({ ...overrideDraft, enabled: value as OverrideMode })}
							/>
						</div>
						<div className="settings-field">
							<span>Exposure</span>
							<SelectMenu
								label="项目 exposure"
								value={overrideDraft.exposure}
								options={[
									{ value: "inherit", label: "继承全局" },
									...EXPOSURE_OPTIONS.map((option) => ({
										value: option.value,
										label: option.label,
										description: option.description,
									})),
								]}
								onChange={(value) =>
									setOverrideDraft({ ...overrideDraft, exposure: value as "inherit" | McpExposure })
								}
							/>
						</div>
					</div>
					<label className="settings-field">
						<span>工具级 exposure（留空继承全局）</span>
						<textarea
							value={overrideDraft.toolExposureText}
							rows={3}
							placeholder={"search=direct\n*=deferred"}
							onChange={(event) => setOverrideDraft({ ...overrideDraft, toolExposureText: event.target.value })}
						/>
					</label>
					<div className="settings-actions">
						<button
							className="primary-button"
							type="button"
							disabled={busy !== null}
							onClick={() => void saveOverride()}
						>
							保存覆盖
						</button>
						<button
							className="secondary-button"
							type="button"
							disabled={busy !== null}
							onClick={() => void removeOverride(overrideDraft.name)}
						>
							移除覆盖
						</button>
						<button className="secondary-button" type="button" onClick={() => setOverrideDraft(null)}>
							取消
						</button>
					</div>
				</div>
			) : null}
		</section>
	);
}
