import { describe, expect, it } from "vitest";
import { codemodeSourceFromArgs, parseCodemodeDetails } from "../src/renderer/components/codemode-details.ts";

describe("codemode details", () => {
	it("normalizes call details and output path", () => {
		expect(
			parseCodemodeDetails({
				calls: [
					{
						id: "call-1",
						name: "read",
						args: '{"path":"a.ts"}',
						status: "ok",
						durationMs: 42,
						cost: 0.001,
					},
					{ name: "", status: "ok" },
				],
				fullOutputPath: "C:\\temp\\codemode.txt",
			}),
		).toEqual({
			calls: [
				{
					id: "call-1",
					name: "read",
					args: '{"path":"a.ts"}',
					status: "ok",
					durationMs: 42,
					error: null,
					cost: 0.001,
				},
			],
			fullOutputPath: "C:\\temp\\codemode.txt",
		});
	});

	it("extracts JavaScript from the codemode tool args", () => {
		expect(codemodeSourceFromArgs('{"code":"return tools.read({ path: \\"a.ts\\" })"}')).toBe(
			'return tools.read({ path: "a.ts" })',
		);
		expect(codemodeSourceFromArgs("not json")).toBeNull();
	});
});
