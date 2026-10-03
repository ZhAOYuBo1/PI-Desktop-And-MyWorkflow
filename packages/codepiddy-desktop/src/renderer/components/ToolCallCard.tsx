import { memo, useState } from "react";
import { formatElapsed } from "./stream-stats.ts";
import { resolveToolExpanded, type ToolPinMode, toggleToolPin } from "./tool-collapse.ts";
import { classifyToolFailure, toolFailureGuidance, toolFailureLabel } from "./tool-failure-utils.ts";
import { ToolIcon, toolIconForTool } from "./tool-icons.tsx";

export interface ToolCallCardItem {
	id: string;
	name: string;
	args: string;
	text: string;
	status: "running" | "completed";
	isError: boolean;
	startedAt?: number;
	completedAt?: number;
}

const OUTPUT_PREVIEW_LIMIT = 6000;

function friendlyToolText(item: ToolCallCardItem): string {
	if (/TAVILY_API_KEY is (?:not configured|required)/i.test(item.text)) {
		return "Tavily Search 尚未配置。请在 CodePIddy 设置中保存 Tavily API Key，然后重启或重置当前 Agent。";
	}
	return item.text;
}

function toolDisplayName(toolName: string): string {
	const match = /^mcp__(.+?)__(.+)$/.exec(toolName);
	return match?.[2] ?? toolName;
}

export function ToolCallOutput({ item, showAll }: { item: ToolCallCardItem; showAll: boolean }) {
	const name = item.name.toLowerCase();
	const terminal = name === "bash" || name === "powershell";
	const diff = name === "edit" || name === "write";
	const friendlyText = friendlyToolText(item);
	const text =
		showAll || friendlyText.length <= OUTPUT_PREVIEW_LIMIT
			? friendlyText
			: friendlyText.slice(0, OUTPUT_PREVIEW_LIMIT);
	if (diff) {
		return (
			<pre className="diff-output">
				{text.split("\n").map((line, index) => (
					<span
						className={line.startsWith("+") ? "diff-add" : line.startsWith("-") ? "diff-remove" : "diff-context"}
						key={`${index}-${line}`}
					>
						{line || " "}
						{"\n"}
					</span>
				))}
			</pre>
		);
	}
	return <pre className={terminal ? "terminal-output" : ""}>{text}</pre>;
}

export const ToolCallCard = memo(function ToolCallCard({ item }: { item: ToolCallCardItem }) {
	const [pin, setPin] = useState<ToolPinMode>("auto");
	const [showAll, setShowAll] = useState(false);
	const expanded = resolveToolExpanded(pin, item.status);
	const friendlyText = friendlyToolText(item);
	const truncated = friendlyText.length > OUTPUT_PREVIEW_LIMIT;
	const failureKind = item.isError ? classifyToolFailure(friendlyText) : null;
	const duration =
		item.status === "completed" && typeof item.startedAt === "number" && typeof item.completedAt === "number"
			? formatElapsed(Math.max(0, item.completedAt - item.startedAt))
			: null;
	return (
		<div className={`tool-block ${item.isError ? "error" : ""}`}>
			{duration ? <span className="tool-elapsed">用时 {duration}</span> : null}
			<button className="tool-summary" type="button" onClick={() => setPin(toggleToolPin(expanded))}>
				<strong className="tool-title">
					<ToolIcon name={toolIconForTool(item.name)} size={14} />
					<span>{toolDisplayName(item.name)}</span>
				</strong>
				<span className={`tool-status ${item.status === "running" ? "running" : item.isError ? "failed" : "done"}`}>
					<ToolIcon
						name={item.status === "running" ? "clock" : item.isError ? "x-circle" : "check-circle"}
						size={12}
					/>
					{item.status === "running" ? "运行中" : failureKind ? toolFailureLabel(failureKind) : "完成"}
				</span>
				<ToolIcon name="caret" size={13} className={`tool-caret${expanded ? " open" : ""}`} />
			</button>
			{expanded ? (
				<div className="tool-details">
					{item.args ? (
						<>
							<small>参数</small>
							<pre>{item.args}</pre>
						</>
					) : null}
					{item.text ? (
						<>
							<small>结果</small>
							<ToolCallOutput item={item} showAll={showAll} />
							{truncated ? (
								<button
									className="tool-show-all"
									type="button"
									onClick={() => setShowAll((current) => !current)}
								>
									{showAll ? "收起结果" : `显示全部（${friendlyText.length.toLocaleString()} 字符）`}
								</button>
							) : null}
							{failureKind ? (
								<div className={`tool-error-guidance guidance-${failureKind}`}>
									{toolFailureGuidance(failureKind)}
								</div>
							) : null}
						</>
					) : null}
				</div>
			) : null}
		</div>
	);
});
