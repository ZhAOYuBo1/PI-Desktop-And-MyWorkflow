import { FitAddon } from "@xterm/addon-fit";
import { type ITheme, Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { Trash2 } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { PanelIconButton } from "./panel-icon-button.tsx";
import { StateBlock } from "./state-block.tsx";

const TERMINAL_THEME: ITheme = {
	background: "#ffffff",
	foreground: "#17181a",
	cursor: "#2563eb",
	cursorAccent: "#ffffff",
	selectionBackground: "rgba(37, 99, 235, 0.22)",
	black: "#17181a",
	red: "#b91c1c",
	green: "#15803d",
	yellow: "#8a5a00",
	blue: "#1d4ed8",
	magenta: "#7c3aed",
	cyan: "#0e7490",
	// PSReadLine 的默认/参数颜色落在 ANSI 7/15 上；浅色主题下必须把它们压深，
	// 否则就是截图里那种白底浅灰看不见的情况。
	white: "#4a4c50",
	brightBlack: "#6e7075",
	brightRed: "#dc2626",
	brightGreen: "#047857",
	brightYellow: "#d97706",
	brightBlue: "#2563eb",
	brightMagenta: "#6d28d9",
	brightCyan: "#0369a1",
	brightWhite: "#17181a",
};

export const TerminalPane = memo(function TerminalPane({ projectRoot }: { projectRoot: string }) {
	const [terminalId] = useState(() => crypto.randomUUID());
	const [shell, setShell] = useState("终端");
	const [status, setStatus] = useState<"starting" | "ready" | "exited" | "error">("starting");
	const [error, setError] = useState<string | null>(null);
	const hostRef = useRef<HTMLDivElement | null>(null);
	const terminalRef = useRef<Terminal | null>(null);

	useEffect(() => {
		if (!("codepiddy" in window)) {
			setError("终端只在桌面客户端中可用。");
			setStatus("error");
			return;
		}
		const host = hostRef.current;
		if (!host) return;
		let disposed = false;
		const terminal = new Terminal({
			allowProposedApi: true,
			cursorBlink: true,
			cursorStyle: "bar",
			fontFamily: '"Monaspace Argon", "Maple Mono NF CN", ui-monospace, Consolas, monospace',
			fontSize: 12.5,
			lineHeight: 1.2,
			scrollback: 5_000,
			theme: TERMINAL_THEME,
		});
		const fit = new FitAddon();
		terminal.loadAddon(fit);
		terminal.open(host);
		terminalRef.current = terminal;

		const fitAndReport = (): void => {
			try {
				fit.fit();
			} catch {
				return;
			}
			const dimensions = fit.proposeDimensions();
			if (!dimensions || disposed) return;
			void window.codepiddy
				.resizeTerminal({ terminalId, cols: dimensions.cols, rows: dimensions.rows })
				.catch(() => undefined);
		};

		fitAndReport();
		const initial = fit.proposeDimensions() ?? { cols: 80, rows: 24 };

		const off = window.codepiddy.onTerminalEvent((event) => {
			if (event.terminalId !== terminalId) return;
			if (event.type === "data" && event.data) {
				terminal.write(event.data);
			} else if (event.type === "error") {
				setError(event.data || "终端进程出错。");
				setStatus("error");
			} else if (event.type === "exit") {
				setStatus("exited");
			}
		});

		terminal.attachCustomKeyEventHandler((event) => {
			if (event.type !== "keydown") return true;
			const copyModifier = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c";
			if (!copyModifier) return true;
			const selection = terminal.getSelection();
			if (!selection) return true;
			void navigator.clipboard.writeText(selection).catch(() => undefined);
			terminal.clearSelection();
			return false;
		});

		const dataDisposable = terminal.onData((data) => {
			void window.codepiddy.writeTerminal({ terminalId, data }).catch(() => undefined);
		});

		void window.codepiddy
			.startTerminal({ terminalId, projectRoot, cols: initial.cols, rows: initial.rows })
			.then((info) => {
				if (disposed) return;
				setShell(info.shell);
				if (info.fontFamily) {
					terminal.options.fontFamily = `"${info.fontFamily}", ${terminal.options.fontFamily}`;
				}
				if (typeof info.fontSize === "number" && info.fontSize >= 9 && info.fontSize <= 20) {
					terminal.options.fontSize = info.fontSize;
				}
				if (info.cursorStyle) terminal.options.cursorStyle = info.cursorStyle;
				fitAndReport();
				setStatus("ready");
				terminal.focus();
			})
			.catch((caught: unknown) => {
				if (disposed) return;
				setError(caught instanceof Error ? caught.message : "启动终端失败。");
				setStatus("error");
			});

		const resizeObserver = new ResizeObserver(() => {
			requestAnimationFrame(fitAndReport);
		});
		resizeObserver.observe(host);

		return () => {
			disposed = true;
			resizeObserver.disconnect();
			dataDisposable.dispose();
			off();
			terminal.dispose();
			terminalRef.current = null;
			void window.codepiddy.killTerminal(terminalId).catch(() => undefined);
		};
	}, [projectRoot, terminalId]);

	return (
		<div className="terminal-pane">
			<div className="terminal-toolbar">
				<span className={`terminal-status is-${status}`}>
					<span className="terminal-status-dot" aria-hidden="true" />
					{shell}
				</span>
				<PanelIconButton
					label="清空终端"
					onClick={() => {
						terminalRef.current?.clear();
						terminalRef.current?.focus();
					}}
				>
					<Trash2 size={14} strokeWidth={2} />
				</PanelIconButton>
			</div>
			<div className="terminal-host" ref={hostRef} />
			{error ? <StateBlock compact tone="error" title={error} /> : null}
		</div>
	);
});
