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

/** 轮内首条 createdAt 到末条的毫秒差，缺失或非法返回 null（轮头省略用时）。 */
export function turnElapsedMs<T>(turn: TranscriptTurn<T>): number | null {
	if (!turn.startedAt || !turn.endedAt) return null;
	const ms = Date.parse(turn.endedAt) - Date.parse(turn.startedAt);
	return Number.isFinite(ms) && ms >= 0 ? ms : null;
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
 * 把一轮切成三段：用户消息（永展）、中间过程（可折）、最终结果（永展）。
 * 一轮内最后一条 AI 回复即最终结果；它之后的记录（若有）同属永展段。
 */
export function splitTurnEntries<T extends { type: string }>(
	turn: TranscriptTurn<T>,
): {
	head: TurnEntry<T>[];
	middle: TurnEntry<T>[];
	tail: TurnEntry<T>[];
} {
	let lastUser = -1;
	let lastAssistant = -1;
	turn.entries.forEach((entry, index) => {
		if (entry.item.type === "user") lastUser = index;
		if (entry.item.type === "assistant") lastAssistant = index;
	});
	const hasUser = lastUser >= 0;
	const hasAssistant = lastAssistant >= 0;
	// 纯原生 session entry（例如新会话刚切换模型 / 思考强度）没有 user 和
	// assistant，不应被包装成一轮「过程」；全部作为普通时间线行显示。
	const headEnd = hasUser ? lastUser : hasAssistant ? 0 : turn.entries.length - 1;
	const tailStart = hasAssistant && lastAssistant > headEnd ? lastAssistant : turn.entries.length;
	const head: TurnEntry<T>[] = [];
	const middle: TurnEntry<T>[] = [];
	const tail: TurnEntry<T>[] = [];
	turn.entries.forEach((entry, index) => {
		if (index <= headEnd) head.push(entry);
		else if (index >= tailStart) tail.push(entry);
		else middle.push(entry);
	});
	return { head, middle, tail };
}

/**
 * 轮内中间过程默认折叠态：只有「最新一轮且 Agent 仍在运行」默认展开，其余默认折叠。
 * 用户手动切换过的轮次始终以手动状态为准。
 */
export function resolveTurnCollapsed(
	manual: boolean | undefined,
	options: { isLatest: boolean; running: boolean },
): boolean {
	return manual ?? !(options.isLatest && options.running);
}
