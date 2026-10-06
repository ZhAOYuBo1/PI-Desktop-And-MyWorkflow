import { codemodeSourceFromArgs, parseCodemodeDetails } from "./codemode-details.ts";
import { ToolIcon } from "./tool-icons.tsx";

const CALL_STATUS_LABELS: Record<string, string> = {
	running: "运行中",
	ok: "完成",
	error: "失败",
	cancelled: "已取消",
	unknown: "未知",
};

function formatDuration(durationMs: number | null): string | null {
	if (durationMs === null) return null;
	if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
	return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}

export function CodemodeDetailsView({ args, details }: { args: string; details: unknown }) {
	const source = codemodeSourceFromArgs(args);
	const parsed = parseCodemodeDetails(details);
	return (
		<div className="codemode-details-view">
			{source ? (
				<section className="codemode-section">
					<div className="codemode-section-heading">
						<span>脚本</span>
						<small>JavaScript · QuickJS</small>
					</div>
					<pre className="codemode-script">{source}</pre>
				</section>
			) : null}
			{parsed.calls.length > 0 ? (
				<section className="codemode-section">
					<div className="codemode-section-heading">
						<span>工具调用</span>
						<small>{parsed.calls.length} 次</small>
					</div>
					<div className="codemode-calls">
						{parsed.calls.map((call, index) => {
							const duration = formatDuration(call.durationMs);
							return (
								<div className={`codemode-call is-${call.status}`} key={call.id || `${call.name}-${index}`}>
									<div className="codemode-call-heading">
										<ToolIcon name="braces" size={13} />
										<strong>{call.name}</strong>
										<span className="codemode-call-status">
											{CALL_STATUS_LABELS[call.status] ?? call.status}
										</span>
										{duration ? <small>{duration}</small> : null}
									</div>
									{call.args ? <code className="codemode-call-args">{call.args}</code> : null}
									{call.error ? <pre className="codemode-call-error">{call.error}</pre> : null}
								</div>
							);
						})}
					</div>
				</section>
			) : null}
			{parsed.fullOutputPath ? (
				<section className="codemode-section codemode-output-path">
					<div className="codemode-section-heading">
						<span>完整输出</span>
					</div>
					<code>{parsed.fullOutputPath}</code>
				</section>
			) : null}
		</div>
	);
}
