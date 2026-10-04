import type { ProjectTrustStatus } from "@codepiddy/shared";
import { FolderCheck, FolderX, RefreshCw } from "lucide-react";

export function ProjectTrustSettings({
	status,
	busy,
	onRefresh,
	onSet,
}: {
	status: ProjectTrustStatus | null;
	busy: boolean;
	onRefresh(): void;
	onSet(decision: boolean, includeParent?: boolean): void;
}) {
	const decisionLabel = status?.decision === true ? "已信任" : status?.decision === false ? "不信任" : "尚未保存";
	return (
		<section className="settings-card project-trust-card">
			<div className="settings-card-heading">
				<div>
					<h2>项目信任</h2>
					<p>决定 Pi 是否加载项目级 settings、extensions、skills 和 packages。当前 Agent 需要重启后生效。</p>
				</div>
				<div className="skill-settings-actions">
					<div
						className={`settings-status trust-status trust-${status?.decision === true ? "yes" : status?.decision === false ? "no" : "unset"}`}
					>
						{decisionLabel}
					</div>
					<button
						className="work-panel-icon-button"
						type="button"
						aria-label="刷新项目信任状态"
						title="刷新项目信任状态"
						disabled={busy}
						onClick={onRefresh}
					>
						<RefreshCw size={14} strokeWidth={2} />
					</button>
				</div>
			</div>
			<div className="project-trust-summary">
				<span className="project-trust-icon">
					{status?.decision === false ? (
						<FolderX size={18} strokeWidth={2} />
					) : (
						<FolderCheck size={18} strokeWidth={2} />
					)}
				</span>
				<div>
					<strong>
						{status?.requiresTrust ? "这个项目包含需要信任才能加载的本地资源" : "这个项目不需要额外信任"}
					</strong>
					<small>
						{status?.inheritedFrom ? `决定来自 ${status.inheritedFrom}` : "决定保存在 Pi 原生 trust.json 中。"}
					</small>
				</div>
			</div>
			<div className="settings-actions">
				<button className="primary-button" type="button" disabled={busy} onClick={() => onSet(true)}>
					信任当前项目
				</button>
				<button className="secondary-button" type="button" disabled={busy} onClick={() => onSet(true, true)}>
					信任父目录
				</button>
				<button className="secondary-button" type="button" disabled={busy} onClick={() => onSet(false)}>
					不信任
				</button>
			</div>
		</section>
	);
}
