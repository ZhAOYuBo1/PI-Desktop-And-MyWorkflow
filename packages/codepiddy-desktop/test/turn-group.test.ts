import { describe, expect, it } from "vitest";
import {
	groupTranscriptIntoTurns,
	projectTranscriptTurn,
	resolveProcessCollapsed,
	type TranscriptTurnProjectionOptions,
} from "../src/renderer/components/turn-group.ts";

type TestItem = {
	id: string;
	type: string;
	createdAt?: string;
};

const projectionOptions: TranscriptTurnProjectionOptions<TestItem> = {
	isFinalEntry: (item) => item.type === "assistant",
	isProcessEntry: (item) => item.type === "tool" || item.type === "assistant",
	isTimelineEvent: (item) =>
		item.type === "compaction" ||
		item.type === "context_edit" ||
		item.type === "model_change" ||
		item.type === "thinking_level_change",
	isProcessError: () => false,
	timing: (item) => {
		if (item.id === "tool") return { startedAt: 100, endedAt: 200 };
		return {};
	},
};

function project(items: TestItem[]) {
	const [turn] = groupTranscriptIntoTurns(items);
	if (!turn) throw new Error("expected one turn");
	return projectTranscriptTurn(turn, projectionOptions);
}

describe("transcript turn projection", () => {
	it("keeps event-only sessions as visible timeline rows", () => {
		const blocks = project([
			{ id: "model", type: "model_change" },
			{ id: "thinking", type: "thinking_level_change" },
			{ id: "model-2", type: "model_change" },
		]);

		expect(blocks.map((block) => block.kind)).toEqual(["entry", "entry", "entry"]);
		expect(blocks.map((block) => (block.kind === "entry" ? block.entry.item.id : block.id))).toEqual([
			"model",
			"thinking",
			"model-2",
		]);
	});

	it("groups only process entries and keeps session events outside", () => {
		const blocks = project([
			{ id: "user", type: "user" },
			{ id: "model", type: "model_change" },
			{ id: "tool", type: "tool" },
			{ id: "thinking", type: "thinking_level_change" },
			{ id: "assistant", type: "assistant" },
		]);

		expect(blocks.map((block) => block.kind)).toEqual(["entry", "entry", "process", "entry", "entry"]);
		expect(blocks[2]?.kind === "process" ? blocks[2].entries.map((entry) => entry.item.id) : []).toEqual(["tool"]);
	});

	it("keeps process timing and errors scoped to the process block", () => {
		const [turn] = groupTranscriptIntoTurns([
			{ id: "user", type: "user" },
			{ id: "tool", type: "tool" },
			{ id: "assistant", type: "assistant" },
		]);
		if (!turn) throw new Error("expected one turn");
		const blocks = projectTranscriptTurn(turn, {
			...projectionOptions,
			isProcessError: (item) => item.id === "tool",
		});

		expect(blocks.map((block) => block.kind)).toEqual(["entry", "process", "entry"]);
		expect(blocks[1]?.kind === "process" ? blocks[1] : null).toMatchObject({
			startedAt: 100,
			endedAt: 200,
			errorCount: 1,
		});
	});
});

describe("process disclosure defaults", () => {
	it("opens only active detailed processes or active process errors", () => {
		expect(resolveProcessCollapsed(undefined, { active: true, thinkingDisplayMode: "detailed", errorCount: 0 })).toBe(
			false,
		);
		expect(resolveProcessCollapsed(undefined, { active: true, thinkingDisplayMode: "compact", errorCount: 0 })).toBe(
			true,
		);
		expect(resolveProcessCollapsed(undefined, { active: true, thinkingDisplayMode: "compact", errorCount: 1 })).toBe(
			false,
		);
		expect(
			resolveProcessCollapsed(undefined, { active: false, thinkingDisplayMode: "detailed", errorCount: 0 }),
		).toBe(true);
		expect(resolveProcessCollapsed(false, { active: true, thinkingDisplayMode: "detailed", errorCount: 0 })).toBe(
			false,
		);
	});
});
