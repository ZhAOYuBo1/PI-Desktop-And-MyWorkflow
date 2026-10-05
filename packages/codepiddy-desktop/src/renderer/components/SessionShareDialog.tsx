import type { ShareAgentSessionResult } from "@codepiddy/shared";
import { Check, Copy, ExternalLink, LoaderCircle, ShieldAlert } from "lucide-react";
import { useState } from "react";

export function SessionShareDialog({
	displayName,
	sessionName,
	busy,
	result,
	error,
	onConfirm,
	onClose,
	onOpenUrl,
}: {
	displayName: string;
	sessionName: string | null;
	busy: boolean;
	result: ShareAgentSessionResult | null;
	error: string | null;
	onConfirm(): void;
	onClose(): void;
	onOpenUrl(url: string): void;
}) {
	const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
	const copied = copiedUrl === result?.viewerUrl;

	async function copyLink(): Promise<void> {
		if (!result?.viewerUrl) return;
		try {
			await navigator.clipboard.writeText(result.viewerUrl);
			setCopiedUrl(result.viewerUrl);
		} catch {
			setCopiedUrl(null);
		}
	}

	return (
		<div className="modal session-share-modal" role="dialog" aria-modal="true" aria-label="分享会话">
			<div className="session-tree-heading">
				<div>
					<h2>分享会话</h2>
					<p>导出当前会话并生成一个可在浏览器中查看的链接。</p>
				</div>
				<button
					className="work-panel-icon-button"
					type="button"
					aria-label="关闭分享会话"
					disabled={busy}
					onClick={onClose}
				>
					<span aria-hidden="true">×</span>
				</button>
			</div>

			{result ? (
				<div className="session-share-result" aria-live="polite">
					<div className="session-share-success">
						<span className="session-share-success-icon">
							<Check size={16} strokeWidth={2.2} />
						</span>
						<div>
							<strong>分享链接已生成</strong>
							<p>
								来源：{result.provider === "radius" ? "Radius" : "GitHub secret gist"}
								。拿到链接的人可以查看会话内容。
							</p>
						</div>
					</div>
					<div className="session-share-link">
						<code>{result.viewerUrl}</code>
						<button type="button" onClick={() => void copyLink()}>
							{copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
							{copied ? "已复制" : "复制链接"}
						</button>
					</div>
					<div className="session-share-result-actions">
						{result.gistUrl ? (
							<button className="secondary-button" type="button" onClick={() => onOpenUrl(result.gistUrl!)}>
								<ExternalLink size={13} strokeWidth={2} /> 打开 Gist
							</button>
						) : null}
						<button className="primary-button" type="button" onClick={() => onOpenUrl(result.viewerUrl)}>
							<ExternalLink size={13} strokeWidth={2} /> 打开链接
						</button>
					</div>
				</div>
			) : busy ? (
				<div className="session-share-loading" aria-live="polite">
					<LoaderCircle className="session-share-spinner" size={18} strokeWidth={2} />
					<div>
						<strong>正在生成分享链接</strong>
						<p>导出会话后，将优先上传到 Radius；未配置时使用 GitHub CLI 创建 secret gist。</p>
					</div>
				</div>
			) : (
				<>
					<div className="session-share-privacy">
						<ShieldAlert size={16} strokeWidth={2} />
						<div>
							<strong>分享前请确认内容</strong>
							<p>会话可能包含代码、文件路径、命令输出和凭据片段。分享链接可能被拿到链接的人查看。</p>
						</div>
					</div>
					<div className="session-share-summary">
						<span>{displayName}</span>
						<strong>{sessionName || "未命名会话"}</strong>
					</div>
					{error ? (
						<div className="session-share-error" role="alert">
							<strong>分享失败</strong>
							<p>{error}</p>
						</div>
					) : null}
					<div className="modal-actions">
						<button className="secondary-button" type="button" onClick={onClose}>
							取消
						</button>
						<button className="primary-button" type="button" onClick={onConfirm}>
							{error ? "重试分享" : "分享会话"}
						</button>
					</div>
				</>
			)}
		</div>
	);
}
