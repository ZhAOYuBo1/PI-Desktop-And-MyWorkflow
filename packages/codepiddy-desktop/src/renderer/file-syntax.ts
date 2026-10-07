import hljs from "highlight.js/lib/core.js";
import bash from "highlight.js/lib/languages/bash.js";
import cpp from "highlight.js/lib/languages/cpp.js";
import csharp from "highlight.js/lib/languages/csharp.js";
import css from "highlight.js/lib/languages/css.js";
import go from "highlight.js/lib/languages/go.js";
import ini from "highlight.js/lib/languages/ini.js";
import java from "highlight.js/lib/languages/java.js";
import javascript from "highlight.js/lib/languages/javascript.js";
import json from "highlight.js/lib/languages/json.js";
import markdown from "highlight.js/lib/languages/markdown.js";
import python from "highlight.js/lib/languages/python.js";
import rust from "highlight.js/lib/languages/rust.js";
import sql from "highlight.js/lib/languages/sql.js";
import typescript from "highlight.js/lib/languages/typescript.js";
import xml from "highlight.js/lib/languages/xml.js";
import yaml from "highlight.js/lib/languages/yaml.js";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("css", css);
hljs.registerLanguage("go", go);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
	js: "javascript",
	jsx: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	ts: "typescript",
	tsx: "typescript",
	mts: "typescript",
	cts: "typescript",
	py: "python",
	pyw: "python",
	json: "json",
	jsonc: "json",
	html: "xml",
	htm: "xml",
	xml: "xml",
	svg: "xml",
	vue: "xml",
	css: "css",
	scss: "css",
	less: "css",
	md: "markdown",
	markdown: "markdown",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	java: "java",
	c: "cpp",
	h: "cpp",
	cc: "cpp",
	cpp: "cpp",
	hpp: "cpp",
	cs: "csharp",
	go: "go",
	rs: "rust",
	sql: "sql",
	yml: "yaml",
	yaml: "yaml",
	ini: "ini",
	conf: "ini",
};

export function detectFileLanguage(path: string): string | undefined {
	const extension = path.split(".").pop()?.toLowerCase();
	return extension ? EXTENSION_TO_LANGUAGE[extension] : undefined;
}

export function highlightFileCode(code: string, path: string): string {
	const language = detectFileLanguage(path);
	if (!language || !hljs.getLanguage(language)) return escapeHtml(code);
	try {
		return hljs.highlight(code, { language, ignoreIllegals: true }).value;
	} catch {
		return escapeHtml(code);
	}
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
