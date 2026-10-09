// 消息里的行内代码什么时候算「工作区文件路径」。
// 只认相对路径 + 已知扩展名：像 `0.16.47` 这种版本号、`npm run check` 这种命令
// 都不能被误判成可点击的文件 chip。
const KNOWN_FILE_EXTENSIONS = new Set([
	"ts",
	"tsx",
	"mts",
	"cts",
	"js",
	"jsx",
	"mjs",
	"cjs",
	"json",
	"jsonc",
	"md",
	"markdown",
	"css",
	"scss",
	"less",
	"html",
	"htm",
	"xml",
	"svg",
	"yml",
	"yaml",
	"toml",
	"ini",
	"conf",
	"txt",
	"log",
	"sh",
	"bash",
	"ps1",
	"cmd",
	"bat",
	"py",
	"go",
	"rs",
	"java",
	"c",
	"h",
	"cc",
	"cpp",
	"hpp",
	"cs",
	"sql",
	"vue",
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"ico",
]);

// 相对路径：由 `a/b/` 或 `a\b\` 段组成，最后一段带扩展名。
// 用 Unicode 字符类，中文文件名（小明.txt）也要能识别。
const RELATIVE_FILE_PATH = /^(?:[\p{L}\p{N}_.@-]+[\\/])*[\p{L}\p{N}_.@-]+\.[A-Za-z0-9]{1,8}$/u;

export function looksLikeFilePath(value: string): boolean {
	const text = value.trim();
	if (!text || text.length > 240) return false;
	if (/\s/.test(text)) return false;
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return false;
	if (!RELATIVE_FILE_PATH.test(text)) return false;
	const extension = text.split(".").pop()?.toLowerCase() ?? "";
	return KNOWN_FILE_EXTENSIONS.has(extension);
}
