import { describe, expect, it } from "vitest";
import { groupTranscriptIntoTurns, splitTurnEntries } from "../src/renderer/components/turn-group.ts";

describe("transcript turn grouping", () => {
	it("does not turn an event-only session into a process group", () => {
		const items = [
			{ id: "model", type: "model_change", createdAt: "2026-10-09T00:00:00.000Z" },
			{ id: "thinking", type: "thinking_level_change", createdAt: "2026-10-09T00:00:01.000Z" },
			{ id: "model-2", type: "model_change", createdAt: "2026-10-09T00:00:16.000Z" },
		];
		const [turn] = groupTranscriptIntoTurns(items);
		const { head, middle, tail } = splitTurnEntries(turn);

		expect(head.map((entry) => entry.item.id)).toEqual(["model", "thinking", "model-2"]);
		expect(middle).toEqual([]);
		expect(tail).toEqual([]);
	});

	it("still folds process entries between a user and the final assistant", () => {
		const items = [
			{ id: "user", type: "user" },
			{ id: "tool", type: "tool" },
			{ id: "assistant", type: "assistant" },
		];
		const [turn] = groupTranscriptIntoTurns(items);
		const { head, middle, tail } = splitTurnEntries(turn);

		expect(head.map((entry) => entry.item.id)).toEqual(["user"]);
		expect(middle.map((entry) => entry.item.id)).toEqual(["tool"]);
		expect(tail.map((entry) => entry.item.id)).toEqual(["assistant"]);
	});
});
