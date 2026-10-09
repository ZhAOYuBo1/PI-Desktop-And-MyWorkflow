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

// 围栏代码块里的语言标记是模型随手写的（ts / shell / yml / c++ 都有），
// 先归一到 highlight.js 注册过的名字再高亮；认不出来就按纯文本转义。
const FENCE_LANGUAGE_ALIASES: Record<string, string> = {
	ts: "typescript",
	tsx: "typescript",
	mts: "typescript",
	cts: "typescript",
	js: "javascript",
	jsx: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	sh: "bash",
	shell: "bash",
	zsh: "bash",
	console: "bash",
	py: "python",
	yml: "yaml",
	md: "markdown",
	"c++": "cpp",
	"c#": "csharp",
	htm: "xml",
	html: "xml",
	svg: "xml",
	vue: "xml",
	jsonc: "json",
	scss: "css",
	less: "css",
	rs: "rust",
	golang: "go",
};

export function highlightCode(code: string, language?: string): string {
	const key = language?.trim().toLowerCase();
	const normalized = key ? (FENCE_LANGUAGE_ALIASES[key] ?? key) : "";
	if (!normalized || !hljs.getLanguage(normalized)) return escapeHtml(code);
	try {
		return hljs.highlight(code, { language: normalized, ignoreIllegals: true }).value;
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
