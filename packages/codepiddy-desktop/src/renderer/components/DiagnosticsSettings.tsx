import type { AgentInstanceLocator, DiagnosticsExportResult, DiagnosticsInfo } from "@codepiddy/shared";
import { Download, FileArchive, LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ModalShell } from "./modal-shell.tsx";
import { SettingsCheckbox } from "./settings-checkbox.tsx";
import { showSettingsToast } from "./settings-toast-store.ts";

const DEMO_INFO: DiagnosticsInfo = {
	codepiddyVersion: "0.1.0",
	piRuntime: {
		bundledVersion: "1.0.1",
		currentVersion: "1.0.1",
		rollbackVersion: null,
		runningVersion: "1.0.1",
		latestVersion: null,
		updateAvailable: false,
		restartRequired: false,
		npmAvailable: true,
		warning: null,
	},
	platform: "win32",
	architecture: "x64",
	electronVersion: "44.3.0",
	nodeVersion: "22.19.0",
	osRelease: "10.0.26100",
	osVersion: "Windows 11",
	debugLogPath: "C:\\Users\\demo\\.pi\\agent\\pi-debug.log",
	mcpLogPath: "C:\\Users\\demo\\.pi\\agent\\mcp.log",
};

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DiagnosticsSettings({
	projectRoot,
	activeAgent,
	uiError,
}: {
	projectRoot: string | null;
	activeAgent: AgentInstanceLocator | null;
	uiError: string | null;
}) {
	const [info, setInfo] = useState<DiagnosticsInfo | null>(null);
	const [loading, setLoading] = useState(false);
	const [includeSession, setIncludeSession] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [exporting, setExporting] = useState(false);

	const loadInfo = useCallback(async (): Promise<void> => {
		setLoading(true);
		try {
			setInfo("codepiddy" in window ? await window.codepiddy.getDiagnosticsInfo() : DEMO_INFO);
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "读取诊断信息失败", "error");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadInfo();
	}, [loadInfo]);

	useEffect(() => {
		if (!activeAgent) setIncludeSession(false);
	}, [activeAgent]);

	async function exportPackage(): Promise<void> {
		if (exporting) return;
		setExporting(true);
		try {
			if (!("codepiddy" in window)) {
				await new Promise((resolve) => setTimeout(resolve, 450));
				const result: DiagnosticsExportResult = {
					filePath: "C:\\Users\\demo\\Downloads\\codepiddy-diagnostics-demo.zip",
					createdAt: new Date().toISOString(),
					sizeBytes: 184_320,
					includedSession: includeSession,
				};
				setConfirmOpen(false);
				showSettingsToast("诊断包已导出", "success", {
					detail: `${formatBytes(result.sizeBytes)} · ${result.includedSession ? "包含脱敏会话" : "不包含会话"}`,
					path: result.filePath,
				});
				return;
			}
			const next = await window.codepiddy.exportDiagnostics({
				includeSession,
				...(activeAgent ? { agent: activeAgent } : {}),
				...(projectRoot ? { projectRoot } : {}),
				...(uiError ? { uiError } : {}),
			});
			setConfirmOpen(false);
			if (!next) return;
			showSettingsToast("诊断包已导出", "success", {
				detail: `${formatBytes(next.sizeBytes)} · ${next.includedSession ? "包含脱敏会话" : "不包含会话"}`,
				path: next.filePath,
			});
		} catch (caught) {
			const message = caught instanceof Error ? caught.message : "导出诊断包失败";
			showSettingsToast(message, "error");
		} finally {
			setExporting(false);
		}
	}

	const piRuntime = info?.piRuntime ?? null;

	return (
		<section className="settings-card diagnostics-settings-card">
			<div className="settings-card-heading">
				<div>
					<h2>诊断</h2>
					<p>导出 CodePIddy、Pi、系统环境、Agent、Provider、MCP、信任状态和日志，便于定位问题。</p>
				</div>
				<button className="secondary-button" type="button" disabled={loading} onClick={() => void loadInfo()}>
					<RefreshCw size={13} strokeWidth={2} /> {loading ? "刷新中…" : "刷新状态"}
				</button>
			</div>

			{info ? (
				<div className="diagnostics-version-grid">
					<div>
						<span>CodePIddy</span>
						<strong>v{info.codepiddyVersion}</strong>
					</div>
					<div>
						<span>Pi 运行时</span>
						<strong>v{piRuntime?.runningVersion ?? "unknown"}</strong>
					</div>
					<div>
						<span>Electron</span>
						<strong>{info.electronVersion ? `v${info.electronVersion}` : "—"}</strong>
					</div>
					<div>
						<span>Node</span>
						<strong>v{info.nodeVersion}</strong>
					</div>
					<div>
						<span>系统</span>
						<strong>{info.osVersion || info.platform}</strong>
					</div>
					<div>
						<span>架构</span>
						<strong>{info.architecture}</strong>
					</div>
				</div>
			) : null}

			<div className="diagnostics-log-paths">
				<div>
					<span>Pi debug log</span>
					<code>{info?.debugLogPath ?? "读取中…"}</code>
				</div>
				<div>
					<span>MCP log</span>
					<code>{info?.mcpLogPath ?? "读取中…"}</code>
				</div>
			</div>

			<div className="diagnostics-session-option">
				<SettingsCheckbox
					className="diagnostics-session-checkbox-control"
					checked={includeSession}
					disabled={!activeAgent}
					labelClickable={false}
					onChange={setIncludeSession}
				>
					<strong>包含当前会话 JSONL</strong>
					<small>
						{activeAgent
							? "会移除常见凭据字段，但工具输出和自由文本仍可能包含敏感信息。"
							: "当前没有可用的 Agent 会话；仍可导出环境、状态和日志。"}
					</small>
				</SettingsCheckbox>
			</div>

			<div className="settings-actions">
				<button className="primary-button" type="button" disabled={loading} onClick={() => setConfirmOpen(true)}>
					<Download size={13} strokeWidth={2} /> 导出诊断包
				</button>
			</div>
			<small>诊断包只保存在本机，不会自动上传。</small>

			{confirmOpen ? (
				<ModalShell
					title="导出诊断包"
					description="ZIP 会保存在本机，CodePIddy 不会上传。导出后请在分享前自行检查内容。"
					onClose={() => setConfirmOpen(false)}
					closeDisabled={exporting}
					width="sm"
					className="diagnostics-export-modal"
					footer={
						<>
							<button type="button" disabled={exporting} onClick={() => setConfirmOpen(false)}>
								取消
							</button>
							<button
								className="primary-button"
								type="button"
								disabled={exporting}
								onClick={() => void exportPackage()}
							>
								{exporting ? <LoaderCircle className="diagnostics-spinner" size={14} strokeWidth={2} /> : null}
								{exporting ? "导出中…" : "选择位置并导出"}
							</button>
						</>
					}
				>
					<div className="diagnostics-privacy">
						<ShieldAlert size={16} strokeWidth={2} />
						<div>
							<strong>隐私确认</strong>
							<p>日志和会话可能包含文件路径、命令输出和凭据片段。基础脱敏不能保证覆盖所有自由文本。</p>
						</div>
					</div>
					<div className="diagnostics-export-summary">
						<FileArchive size={16} strokeWidth={2} />
						<div>
							<span>内容</span>
							<strong>{includeSession ? "环境、状态、日志、脱敏会话" : "环境、状态和日志"}</strong>
						</div>
					</div>
				</ModalShell>
			) : null}
		</section>
	);
}
