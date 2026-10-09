import { describe, expect, it } from "vitest";
import { highlightCode } from "../src/renderer/file-syntax.ts";

describe("highlightCode (fenced code blocks)", () => {
	it("highlights a registered language through its fence alias", () => {
		const html = highlightCode("const value = 1;", "ts");
		expect(html).toContain('class="hljs-keyword"');
		expect(html).toContain("value");
	});

	it("escapes plain text when the fence language is unknown", () => {
		const html = highlightCode("<script>alert(1)</script>", "definitely-not-a-language");
		expect(html).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
	});

	it("escapes plain text when no language is given", () => {
		expect(highlightCode("a < b && c > d")).toBe("a &lt; b &amp;&amp; c &gt; d");
	});
});
