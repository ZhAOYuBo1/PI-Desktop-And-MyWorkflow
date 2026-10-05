import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * 每个会话 pane 自己的滚动控制。隶属一个常驻 DOM 节点，不做跨会话切换，
 * 因此滚动位置天然属于该面板；切换会话只是显隐，不重指内容。
 *
 * 逻辑对齐参考项目 PI-Desktop 的 use-follow-scroll：
 * - 只有真实输入（滚轮/触摸/指针/键盘）才算用户手势，程序滚动与布局夹取不算。
 * - 用户主动上滑后解除贴底；内容增量不再把视图拽回底部。
 * - 隐藏面板保留布局盒（content-visibility: hidden），显示时恢复上次偏移。
 */
function isTranscriptGesture(event: Event): boolean {
	if (event.type === "keydown" && event.target instanceof HTMLTextAreaElement) {
		return (event as KeyboardEvent).shiftKey === false;
	}
	return true;
}

const GESTURES: Array<keyof HTMLElementEventMap> = [
	"wheel",
	"touchstart",
	"touchmove",
	"pointerdown",
	"mousedown",
	"keydown",
];

const FOLLOW_TOLERANCE_PX = 1;
const NOISE_TOLERANCE_PX = 1.5;
const GESTURE_WINDOW_MS = 420;
const SHOW_JUMP_THRESHOLD_PX = 160;

interface UseTranscriptScrollOptions {
	/** 首次挂载时要恢复的偏移；为空表示贴底。 */
	initialOffset: number | null;
	/** 会话是否运行中；运行中时贴底的面板继续跟随。 */
	isRunning: boolean;
	/** 内容条目数，用于检测 React 提交带来的高度变化。 */
	contentLength: number;
	/** 变化时把该面板滚动重置为贴底（例如同一 Agent 切换 Session）。 */
	resetKey: string;
	/** 面板是否可见。隐藏时暂停跟随，显示时恢复上次位置。 */
	visible: boolean;
	/** 真实用户滚动后回调当前偏移，用于持久化。 */
	onScrollPosition?: (offset: number) => void;
	/** 滚动或内容变化后回调当前视口中心最近的条目下标。 */
	onActiveIndexChange?: (index: number) => void;
}

export interface TranscriptScrollController {
	scrollRef: RefObject<HTMLDivElement | null>;
	showJump: boolean;
	handleScroll: () => void;
	jumpToLatest: () => void;
	/** 退出 follow 并执行调用方提供的程序性滚动，例如 minimap 跳转。 */
	runJump: (position: () => void) => void;
}

export function useTranscriptScroll({
	initialOffset,
	isRunning,
	contentLength,
	resetKey,
	visible,
	onScrollPosition,
	onActiveIndexChange,
}: UseTranscriptScrollOptions): TranscriptScrollController {
	const nodeRef = useRef<HTMLDivElement | null>(null);
	const pinnedRef = useRef(initialOffset === null);
	const pendingRestoreRef = useRef<number | null>(initialOffset);
	const lastOffsetRef = useRef(0);
	const lastLaidOutOffsetRef = useRef(0);
	const lastGestureAtRef = useRef(Number.NEGATIVE_INFINITY);
	const userScrolledRef = useRef(false);
	const wasVisibleRef = useRef(visible);
	const lastResetKeyRef = useRef(resetKey);
	const wasRunningRef = useRef(isRunning);
	const [showJump, setShowJump] = useState(false);

	const reportRef = useRef(onScrollPosition);
	reportRef.current = onScrollPosition;
	const report = useCallback((offset: number) => reportRef.current?.(offset), []);

	const activeIndexRef = useRef(onActiveIndexChange);
	activeIndexRef.current = onActiveIndexChange;
	const reportActiveIndex = useCallback((element: HTMLDivElement) => {
		const callback = activeIndexRef.current;
		if (!callback) return;
		const entries = element.querySelectorAll<HTMLElement>("[data-transcript-index]");
		if (entries.length === 0) return;
		const viewportCenter = element.scrollTop + element.clientHeight / 2;
		let activeIndex = 0;
		let nearest = Number.POSITIVE_INFINITY;
		for (const entry of entries) {
			const index = Number.parseInt(entry.dataset.transcriptIndex ?? "0", 10);
			const center = entry.offsetTop + entry.offsetHeight / 2;
			const distance = Math.abs(center - viewportCenter);
			if (distance < nearest) {
				nearest = distance;
				activeIndex = index;
			}
		}
		callback(activeIndex);
	}, []);

	const applyPosition = useCallback(
		(element: HTMLDivElement): void => {
			const pending = pendingRestoreRef.current;
			if (pending !== null) {
				element.scrollTop = pending;
				pinnedRef.current = false;
				// 内容还未挂载完时浏览器会把 scrollTop 夹到较小的最大值。只有真正
				// 落到目标才结束恢复，否则保持目标继续重试，避免夹取值变成新目标。
				if (Math.abs(element.scrollTop - pending) < 0.5) pendingRestoreRef.current = null;
			} else if (pinnedRef.current) {
				element.scrollTop = element.scrollHeight;
			}
			lastOffsetRef.current = element.scrollTop;
			lastLaidOutOffsetRef.current = element.scrollTop;
			const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
			setShowJump(distanceToBottom > SHOW_JUMP_THRESHOLD_PX);
			reportActiveIndex(element);
			return;
		},
		[reportActiveIndex],
	);

	// 首次挂载：恢复保存的位置，或贴底。
	useLayoutEffect(() => {
		const element = nodeRef.current;
		if (element) applyPosition(element);
	}, [applyPosition]);

	// 同一面板复用到新会话（例如 Agent 内切换 Session）时回到最新消息。
	useLayoutEffect(() => {
		if (lastResetKeyRef.current === resetKey) return;
		lastResetKeyRef.current = resetKey;
		pendingRestoreRef.current = null;
		pinnedRef.current = true;
		const element = nodeRef.current;
		if (element) {
			element.scrollTop = element.scrollHeight;
			lastOffsetRef.current = element.scrollTop;
			lastLaidOutOffsetRef.current = element.scrollTop;
		}
		setShowJump(false);
	}, [resetKey]);

	// 后端持久化的滚动值可能在面板挂载之后才读回来；此时补做一次恢复。
	const lastInitialOffsetRef = useRef(initialOffset);
	useLayoutEffect(() => {
		if (initialOffset === null || initialOffset === lastInitialOffsetRef.current) return;
		lastInitialOffsetRef.current = initialOffset;
		if (userScrolledRef.current) return;
		pendingRestoreRef.current = initialOffset;
		pinnedRef.current = false;
		const element = nodeRef.current;
		if (element) applyPosition(element);
	}, [applyPosition, initialOffset]);

	// 新一轮开始时，仍贴底的面板立刻跟到最新内容。
	useLayoutEffect(() => {
		const started = isRunning && !wasRunningRef.current;
		wasRunningRef.current = isRunning;
		if (!started || !pinnedRef.current) return;
		const element = nodeRef.current;
		if (!element) return;
		element.scrollTop = element.scrollHeight;
		lastOffsetRef.current = element.scrollTop;
		lastLaidOutOffsetRef.current = element.scrollTop;
	}, [isRunning]);

	// 内容变化或可见性恢复时重新定位。
	useEffect(() => {
		void contentLength;
		const element = nodeRef.current;
		if (!element || !visible) return;
		applyPosition(element);
	}, [applyPosition, contentLength, visible]);

	// 面板显隐：隐藏时记录最后的布局偏移，显示时恢复。隐藏面板的
	// content-visibility 会让 scrollTop 读数不可靠，所以必须记下来。
	useLayoutEffect(() => {
		const element = nodeRef.current;
		const becameHidden = wasVisibleRef.current && !visible;
		const becameVisible = !wasVisibleRef.current && visible;
		wasVisibleRef.current = visible;
		if (!element) return;
		if (becameHidden) {
			if (Number.isFinite(lastOffsetRef.current)) lastLaidOutOffsetRef.current = lastOffsetRef.current;
			return;
		}
		if (!becameVisible) return;
		if (pendingRestoreRef.current !== null) {
			applyPosition(element);
			return;
		}
		if (pinnedRef.current) {
			element.scrollTop = element.scrollHeight;
			lastOffsetRef.current = element.scrollTop;
			lastLaidOutOffsetRef.current = element.scrollTop;
			return;
		}
		element.scrollTop = lastLaidOutOffsetRef.current;
		lastOffsetRef.current = element.scrollTop;
	}, [applyPosition, visible]);

	// 用户输入先于 scroll 事件到达，用于区分真实手势和程序滚动。
	useEffect(() => {
		const element = nodeRef.current;
		if (!element) return;
		const mark = (event: Event): void => {
			if (isTranscriptGesture(event)) lastGestureAtRef.current = performance.now();
		};
		for (const type of GESTURES) element.addEventListener(type, mark, { passive: true });
		return () => {
			for (const type of GESTURES) element.removeEventListener(type, mark);
		};
	}, []);

	// 流式 Markdown、图片、字体与折叠都会改变高度而不触发 React 提交。
	useEffect(() => {
		const element = nodeRef.current;
		if (!element || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => {
			const node = nodeRef.current;
			if (!node || !visible) return;
			if (pendingRestoreRef.current !== null) {
				applyPosition(node);
				return;
			}
			if (!pinnedRef.current) return;
			node.scrollTop = node.scrollHeight;
			lastOffsetRef.current = node.scrollTop;
			lastLaidOutOffsetRef.current = node.scrollTop;
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [applyPosition, visible]);

	const handleScroll = useCallback(() => {
		const element = nodeRef.current;
		if (!element) return;
		const gesturing = performance.now() - lastGestureAtRef.current < GESTURE_WINDOW_MS;
		const current = element.scrollTop;
		const previous = lastOffsetRef.current;
		const distanceToBottom = element.scrollHeight - current - element.clientHeight;
		const atBottom = distanceToBottom <= (gesturing ? FOLLOW_TOLERANCE_PX : NOISE_TOLERANCE_PX);
		lastOffsetRef.current = current;
		if (Number.isFinite(current)) lastLaidOutOffsetRef.current = current;

		if (gesturing) {
			userScrolledRef.current = true;
			pendingRestoreRef.current = null;
			if (current < previous - FOLLOW_TOLERANCE_PX) pinnedRef.current = false;
			else if (atBottom) pinnedRef.current = true;
			// 只有真实手势才把位置写回，程序滚动/布局夹取不算。
			report(current);
		} else if (pendingRestoreRef.current === null && pinnedRef.current && !atBottom) {
			// 布局夹取造成的偏移：保持 follow，不改变状态。
			pinnedRef.current = true;
		}

		setShowJump(!pinnedRef.current && distanceToBottom > SHOW_JUMP_THRESHOLD_PX);
	}, [report]);

	const jumpToLatest = useCallback(() => {
		const element = nodeRef.current;
		if (!element) return;
		pendingRestoreRef.current = null;
		pinnedRef.current = true;
		setShowJump(false);
		element.scrollTop = element.scrollHeight;
		lastOffsetRef.current = element.scrollTop;
		lastLaidOutOffsetRef.current = element.scrollTop;
		report(element.scrollTop);
	}, [report]);

	const runJump = useCallback((position: () => void) => {
		pendingRestoreRef.current = null;
		pinnedRef.current = false;
		setShowJump(true);
		position();
	}, []);

	return { scrollRef: nodeRef, showJump, handleScroll, jumpToLatest, runJump };
}
