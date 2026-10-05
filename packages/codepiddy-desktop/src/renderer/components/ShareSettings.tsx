import type { AuthProviderSummary, GitHubCliSource, ShareSettingsStatus } from "@codepiddy/shared";
import { Check, Copy, ExternalLink, FolderOpen, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import githubCliIconUrl from "../../../../../codepiddy-icons/github-cli.svg?url";
import radiusIconUrl from "../../../../../codepiddy-icons/radius.svg?url";
import { StateBlock } from "./state-block.tsx";

const DEMO_SHARE_SETTINGS: ShareSettingsStatus = {
	radius: {
		id: "radius",
		name: "Radius",
		configured: false,
		authType: null,
		source: null,
		sourceLabel: null,
		methods: [
			{ type: "api_key", name: "Radius API key" },
			{ type: "oauth", name: "Radius" },
		],
	},
	githubCli: {
		path: "C:\\Program Files\\GitHub CLI\\gh.exe",
		source: "common",
		authenticated: false,
		version: "2.83.2",
		loginCommand: '& "C:\\Program Files\\GitHub CLI\\gh.exe" auth login',
		error: null,
	},
};

function sourceLabel(source: GitHubCliSource): string {
	if (source === "configured") return "手动配置";
	if (source === "environment") return "环境变量";
	if (source === "path") return "PATH";
	if (source === "common") return "自动发现";
	return "未找到";
}

function authLabel(radius: AuthProviderSummary | null): string {
	if (!radius?.configured) return "未登录";
	if (radius.authType === "oauth") return "OAuth 已登录";
	if (radius.authType === "api_key") return "API Key 已配置";
	return "已配置";
}

export function ShareSettings({
	refreshToken,
	onOpenAuth,
	onOpenUrl,
}: {
	refreshToken: number;
	onOpenAuth(mode: "login" | "logout", providerId: string): void;
	onOpenUrl(url: string): void;
}) {
	const [status, setStatus] = useState<ShareSettingsStatus | null>(null);
	const [pathDraft, setPathDraft] = useState("");
	const [busy, setBusy] = useState<"load" | "save" | "choose" | null>(null);
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const loadStatus = useCallback(async (): Promise<void> => {
		if (!("codepiddy" in window)) {
			setStatus(DEMO_SHARE_SETTINGS);
			setPathDraft(DEMO_SHARE_SETTINGS.githubCli.path ?? "");
			return;
		}
		setBusy("load");
		setError(null);
		try {
			const next = await window.codepiddy.getShareSettings();
			setStatus(next);
			setPathDraft(next.githubCli.path ?? "");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "读取分享设置失败");
		} finally {
			setBusy(null);
		}
	}, []);

	useEffect(() => {
		if (refreshToken < 0) return;
		void loadStatus();
	}, [loadStatus, refreshToken]);

	async function saveGitHubCliPath(value: string | null): Promise<void> {
		if (!("codepiddy" in window)) return;
		setBusy("save");
		setError(null);
		try {
			const next = await window.codepiddy.setGitHubCliPath(value);
			setStatus(next);
			setPathDraft(next.githubCli.path ?? "");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "保存 GitHub CLI 路径失败");
		} finally {
			setBusy(null);
		}
	}

	async function chooseGitHubCliPath(): Promise<void> {
		if (!("codepiddy" in window)) return;
		setBusy("choose");
		setError(null);
		try {
			const selected = await window.codepiddy.chooseGitHubCliPath();
			if (selected) await saveGitHubCliPath(selected);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "选择 GitHub CLI 失败");
		} finally {
			setBusy(null);
		}
	}

	async function copyLoginCommand(): Promise<void> {
		const command = status?.githubCli.loginCommand;
		if (!command) return;
		try {
			await navigator.clipboard.writeText(command);
			setCopied(true);
		} catch {
			setError("复制 GitHub CLI 登录命令失败");
		}
	}

	const radius = status?.radius ?? null;
	const githubCli = status?.githubCli ?? null;
	const githubStatus = !githubCli?.path ? "未找到" : githubCli.authenticated ? "已登录" : "未登录";

	return (
		<section className="settings-card share-settings-card">
			<div className="settings-card-heading">
				<div>
					<h2>分享</h2>
					<p>分享当前 Session 时优先使用 Radius；未登录时使用 GitHub CLI 创建 secret gist。</p>
				</div>
				<button
					className="secondary-button"
					type="button"
					disabled={busy !== null}
					onClick={() => void loadStatus()}
				>
					<RefreshCw size={13} strokeWidth={2} /> {busy === "load" ? "刷新中…" : "刷新状态"}
				</button>
			</div>

			<div className="share-settings-list">
				<section className="share-setting-section">
					<div className="share-setting-heading">
						<span className="share-setting-icon">
							<img
								className="share-setting-brand-icon"
								src={radiusIconUrl}
								alt=""
								aria-hidden="true"
								draggable={false}
							/>
						</span>
						<div>
							<h3>Radius</h3>
							<p>
								使用 Pi 原生 Provider 凭据，登录后写入 <code>auth.json</code>。
							</p>
						</div>
						<span className={`settings-status${radius?.configured ? " is-success" : ""}`}>
							{authLabel(radius)}
						</span>
					</div>
					<div className="share-setting-details">
						<span>凭据来源</span>
						<strong>{radius?.sourceLabel ?? "未配置"}</strong>
					</div>
					<div className="settings-actions">
						<button
							className="primary-button"
							type="button"
							disabled={!radius}
							onClick={() => onOpenAuth("login", "radius")}
						>
							{radius?.configured ? "重新登录" : "登录 Radius"}
						</button>
						<button
							className="secondary-button"
							type="button"
							disabled={!radius?.configured || radius.source !== "stored"}
							onClick={() => onOpenAuth("logout", "radius")}
						>
							退出登录
						</button>
					</div>
				</section>

				<section className="share-setting-section">
					<div className="share-setting-heading">
						<span className="share-setting-icon">
							<img
								className="share-setting-brand-icon"
								src={githubCliIconUrl}
								alt=""
								aria-hidden="true"
								draggable={false}
							/>
						</span>
						<div>
							<h3>GitHub CLI</h3>
							<p>
								客户端只检测路径和登录状态，不保存 GitHub Token；登录由 <code>gh auth login</code> 管理。
							</p>
						</div>
						<span
							className={`settings-status${githubCli?.authenticated ? " is-success" : githubCli?.path ? " is-warning" : ""}`}
						>
							{githubStatus}
						</span>
					</div>
					<div className="share-setting-details">
						<span>检测来源</span>
						<strong>{githubCli ? sourceLabel(githubCli.source) : "—"}</strong>
					</div>
					{githubCli?.path ? <code className="share-setting-path">{githubCli.path}</code> : null}
					{githubCli?.version ? <small>GitHub CLI v{githubCli.version}</small> : null}
					{githubCli?.error ? <StateBlock compact tone="error" title={githubCli.error} /> : null}
					{githubCli?.path && !githubCli.authenticated ? (
						<div className="share-login-command">
							<code>{githubCli.loginCommand}</code>
							<button type="button" onClick={() => void copyLoginCommand()}>
								{copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={2} />}
								{copied ? "已复制" : "复制登录命令"}
							</button>
						</div>
					) : null}
					<div className="settings-secret-field share-path-field">
						<input
							type="text"
							value={pathDraft}
							onChange={(event) => setPathDraft(event.target.value)}
							placeholder="留空自动检测，或选择 gh.exe 完整路径"
						/>
						<button
							className="settings-secret-toggle"
							type="button"
							aria-label="选择 GitHub CLI"
							title="选择 GitHub CLI"
							disabled={busy !== null}
							onClick={() => void chooseGitHubCliPath()}
						>
							<FolderOpen size={14} strokeWidth={2} />
						</button>
					</div>
					<div className="settings-actions">
						<button
							className="primary-button"
							type="button"
							disabled={busy !== null || !pathDraft.trim()}
							onClick={() => void saveGitHubCliPath(pathDraft)}
						>
							{busy === "save" ? "保存中…" : "保存路径"}
						</button>
						<button
							className="secondary-button"
							type="button"
							disabled={busy !== null || !githubCli?.path}
							onClick={() => void saveGitHubCliPath(null)}
						>
							<Trash2 size={13} strokeWidth={2} /> 清除配置
						</button>
						<button
							className="secondary-button"
							type="button"
							onClick={() => onOpenUrl("https://cli.github.com/")}
						>
							<ExternalLink size={13} strokeWidth={2} /> 安装说明
						</button>
					</div>
				</section>
			</div>

			{error ? <StateBlock compact tone="error" title={error} /> : null}
			<div className="share-settings-footer">
				<ShieldCheck size={14} strokeWidth={2} />
				<span>分享前仍会显示隐私确认；GitHub secret gist 拿到链接的人可以查看。</span>
			</div>
		</section>
	);
}
