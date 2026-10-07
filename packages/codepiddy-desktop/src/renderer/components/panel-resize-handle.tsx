import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef } from "react";

interface PanelResizeHandleProps {
	label: string;
	className?: string;
	onResizeStart?(): void;
	onResize(delta: number): void;
	onResizeEnd?(): void;
	onReset?(): void;
}

export function PanelResizeHandle({
	label,
	className,
	onResizeStart,
	onResize,
	onResizeEnd,
	onReset,
}: PanelResizeHandleProps) {
	const callbacksRef = useRef({ onResizeStart, onResize, onResizeEnd, onReset });
	const cleanupRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		callbacksRef.current = { onResizeStart, onResize, onResizeEnd, onReset };
	}, [onReset, onResize, onResizeEnd, onResizeStart]);

	useEffect(
		() => () => {
			cleanupRef.current?.();
		},
		[],
	);

	const onMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
		event.preventDefault();
		cleanupRef.current?.();
		callbacksRef.current.onResizeStart?.();
		const startX = event.clientX;
		document.body.style.userSelect = "none";

		const onMove = (moveEvent: MouseEvent): void => {
			callbacksRef.current.onResize(moveEvent.clientX - startX);
		};
		function cleanup(): void {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
			document.body.style.userSelect = "";
			cleanupRef.current = null;
		}
		function onUp(): void {
			cleanup();
			callbacksRef.current.onResizeEnd?.();
		}

		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
		cleanupRef.current = cleanup;
	}, []);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: 复用工作区原鼠标拖拽手柄，键盘调整宽度不属于当前交互
		<div
			className={`work-panel-resize${className ? ` ${className}` : ""}`}
			title={label}
			onMouseDown={onMouseDown}
			onDoubleClick={() => callbacksRef.current.onReset?.()}
		/>
	);
}
