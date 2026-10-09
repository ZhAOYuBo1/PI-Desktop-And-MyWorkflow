// 按轮次分组折叠（desktop-tool-collapse）：纯函数，供 App.tsx 与单测共用。
export interface TurnEntry<T> {
	item: T;
	/** 在整条转录流中的全局下标（跳转定位与统计行判断沿用它）。 */
	index: number;
}

export interface TranscriptTurn<T> {
	/** 首条记录的全局下标派生，追加消息不改变旧轮 id，手动折叠态跨刷新保留。 */
	id: string;
	entries: TurnEntry<T>[];
	startedAt?: string;
	endedAt?: string;
}

export interface TranscriptEntryTiming {
	startedAt?: number;
	endedAt?: number;
}

export type TranscriptTurnBlock<T> =
	| {
			kind: "entry";
			id: string;
			entry: TurnEntry<T>;
	  }
	| {
			kind: "process";
			id: string;
			entries: TurnEntry<T>[];
			startedAt?: number;
			endedAt?: number;
			errorCount: number;
	  };

export interface TranscriptTurnProjectionOptions<T> {
	/** The visible final response. Earlier assistant fragments are process. */
	isFinalEntry(item: T): boolean;
	/** Tool/assistant fragments that belong in the foldable process block. */
	isProcessEntry(item: T): boolean;
	/** Session events and messages that always remain visible timeline rows. */
	isTimelineEvent?(item: T): boolean;
	isProcessError?(item: T): boolean;
	timing?(item: T): TranscriptEntryTiming;
}

/**
 * 一轮 = 一条 user 消息及其之后、下一条 user 消息之前的所有记录；
 * 开头尚未出现 user 消息的记录自成一轮。
 */
export function groupTranscriptIntoTurns<T extends { id: string; type: string; createdAt?: string }>(
	items: T[],
): TranscriptTurn<T>[] {
	const turns: TranscriptTurn<T>[] = [];
	let current: TranscriptTurn<T> | null = null;
	items.forEach((item, index) => {
		if (item.type === "user" || !current) {
			current = { id: `turn-${index}`, entries: [] };
			turns.push(current);
		}
		(current as TranscriptTurn<T>).entries.push({ item, index });
	});
	for (const turn of turns) {
		const times = turn.entries
			.map((entry) => entry.item.createdAt)
			.filter((value): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value)));
		if (times.length > 0) {
			turn.startedAt = times[0];
			turn.endedAt = times[times.length - 1];
		}
	}
	return turns;
}

/** 中文口径：45秒 / 13分钟15秒 / 2小时3分钟。 */
export function formatTurnElapsed(ms: number): string {
	const totalSeconds = Math.max(0, Math.round(ms / 1000));
	if (totalSeconds < 60) return `${totalSeconds}秒`;
	const minutes = Math.floor(totalSeconds / 60);
	if (minutes < 60) {
		const seconds = totalSeconds % 60;
		return seconds === 0 ? `${minutes}分钟` : `${minutes}分钟${seconds}秒`;
	}
	const hours = Math.floor(minutes / 60);
	const restMinutes = minutes % 60;
	return restMinutes === 0 ? `${hours}小时` : `${hours}小时${restMinutes}分钟`;
}

/**
 * 按原始顺序把一轮投影成可见条目和过程块。
 *
 * 参考项目先构建助手回合，再从 ordered parts 中分出 process / response。
 * 这里保留 CodePIddy 的 user-turn 容器，但采用同一原则：
 * - 只有工具和非最终 assistant 片段进入过程；
 * - 用户消息、系统消息和 session event 始终是普通时间线行；
 * - event 会切断过程块，因此 model / thinking 切换不会被折进过程；
 * - 过程和事件保持原始先后顺序，多个过程块也可以共存。
 */
export function projectTranscriptTurn<T>(
	turn: TranscriptTurn<T>,
	options: TranscriptTurnProjectionOptions<T>,
): TranscriptTurnBlock<T>[] {
	const blocks: TranscriptTurnBlock<T>[] = [];
	let processEntries: TurnEntry<T>[] = [];
	let finalEntryIndex = -1;
	turn.entries.forEach((entry, index) => {
		if (options.isFinalEntry(entry.item)) finalEntryIndex = index;
	});

	const flushProcess = (): void => {
		if (processEntries.length === 0) return;
		const timed = processEntries
			.map((entry) => options.timing?.(entry.item))
			.filter((timing): timing is TranscriptEntryTiming => timing !== undefined);
		const starts = timed
			.map((timing) => timing.startedAt)
			.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
		const ends = timed
			.map((timing) => timing.endedAt)
			.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
		const startedAt = starts.length > 0 ? Math.min(...starts) : ends.length > 0 ? Math.min(...ends) : undefined;
		const errorCount = processEntries.filter((entry) => options.isProcessError?.(entry.item) === true).length;
		blocks.push({
			kind: "process",
			id: `process-${processEntries[0]?.index ?? 0}`,
			entries: processEntries,
			...(startedAt !== undefined ? { startedAt } : {}),
			...(ends.length > 0 ? { endedAt: Math.max(...ends) } : {}),
			errorCount,
		});
		processEntries = [];
	};

	turn.entries.forEach((entry, index) => {
		if (
			index === finalEntryIndex ||
			options.isTimelineEvent?.(entry.item) === true ||
			!options.isProcessEntry(entry.item)
		) {
			flushProcess();
			blocks.push({ kind: "entry", id: `entry-${entry.index}`, entry });
			return;
		}
		processEntries.push(entry);
	});
	flushProcess();
	return blocks;
}

/**
 * 过程块默认折叠态，与参考项目一致：
 * - detailed 模式且正在运行：展开；
 * - compact 模式正在运行：默认收起，除非过程里有错误；
 * - 已完成过程：默认收起。
 * 用户手动切换过的过程块始终以手动状态为准。
 */
export function resolveProcessCollapsed(
	manual: boolean | undefined,
	options: { active: boolean; thinkingDisplayMode: "compact" | "detailed"; errorCount: number },
): boolean {
	return manual ?? !(options.active && (options.thinkingDisplayMode === "detailed" || options.errorCount > 0));
}
