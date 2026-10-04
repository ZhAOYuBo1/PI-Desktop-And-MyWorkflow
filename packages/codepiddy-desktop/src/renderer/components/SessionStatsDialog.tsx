import type { AgentSessionStats } from "@codepiddy/shared";
import { Coins, FileText, Gauge, MessageSquare, Wrench } from "lucide-react";

function formatNumber(value: number): string {
	return new Intl.NumberFormat(undefined, {
		notation: value >= 10_000 ? "compact" : "standard",
		maximumFractionDigits: value >= 10_000 ? 1 : 0,
	}).format(value);
}

function formatCost(value: number): string {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
	}).format(value);
}

export function SessionStatsDialog({
	displayName,
	stats,
	loading,
	onClose,
}: {
	displayName: string;
	stats: AgentSessionStats | null;
	loading: boolean;
	onClose(): void;
}) {
	const contextPercent =
		stats?.contextUsage?.percent ??
		(stats?.contextUsage?.tokens === null || !stats?.contextUsage
			? null
			: (stats.contextUsage.tokens / stats.contextUsage.contextWindow) * 100);
	return (
		<div className="modal session-stats-modal" role="dialog" aria-modal="true" aria-label="会话统计">
			<div className="session-tree-heading">
				<div>
					<h2>{displayName} 会话统计</h2>
					<p>统计覆盖当前 Session 的全部历史，包括已经压缩掉的上下文。</p>
				</div>
				<button className="work-panel-icon-button" type="button" aria-label="关闭会话统计" onClick={onClose}>
					<span aria-hidden="true">×</span>
				</button>
			</div>
			{loading || !stats ? (
				<div className="session-stats-loading">正在读取 Pi Session 统计…</div>
			) : (
				<>
					<div className="session-stats-identity">
						<FileText size={15} strokeWidth={2} />
						<div>
							<strong>{stats.sessionId}</strong>
							<code title={stats.sessionFile}>{stats.sessionFile ?? "In-memory session"}</code>
						</div>
					</div>
					<div className="session-stats-grid">
						<section>
							<span className="session-stats-icon">
								<MessageSquare size={16} strokeWidth={2} />
							</span>
							<strong>{formatNumber(stats.totalMessages)}</strong>
							<small>总消息</small>
							<em>
								你 {stats.userMessages} · Pi {stats.assistantMessages}
							</em>
						</section>
						<section>
							<span className="session-stats-icon">
								<Wrench size={16} strokeWidth={2} />
							</span>
							<strong>{formatNumber(stats.toolCalls)}</strong>
							<small>工具调用</small>
							<em>{stats.toolResults} 条工具结果</em>
						</section>
						<section>
							<span className="session-stats-icon">
								<Coins size={16} strokeWidth={2} />
							</span>
							<strong>{formatCost(stats.cost)}</strong>
							<small>累计费用</small>
							<em>{formatNumber(stats.tokens.total)} Token</em>
						</section>
						<section>
							<span className="session-stats-icon">
								<Gauge size={16} strokeWidth={2} />
							</span>
							<strong>{contextPercent === null ? "—" : `${Math.round(contextPercent)}%`}</strong>
							<small>上下文占用</small>
							<em>
								{stats.contextUsage
									? `${stats.contextUsage.tokens === null ? "—" : formatNumber(stats.contextUsage.tokens)} / ${formatNumber(stats.contextUsage.contextWindow)}`
									: "等待模型回复"}
							</em>
						</section>
					</div>
					<div className="session-stats-tokens">
						<div>
							<span>输入</span>
							<strong>{formatNumber(stats.tokens.input)}</strong>
						</div>
						<div>
							<span>输出</span>
							<strong>{formatNumber(stats.tokens.output)}</strong>
						</div>
						<div>
							<span>缓存读取</span>
							<strong>{formatNumber(stats.tokens.cacheRead)}</strong>
						</div>
						<div>
							<span>缓存写入</span>
							<strong>{formatNumber(stats.tokens.cacheWrite)}</strong>
						</div>
					</div>
				</>
			)}
			<div className="modal-actions">
				<button className="secondary-button" type="button" onClick={onClose}>
					关闭
				</button>
			</div>
		</div>
	);
}
