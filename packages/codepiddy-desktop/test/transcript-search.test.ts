import { describe, expect, it } from "vitest";
import {
	findTranscriptSearchMatches,
	transcriptItemMatches,
	transcriptSearchMatchRanges,
} from "../src/renderer/components/transcript-search.ts";

describe("transcript search", () => {
	it("matches user, assistant, thinking, tool, and native event content", () => {
		const items = [
			{ id: "user", type: "user", text: "修复登录问题" },
			{
				id: "assistant",
				type: "assistant",
				text: "检查完成",
				thinking: "需要先看 routes",
				parts: [{ type: "toolCall", name: "read", args: '{"path":"routes.ts"}' }],
			},
			{ id: "compaction", type: "compaction", text: "上下文已压缩", summary: "保留登录流程" },
		];

		expect(findTranscriptSearchMatches(items, "登录").map((match) => match.itemId)).toEqual(["user", "compaction"]);
		expect(transcriptItemMatches(items[1], "routes")).toBe(true);
		expect(transcriptItemMatches(items[1], "不存在")).toBe(false);
	});

	it("returns Unicode-aware ranges and merges overlaps", () => {
		expect(transcriptSearchMatchRanges("修复登录和登录流程", "登录")).toEqual([
			[2, 4],
			[5, 7],
		]);
		expect(transcriptSearchMatchRanges("HELLO hello", "hello")).toEqual([
			[0, 5],
			[6, 11],
		]);
		expect(transcriptSearchMatchRanges("text", " ")).toEqual([]);
	});
});
