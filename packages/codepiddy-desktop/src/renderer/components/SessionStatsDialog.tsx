import type { AgentSessionStats } from "@codepiddy/shared";
import { Coins, FileText, Gauge, MessageSquare, Wrench, Zap } from "lucide-react";
import { ModalShell } from "./modal-shell.tsx";
import { StateBlock } from "./state-block.tsx";

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

function cacheWarmingModeLabel(mode: "off" | "streaming" | "idle"): string {
	if (mode === "off") return "关闭";
	if (mode === "idle") return "运行中 + 空闲";
	return "仅运行中";
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
		<ModalShell
			title={`${displayName} 会话统计`}
			description="统计覆盖当前 Session 的全部历史，包括已经压缩掉的上下文。"
			onClose={onClose}
			width="md"
			className="session-stats-modal"
			footer={
				<button className="secondary-button" type="button" onClick={onClose}>
					关闭
				</button>
			}
		>
			{loading || !stats ? (
				<StateBlock tone="loading" title="正在读取 Pi Session 统计…" />
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
					{stats.cacheWarming ? (
						<div className="session-stats-cache-warming">
							<div className="session-stats-cache-warming-head">
								<span className="session-stats-icon">
									<Zap size={16} strokeWidth={2} />
								</span>
								<div>
									<strong>缓存预热</strong>
									<small>{cacheWarmingModeLabel(stats.cacheWarming.mode)}</small>
								</div>
							</div>
							{stats.cacheWarming.decision ? (
								<div className="session-stats-cache-warming-grid">
									<div>
										<span>未命中成本</span>
										<strong>{formatCost(stats.cacheWarming.decision.missCost)}</strong>
									</div>
									<div>
										<span>刷新成本</span>
										<strong>{formatCost(stats.cacheWarming.decision.warmCost)}</strong>
									</div>
									<div>
										<span>预期节省</span>
										<strong
											className={
												stats.cacheWarming.decision.expectedSavings >= 0
													? "cache-warming-savings"
													: "cache-warming-cost"
											}
										>
											{formatCost(stats.cacheWarming.decision.expectedSavings)}
										</strong>
									</div>
									<div>
										<span>最近决策</span>
										<strong>{stats.cacheWarming.decision.action === "warm" ? "预热" : "不预热"}</strong>
									</div>
								</div>
							) : (
								<StateBlock compact tone="neutral" icon="zap" title="尚无预热决策">
									Provider 不支持 prompt caching，或本会话还没有触发第一次决策。
								</StateBlock>
							)}
						</div>
					) : null}
				</>
			)}
		</ModalShell>
	);
}
