import type { McpServerInput, McpServerSummary, McpTransport } from "@codepiddy/shared";
import { Globe, Pencil, Plug, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SelectMenu } from "./select-menu.tsx";

const demoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo");

const DEMO_SERVERS: McpServerSummary[] = [
	{
		name: "chrome-devtools",
		transport: "stdio",
		command: "npx",
		args: ["-y", "chrome-devtools-mcp@1.6.0"],
		url: null,
		env: {},
		headers: {},
		disabled: false,
		source: "global",
	},
];

interface Draft {
	name: string;
	transport: McpTransport;
	command: string;
	argsText: string;
	url: string;
	envText: string;
	headersText: string;
	disabled: boolean;
}

function emptyDraft(): Draft {
	return {
		name: "",
		transport: "stdio",
		command: "",
		argsText: "",
		url: "",
		envText: "",
		headersText: "",
		disabled: false,
	};
}

function draftFrom(server: McpServerSummary): Draft {
	return {
		name: server.name,
		transport: server.transport,
		command: server.command ?? "",
		argsText: server.args.join("\n"),
		url: server.url ?? "",
		envText: Object.entries(server.env)
			.map(([key, value]) => `${key}=${value}`)
			.join("\n"),
		headersText: Object.entries(server.headers)
			.map(([key, value]) => `${key}=${value}`)
			.join("\n"),
		disabled: server.disabled,
	};
}

function parseKeyValueLines(value: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const line of value.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const separator = trimmed.indexOf("=");
		if (separator <= 0) continue;
		result[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
	}
	return result;
}

export function McpSettings() {
	const [servers, setServers] = useState<McpServerSummary[] | null>(demoMode ? DEMO_SERVERS : null);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const refresh = useCallback(async (): Promise<void> => {
		if (demoMode) return;
		if (!("codepiddy" in window)) {
			setError("MCP 配置只在桌面客户端中可用。");
			return;
		}
		try {
			setServers(await window.codepiddy.listMcpServers());
			setError(null);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "读取 MCP 配置失败");
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	async function save(): Promise<void> {
		if (!draft) return;
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
			disabled: draft.disabled,
		};
		if (demoMode) {
			setServers((current) => [
				...(current ?? []).filter((server) => server.name !== input.name),
				{
					name: input.name,
					transport: input.transport,
					command: input.command ?? null,
					args: input.args ?? [],
					url: input.url ?? null,
					env: input.env ?? {},
					headers: input.headers ?? {},
					disabled: input.disabled === true,
					source: "global",
				},
			]);
			setDraft(null);
			return;
		}
		if (!("codepiddy" in window)) return;
		setBusy(true);
		try {
			setServers(await window.codepiddy.saveMcpServer(input));
			setDraft(null);
			setError(null);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "保存 MCP 配置失败");
		} finally {
			setBusy(false);
		}
	}

	async function remove(name: string): Promise<void> {
		if (demoMode) {
			setServers((current) => (current ?? []).filter((server) => server.name !== name));
			return;
		}
		if (!("codepiddy" in window)) return;
		setBusy(true);
		try {
			setServers(await window.codepiddy.deleteMcpServer(name));
			setError(null);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "删除 MCP 配置失败");
		} finally {
			setBusy(false);
		}
	}

	const builtinServer = (servers ?? []).find((server) => server.source === "builtin") ?? null;
	const customServers = (servers ?? []).filter((server) => server.source !== "builtin");

	return (
		<section className="settings-card mcp-settings-card">
			<div className="settings-card-heading">
				<div>
					<h2>MCP 服务</h2>
					<p>
						读写 Pi 原生 <code>~/.pi/agent/mcp.json</code>。修改后新启动或重置的 Agent
						生效；工具调用仍受「默认权限 · MCP 工具」约束。
					</p>
				</div>
				<button className="primary-button" type="button" onClick={() => setDraft(emptyDraft())}>
					<Plus size={14} strokeWidth={2} /> 添加服务
				</button>
			</div>

			<div className="mcp-server-list">
				<div className="mcp-server-row is-builtin">
					<span className="mcp-server-icon">
						<Plug size={14} strokeWidth={2} />
					</span>
					<span className="mcp-server-copy">
						<strong>web_search</strong>
						<small>
							内置 Tavily MCP，由 Pi 原生 mcp.json 管理
							{builtinServer?.disabled ? "；Key 未配置，当前已禁用" : ""}
						</small>
					</span>
					<span className="mcp-server-badge">{builtinServer?.disabled ? "待配置" : "内置"}</span>
				</div>
				{customServers.map((server) => (
					<div className={`mcp-server-row${server.disabled ? " is-disabled" : ""}`} key={server.name}>
						<span className="mcp-server-icon">
							{server.transport === "http" ? (
								<Globe size={14} strokeWidth={2} />
							) : (
								<Plug size={14} strokeWidth={2} />
							)}
						</span>
						<span className="mcp-server-copy">
							<strong>{server.name}</strong>
							<small
								title={
									server.transport === "http" ? (server.url ?? "") : [server.command, ...server.args].join(" ")
								}
							>
								{server.transport === "http"
									? (server.url ?? "")
									: [server.command, ...server.args].filter(Boolean).join(" ")}
							</small>
						</span>
						<span className="mcp-server-badge">{server.transport === "http" ? "HTTP" : "stdio"}</span>
						{server.disabled ? <span className="mcp-server-badge is-muted">已禁用</span> : null}
						<span className="mcp-server-actions">
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
								disabled={busy}
								onClick={() => void remove(server.name)}
							>
								<Trash2 size={14} strokeWidth={2} />
							</button>
						</span>
					</div>
				))}
				{servers !== null && customServers.length === 0 ? (
					<p className="work-change-note">还没有自定义 MCP 服务。web_search 是内置的 Tavily MCP。</p>
				) : null}
			</div>

			{draft ? (
				<div className="mcp-editor">
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
								{ value: "stdio", label: "stdio（本地命令）" },
								{ value: "http", label: "HTTP（远程地址）" },
							]}
							onChange={(value) => setDraft({ ...draft, transport: value as McpTransport })}
						/>
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
					<label className="settings-checkbox">
						<input
							type="checkbox"
							checked={draft.disabled}
							onChange={(event) => setDraft({ ...draft, disabled: event.target.checked })}
						/>
						<span>暂时禁用这个服务</span>
					</label>
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

			{error ? (
				<p className="permission-settings-error" role="alert">
					{error}
				</p>
			) : null}
		</section>
	);
}
