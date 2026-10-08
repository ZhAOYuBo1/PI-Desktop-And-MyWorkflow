import { memo, useState } from "react";
import { CodemodeDetailsView } from "./CodemodeDetailsView.tsx";
import { formatElapsed } from "./stream-stats.ts";
import { resolveToolExpanded, type ToolPinMode, toggleToolPin } from "./tool-collapse.ts";
import {
	isNativeTool,
	nativeToolAction,
	parseToolArgs,
	toolActionLabel,
	toolDetailRows,
	toolSummary,
} from "./tool-display.ts";
import { classifyToolFailure, toolFailureGuidance, toolFailureLabel } from "./tool-failure-utils.ts";
import { ToolIcon, toolIconForTool } from "./tool-icons.tsx";

export interface ToolCallCardItem {
	id: string;
	name: string;
	args: string;
	text: string;
	details?: unknown;
	status: "running" | "completed";
	isError: boolean;
	startedAt?: number;
	completedAt?: number;
}

const OUTPUT_PREVIEW_LIMIT = 6000;

function toolDisplayName(toolName: string): string {
	const match = /^mcp__(.+?)__(.+)$/.exec(toolName);
	return match?.[2] ?? toolName;
}

export function ToolCallOutput({ item, showAll }: { item: ToolCallCardItem; showAll: boolean }) {
	const name = item.name.toLowerCase();
	const terminal = name === "bash" || name === "powershell";
	const diff = name === "edit" || name === "write";
	const friendlyText = item.text;
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
	const friendlyText = item.text;
	const truncated = friendlyText.length > OUTPUT_PREVIEW_LIMIT;
	const failureKind = item.isError ? classifyToolFailure(friendlyText) : null;
	const duration =
		item.status === "completed" && typeof item.startedAt === "number" && typeof item.completedAt === "number"
			? formatElapsed(Math.max(0, item.completedAt - item.startedAt))
			: null;
	const args = parseToolArgs(item.args);
	const action = nativeToolAction(item.name);
	const summary = action ? toolSummary(item.name, args) : "";
	const detailRows = action ? toolDetailRows(item.name, args) : [];
	return (
		<div className={`tool-block ${item.isError ? "error" : ""}`}>
			{duration ? <span className="tool-elapsed">用时 {duration}</span> : null}
			<button className="tool-summary" type="button" onClick={() => setPin(toggleToolPin(expanded))}>
				<strong className="tool-title">
					<ToolIcon name={toolIconForTool(item.name)} size={14} />
					<span className="tool-action">{action ? toolActionLabel(action) : toolDisplayName(item.name)}</span>
					{summary ? (
						<span className="tool-summary-text" title={summary}>
							{summary}
						</span>
					) : null}
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
					{item.name.toLowerCase() === "codemode" ? (
						<CodemodeDetailsView args={item.args} details={item.details} />
					) : null}
					{isNativeTool(item.name) && detailRows.length > 0 ? (
						<div className="tool-param-list">
							{detailRows.map((row) => (
								<div className="tool-param-row" key={`${row.label}:${row.value}`}>
									<span className="tool-param-label">{row.label}</span>
									<span className={`tool-param-value${row.mono ? " is-mono" : ""}`} title={row.value}>
										{row.value}
									</span>
								</div>
							))}
						</div>
					) : item.args && item.name.toLowerCase() !== "codemode" ? (
						<>
							<small>参数</small>
							<pre>{item.args}</pre>
						</>
					) : null}
					{isNativeTool(item.name) && item.args ? (
						<details className="tool-raw-args">
							<summary>原始参数</summary>
							<pre>{item.args}</pre>
						</details>
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
