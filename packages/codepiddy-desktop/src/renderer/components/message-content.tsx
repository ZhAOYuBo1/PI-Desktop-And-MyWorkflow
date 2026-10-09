import {
	type ComponentProps,
	createContext,
	isValidElement,
	memo,
	type ReactNode,
	useContext,
	useMemo,
	useState,
} from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { highlightCode } from "../file-syntax.ts";
import { looksLikeFilePath } from "./file-path.ts";

// 消息正文的 markdown 渲染。参考项目用 react-markdown 这一套（GFM + 数学 +
// 原始 HTML 经 sanitize 后渲染），这里沿用它的插件组合，但代码块外观保留我们
// 自己的「换行 / 复制 / 折叠 / 展开全部」工具条，高亮继续用仓库已有的 highlight.js。

const COLLAPSE_LINE_THRESHOLD = 24;
const COLLAPSE_LENGTH_THRESHOLD = 3000;

// 消息正文里的文件 chip 需要打开右侧工作区文件视图。回调由 App 注入，缺省时
// 行内代码保持普通样式（文件预览里的 markdown 就不带这个行为）。
const MessageFileOpenContext = createContext<((path: string) => void) | null>(null);

function openExternalLink(url: string): void {
	// 浏览器（?demo=1 的验证环境）里没有 preload 桥，退回 window.open。
	if (!window.codepiddy) {
		window.open(url, "_blank", "noopener,noreferrer");
		return;
	}
	void window.codepiddy.openExternalUrl(url).catch(() => {});
}

function MessageCodeBlock({ value, language }: { value: string; language?: string }) {
	const [copied, setCopied] = useState(false);
	// 长代码默认折叠。折叠是真的截断（overflow:hidden + 渐隐），不是把滚动框缩小。
	const [collapsed, setCollapsed] = useState(
		value.length > COLLAPSE_LENGTH_THRESHOLD || value.split("\n").length > COLLAPSE_LINE_THRESHOLD,
	);
	// 默认换行：桌面端代码列窄，不换行的话横向滚动条几乎每块都在。
	const [wrapped, setWrapped] = useState(true);
	const code = value.replace(/\n$/, "");
	const highlighted = useMemo(() => highlightCode(code, language), [code, language]);
	const codeClassName = language ? `language-${language}` : undefined;
	async function copyCode(): Promise<void> {
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);
			setTimeout(() => setCopied(false), 1400);
		} catch {}
	}
	return (
		<div className={`message-code-block ${collapsed ? "collapsed" : ""} ${wrapped ? "wrapped" : ""}`}>
			<div className="message-code-toolbar">
				<span className="message-code-lang">{language || "code"}</span>
				<div className="message-code-actions">
					<button
						type="button"
						className={wrapped ? "is-active" : ""}
						aria-pressed={wrapped}
						onClick={() => setWrapped((current) => !current)}
					>
						换行
					</button>
					<button type="button" className={copied ? "is-active" : ""} onClick={() => void copyCode()}>
						{copied ? "已复制" : "复制"}
					</button>
					<button type="button" aria-expanded={!collapsed} onClick={() => setCollapsed((current) => !current)}>
						{collapsed ? "展开" : "折叠"}
					</button>
				</div>
			</div>
			<pre>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js escapes source text before emitting token markup */}
				<code className={codeClassName} dangerouslySetInnerHTML={{ __html: highlighted }} />
			</pre>
			{collapsed ? (
				<button type="button" className="message-code-expand" onClick={() => setCollapsed(false)}>
					展开全部代码
				</button>
			) : null}
		</div>
	);
}

// react-markdown 把围栏代码渲染成 <pre><code class="language-x">…</code></pre>，
// 这里从 <pre> 的子元素把源码和语言取回来交给自定义代码块。
function extractFencedCode(children: ReactNode): { code: string; lang: string } | null {
	const element = Array.isArray(children) ? children.find((child) => isValidElement(child)) : children;
	if (!isValidElement(element)) return null;
	const props = element.props as { className?: unknown; children?: unknown };
	const className = typeof props.className === "string" ? props.className : "";
	const lang = /language-(\S+)/.exec(className)?.[1] ?? "";
	const raw = props.children;
	const code =
		typeof raw === "string"
			? raw
			: Array.isArray(raw) && raw.every((part) => typeof part === "string")
				? raw.join("")
				: null;
	if (code === null) return null;
	return { code: code.replace(/\n$/, ""), lang };
}

function PreBlock({ node: _node, children, ...rest }: ComponentProps<"pre"> & { node?: unknown }) {
	const info = extractFencedCode(children);
	if (!info) return <pre {...rest}>{children}</pre>;
	return <MessageCodeBlock value={info.code} language={info.lang || undefined} />;
}

// 行内代码（围栏代码被 PreBlock 截走）。类名在 sanitize 之后由组件补上，不会被清洗。
function InlineCode({ node: _node, className, children, ...rest }: ComponentProps<"code"> & { node?: unknown }) {
	const onOpenFile = useContext(MessageFileOpenContext);
	const text = typeof children === "string" ? children : null;
	if (!className && onOpenFile && text && looksLikeFilePath(text)) {
		return (
			<button type="button" className="message-file-chip" title={`打开 ${text}`} onClick={() => onOpenFile(text)}>
				<code className="inline-code">{text}</code>
			</button>
		);
	}
	return (
		<code className={className ? `inline-code ${className}` : "inline-code"} {...rest}>
			{children}
		</code>
	);
}

// 消息里的链接一律拦截默认跳转，交给系统浏览器打开，避免整个渲染进程被导航走。
function Anchor({ node: _node, href, children, ...rest }: ComponentProps<"a"> & { node?: unknown }) {
	const url = typeof href === "string" ? href : "";
	return (
		<a
			{...rest}
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			onClick={(event) => {
				event.preventDefault();
				if (/^(https?:|mailto:)/i.test(url)) openExternalLink(url);
			}}
		>
			{children}
		</a>
	);
}

// GFM 表格：保留 .message-table-scroll / .message-table 外观，对齐交给 react-markdown
// 写入的行内 text-align。
function Table({ node: _node, children, ...rest }: ComponentProps<"table"> & { node?: unknown }) {
	return (
		<div className="message-table-scroll">
			<table className="message-table" {...rest}>
				{children}
			</table>
		</div>
	);
}

const markdownComponents: Components = {
	pre: PreBlock,
	code: InlineCode,
	a: Anchor,
	table: Table,
};

const remarkPlugins = [remarkGfm, remarkMath] as Options["remarkPlugins"];

// 默认 schema 会丢掉 remark-math 的 math-inline / math-display 类名，导致
// rehype-katex 无法把公式升级成展示级排版；这里补上这两个类。
const sanitizeSchema = {
	...defaultSchema,
	attributes: {
		...defaultSchema.attributes,
		code: [["className", /^language-./, "math-inline", "math-display"]],
	},
};

const rehypePlugins = [rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeKatex] as Options["rehypePlugins"];

export const MessageContent = memo(function MessageContent({
	text,
	onOpenFile,
}: {
	text: string;
	onOpenFile?: (path: string) => void;
}) {
	return (
		<MessageFileOpenContext.Provider value={onOpenFile ?? null}>
			<div className="message-rich-text">
				<ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={markdownComponents}>
					{text}
				</ReactMarkdown>
			</div>
		</MessageFileOpenContext.Provider>
	);
});
