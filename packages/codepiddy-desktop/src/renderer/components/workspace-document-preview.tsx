import jsPreviewDocx from "@js-preview/docx";
import { useEffect, useRef, useState } from "react";
import "@js-preview/docx/lib/index.css";
import jsPreviewExcel from "@js-preview/excel";
import "@js-preview/excel/lib/index.css";
import type { WorkspaceDocumentFormat } from "@codepiddy/shared";
import jsPreviewPdf from "@js-preview/pdf";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.js?url";
import { init as initPptxPreview } from "pptx-preview";
import { StateBlock } from "./state-block.tsx";

export type DocumentPreviewKind = WorkspaceDocumentFormat | "pdf";

declare global {
	interface Window {
		pdfjsLib?: typeof pdfjsLib;
	}
}

/**
 * `@js-preview/pdf` 默认把 pdf.js 和 worker 以 data: URL 注入页面，会被 Electron 的
 * script-src / worker-src 拦掉。改为提前挂载本地 pdfjs-dist 和同源 worker：
 * 库检测到 window.pdfjsLib 已存在就不再注入 data: 脚本。
 */
function ensureLocalPdfjs(): void {
	if (window.pdfjsLib) return;
	pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
	window.pdfjsLib = pdfjsLib;
}

interface DocumentPreviewer {
	preview(source: ArrayBuffer): Promise<unknown>;
	destroy(): void;
}

/** PPTX 渲染尺寸直接决定幻灯片画布大小，跟着容器宽度走，避免窄面板出现横向滚动。 */
const PPTX_MIN_WIDTH = 280;

function pptxViewport(container: HTMLElement): { width: number; height: number } {
	const width = Math.max(PPTX_MIN_WIDTH, Math.round(container.clientWidth) || 960);
	return { width, height: Math.round((width * 9) / 16) };
}

/**
 * 四种文档格式来自同一套渲染库（vue-office 的框架无关内核），接口一致：
 * 先在容器上 init，再把 ArrayBuffer 交给 preview，卸载时 destroy。
 */
function createPreviewer(kind: DocumentPreviewKind, container: HTMLElement): DocumentPreviewer {
	switch (kind) {
		case "docx":
			return jsPreviewDocx.init(container, { breakPages: true, renderHeaders: true, renderFooters: true });
		case "xlsx":
			return jsPreviewExcel.init(container);
		case "pdf":
			ensureLocalPdfjs();
			return jsPreviewPdf.init(container);
		case "pptx": {
			const viewport = pptxViewport(container);
			return initPptxPreview(container, viewport);
		}
	}
}

/**
 * 文档预览容器。渲染库直接操作 DOM，所以这里只负责挂载/销毁生命周期，
 * 失败时回退到统一的 StateBlock 错误态。
 */
export function WorkspaceDocumentPreview({ kind, buffer }: { kind: DocumentPreviewKind; buffer: ArrayBuffer }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		let cancelled = false;
		let previewer: DocumentPreviewer | null = null;
		setError(null);
		const frame = window.requestAnimationFrame(() => {
			if (cancelled) return;
			try {
				previewer = createPreviewer(kind, container);
				void Promise.resolve(previewer.preview(buffer)).catch((reason: unknown) => {
					if (cancelled) return;
					setError(reason instanceof Error ? reason.message : "文档渲染失败");
				});
			} catch (reason) {
				if (cancelled) return;
				setError(reason instanceof Error ? reason.message : "文档渲染失败");
			}
		});
		return () => {
			cancelled = true;
			window.cancelAnimationFrame(frame);
			try {
				previewer?.destroy();
			} catch {
				// 库内部销毁失败不阻塞切换文件。
			}
			container.replaceChildren();
		};
	}, [kind, buffer]);

	if (error) {
		return (
			<StateBlock tone="error" title="文档渲染失败">
				{error}
			</StateBlock>
		);
	}
	return <div className={`workspace-file-document is-${kind}`} ref={containerRef} />;
}
