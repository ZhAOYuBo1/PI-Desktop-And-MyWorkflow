import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * 每个会话 pane 自己的滚动控制。隶属一个常驻 DOM 节点，不做跨会话切换，
 * 因此滚动位置天然属于该面板；切换会话只是显隐，不重指内容。
 *
 * 逻辑对齐参考项目 PI-Desktop 的 use-follow-scroll：
 * - 只有真实输入（滚轮/触摸/指针/键盘）才算用户手势，程序滚动与布局夹取不算。
 * - 用户主动上滑后解除贴底；内容增量不再把视图拽回底部。
 * - 观察内容盒（而不是滚动容器本身）：流式 Markdown 只改内容高度，
 *   滚动容器的 border-box 不变，只观察容器永远不会在输出时跟随。
 * - 重新贴底用 48px 近底区间：用户滚回底部附近即恢复跟随，不需要精确到 0px。
 * - 隐藏面板保留布局盒（content-visibility: hidden），显示时恢复上次偏移。
 */
const CONTROL_SELECTOR = [
	"button",
	"a",
	"input",
	"textarea",
	"select",
	"summary",
	"[contenteditable='true']",
	"[role='button']",
	"[role='link']",
	"[role='tab']",
	"[role='menuitem']",
	"[role='checkbox']",
	"[role='switch']",
	"[role='radio']",
].join(", ");

/** 原生会移动滚动容器的按键；其它按键（含输入框内的普通输入）不算滚动手势。 */
const SCROLL_GESTURE_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

function isTranscriptGesture(event: Event): boolean {
	const target = event.target;
	const onControl = target instanceof Element && target.closest(CONTROL_SELECTOR) !== null;
	if (event.type === "keydown") {
		if (onControl) return false;
		return SCROLL_GESTURE_KEYS.has((event as KeyboardEvent).key);
	}
	if (event.type === "pointerdown" || event.type === "mousedown") return !onControl;
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
const NOISE_TOLERANCE_PX = 1;
/** 距底部小于该值且向下滚动时恢复跟随，对齐参考项目。 */
const REPIN_THRESHOLD_PX = 48;
const GESTURE_WINDOW_MS = 200;
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
}

export interface TranscriptScrollController {
	scrollRef: RefObject<HTMLDivElement | null>;
	/** 内容盒。高度随流式输出增长，ResizeObserver 依赖它来保持贴底。 */
	contentRef: RefObject<HTMLDivElement | null>;
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
}: UseTranscriptScrollOptions): TranscriptScrollController {
	const nodeRef = useRef<HTMLDivElement | null>(null);
	const contentRef = useRef<HTMLDivElement | null>(null);
	const pinnedRef = useRef(initialOffset === null);
	const pendingRestoreRef = useRef<number | null>(initialOffset);
	const lastOffsetRef = useRef(0);
	const lastLaidOutOffsetRef = useRef(0);
	const lastGestureAtRef = useRef(Number.NEGATIVE_INFINITY);
	const userScrolledRef = useRef(false);
	const followFrameRef = useRef(0);
	const wasVisibleRef = useRef(visible);
	const lastResetKeyRef = useRef(resetKey);
	const wasRunningRef = useRef(isRunning);
	const [showJump, setShowJump] = useState(false);

	const reportRef = useRef(onScrollPosition);
	reportRef.current = onScrollPosition;
	const report = useCallback((offset: number) => reportRef.current?.(offset), []);
	const visibleRef = useRef(visible);
	visibleRef.current = visible;

	const pinToBottom = useCallback((element: HTMLDivElement): void => {
		element.scrollTop = element.scrollHeight;
		// 记录浏览器实际落到的位置：小数 DPR 下它与请求值可能差零点几像素，
		// 用请求值会让随后的原生 scroll 事件被误判成用户上滑。
		lastOffsetRef.current = element.scrollTop;
		lastLaidOutOffsetRef.current = element.scrollTop;
	}, []);

	const cancelFollowScroll = useCallback((): void => {
		if (followFrameRef.current === 0) return;
		cancelAnimationFrame(followFrameRef.current);
		followFrameRef.current = 0;
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
				pinToBottom(element);
			}
			lastOffsetRef.current = element.scrollTop;
			lastLaidOutOffsetRef.current = element.scrollTop;
			const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
			setShowJump(distanceToBottom > SHOW_JUMP_THRESHOLD_PX);
			return;
		},
		[pinToBottom],
	);

	// 在布局阶段同步贴底，避免 ResizeObserver 里再排一帧导致先画出一帧未跟随的内容。
	const followScrollNow = useCallback((): void => {
		const element = nodeRef.current;
		if (!element || !visibleRef.current) return;
		if (pendingRestoreRef.current !== null) {
			applyPosition(element);
			return;
		}
		if (!pinnedRef.current) return;
		cancelFollowScroll();
		pinToBottom(element);
	}, [applyPosition, cancelFollowScroll, pinToBottom]);

	const scheduleFollowScroll = useCallback((): void => {
		if (!visibleRef.current || !pinnedRef.current || followFrameRef.current !== 0) return;
		followFrameRef.current = requestAnimationFrame(() => {
			followFrameRef.current = 0;
			if (!visibleRef.current || !pinnedRef.current) return;
			const element = nodeRef.current;
			if (!element) return;
			pinToBottom(element);
		});
	}, [pinToBottom]);

	// 首次挂载：恢复保存的位置，或贴底。
	useLayoutEffect(() => {
		const element = nodeRef.current;
		if (element) applyPosition(element);
	}, [applyPosition]);

	// 同一面板复用到新会话（例如 Agent 内切换 Session）时回到最新消息。
	useLayoutEffect(() => {
		if (lastResetKeyRef.current === resetKey) return;
		lastResetKeyRef.current = resetKey;
		cancelFollowScroll();
		pendingRestoreRef.current = null;
		pinnedRef.current = true;
		const element = nodeRef.current;
		if (element) {
			pinToBottom(element);
		}
		setShowJump(false);
	}, [cancelFollowScroll, pinToBottom, resetKey]);

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
		pinToBottom(element);
		scheduleFollowScroll();
	}, [isRunning, pinToBottom, scheduleFollowScroll]);

	// 内容变化或可见性恢复时重新定位。
	useEffect(() => {
		void contentLength;
		const element = nodeRef.current;
		if (!element || !visible) return;
		applyPosition(element);
	}, [applyPosition, contentLength, visible]);

	// 每次提交后补排一次跟随：流式输出常常只改同一个条目的正文，
	// contentLength 不变，必须靠这里 + 内容盒 ResizeObserver 一起兜住。
	useLayoutEffect(() => {
		scheduleFollowScroll();
	});

	// 面板显隐：隐藏时记录最后的布局偏移，显示时恢复。隐藏面板的
	// content-visibility 会让 scrollTop 读数不可靠，所以必须记下来。
	useLayoutEffect(() => {
		const element = nodeRef.current;
		const becameHidden = wasVisibleRef.current && !visible;
		const becameVisible = !wasVisibleRef.current && visible;
		wasVisibleRef.current = visible;
		if (!element) return;
		if (becameHidden) {
			cancelFollowScroll();
			if (Number.isFinite(lastOffsetRef.current)) lastLaidOutOffsetRef.current = lastOffsetRef.current;
			return;
		}
		if (!becameVisible) return;
		if (pendingRestoreRef.current !== null) {
			applyPosition(element);
			return;
		}
		if (pinnedRef.current) {
			pinToBottom(element);
			return;
		}
		element.scrollTop = lastLaidOutOffsetRef.current;
		lastOffsetRef.current = element.scrollTop;
	}, [applyPosition, cancelFollowScroll, pinToBottom, visible]);

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

	// 流式 Markdown、图片、字体与折叠都会改变内容高度。必须观察内容盒本身：
	// 滚动容器的 border-box 在输出期间不变，只观察它会漏掉全部增量。
	useEffect(() => {
		const content = contentRef.current;
		const scroller = nodeRef.current;
		if (!scroller || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => followScrollNow());
		if (content) observer.observe(content, { box: "border-box" });
		observer.observe(scroller, { box: "border-box" });
		return () => observer.disconnect();
	}, [followScrollNow]);

	useEffect(() => cancelFollowScroll, [cancelFollowScroll]);

	const handleScroll = useCallback(() => {
		const element = nodeRef.current;
		if (!element) return;
		const gesturing = performance.now() - lastGestureAtRef.current < GESTURE_WINDOW_MS;
		const current = element.scrollTop;
		const previous = lastOffsetRef.current;
		const distanceToBottom = Math.max(0, element.scrollHeight - current - element.clientHeight);
		const tolerance = gesturing ? FOLLOW_TOLERANCE_PX : NOISE_TOLERANCE_PX;
		const movedUp = current < previous - tolerance;
		const movedDown = current > previous + tolerance;
		const nearBottom = distanceToBottom < REPIN_THRESHOLD_PX;
		// 只有真的离开了底部才算解除跟随；到底部的夹取不解除。
		const releasedFollow = movedUp && distanceToBottom > 0;
		const wasPinned = pinnedRef.current;
		lastOffsetRef.current = current;
		if (Number.isFinite(current)) lastLaidOutOffsetRef.current = current;

		if (gesturing) {
			userScrolledRef.current = true;
			pendingRestoreRef.current = null;
			// 只有真实手势才把位置写回，程序滚动/布局夹取不算。
			report(current);
		}

		if (gesturing && releasedFollow) {
			// 用户主动上滑：解除跟随，不再把视图拽回底部。
			cancelFollowScroll();
			pinnedRef.current = false;
		} else if (releasedFollow) {
			// 程序滚动或布局夹取：保持原 follow 状态，并重新贴底。
			pinnedRef.current = wasPinned;
			scheduleFollowScroll();
		} else {
			// 向下滚到近底区间即可恢复跟随，不必精确滚到 0px。
			pinnedRef.current = wasPinned || (movedDown && nearBottom);
		}

		setShowJump(!pinnedRef.current && distanceToBottom > SHOW_JUMP_THRESHOLD_PX);
	}, [cancelFollowScroll, report, scheduleFollowScroll]);

	const jumpToLatest = useCallback(() => {
		const element = nodeRef.current;
		if (!element) return;
		cancelFollowScroll();
		pendingRestoreRef.current = null;
		pinnedRef.current = true;
		userScrolledRef.current = true;
		setShowJump(false);
		pinToBottom(element);
		report(element.scrollTop);
	}, [cancelFollowScroll, pinToBottom, report]);

	const runJump = useCallback(
		(position: () => void) => {
			cancelFollowScroll();
			pendingRestoreRef.current = null;
			pinnedRef.current = false;
			userScrolledRef.current = true;
			setShowJump(true);
			position();
		},
		[cancelFollowScroll],
	);

	return { scrollRef: nodeRef, contentRef, showJump, handleScroll, jumpToLatest, runJump };
}
