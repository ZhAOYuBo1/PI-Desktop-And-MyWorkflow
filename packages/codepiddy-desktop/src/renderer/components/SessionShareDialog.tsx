import type { ShareAgentSessionResult } from "@codepiddy/shared";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { ModalShell } from "./modal-shell.tsx";
import { StateBlock } from "./state-block.tsx";

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
		<ModalShell
			title="分享会话"
			description="导出当前会话并生成一个可在浏览器中查看的链接。"
			onClose={onClose}
			closeDisabled={busy}
			width="sm"
			className="session-share-modal"
			footer={
				!result && !busy ? (
					<>
						<button className="secondary-button" type="button" onClick={onClose}>
							取消
						</button>
						<button className="primary-button" type="button" onClick={onConfirm}>
							{error ? "重试分享" : "分享会话"}
						</button>
					</>
				) : undefined
			}
		>
			{result ? (
				<div className="session-share-result" aria-live="polite">
					<StateBlock
						tone="success"
						title="分享链接已生成"
						actions={
							<>
								{result.gistUrl ? (
									<button
										className="secondary-button"
										type="button"
										onClick={() => onOpenUrl(result.gistUrl!)}
									>
										<ExternalLink size={13} strokeWidth={2} /> 打开 Gist
									</button>
								) : null}
								<button className="primary-button" type="button" onClick={() => onOpenUrl(result.viewerUrl)}>
									<ExternalLink size={13} strokeWidth={2} /> 打开链接
								</button>
							</>
						}
					>
						来源：{result.provider === "radius" ? "Radius" : "GitHub secret gist"}。拿到链接的人可以查看会话内容。
					</StateBlock>
					<div className="session-share-link">
						<code>{result.viewerUrl}</code>
						<button type="button" onClick={() => void copyLink()}>
							{copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
							{copied ? "已复制" : "复制链接"}
						</button>
					</div>
				</div>
			) : busy ? (
				<StateBlock tone="loading" title="正在生成分享链接">
					导出会话后，将优先上传到 Radius；未配置时使用 GitHub CLI 创建 secret gist。
				</StateBlock>
			) : (
				<>
					<StateBlock tone="warning" icon="warning" title="分享前请确认内容">
						会话可能包含代码、文件路径、命令输出和凭据片段。分享链接可能被拿到链接的人查看。
					</StateBlock>
					<div className="session-share-summary">
						<span>{displayName}</span>
						<strong>{sessionName || "未命名会话"}</strong>
					</div>
					{error ? (
						<StateBlock tone="error" title="分享失败">
							{error}
						</StateBlock>
					) : null}
				</>
			)}
		</ModalShell>
	);
}
