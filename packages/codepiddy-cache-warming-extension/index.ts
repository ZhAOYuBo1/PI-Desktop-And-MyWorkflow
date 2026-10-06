import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Pi 1.0.1 没有把 session.cacheWarmingStatus 暴露给 RPC，只通过扩展事件
 * cache_warming_decision 提供每次预热决策的经济数据。这个扩展把最近一次决策写进状态文件，
 * 桌面端读取后展示；不修改 Pi core，也不覆盖 Pi 自己的决策。
 *
 * 仓库里 vendored 的扩展类型停在 0.85.1，还不认识这个事件，所以用最小结构声明 + 一次窄化 cast。
 */
interface CacheWarmingDecisionEvent {
	type: "cache_warming_decision";
	warmCost: number;
	missCost: number;
	continuationProbability: number;
	action: "warm" | "stop";
}

type RegisterCacheWarmingDecision = (
	event: "cache_warming_decision",
	handler: (event: CacheWarmingDecisionEvent) => Promise<void> | void,
) => void;

export function resolveCacheWarmingStatusPath(env: NodeJS.ProcessEnv = process.env): string | null {
	const configured = env.CODEPIDDY_CACHE_WARMING_STATUS_PATH?.trim();
	return configured ? path.resolve(configured) : null;
}

export default function cacheWarmingStatusExtension(pi: ExtensionAPI): void {
	const statusPath = resolveCacheWarmingStatusPath();
	if (!statusPath) return;

	const onDecision = pi.on as unknown as RegisterCacheWarmingDecision;
	onDecision("cache_warming_decision", async (event) => {
		const expectedSavings = event.continuationProbability * event.missCost - event.warmCost;
		await mkdir(path.dirname(statusPath), { recursive: true });
		await writeFile(
			statusPath,
			`${JSON.stringify(
				{
					updatedAt: new Date().toISOString(),
					warmCost: event.warmCost,
					missCost: event.missCost,
					continuationProbability: event.continuationProbability,
					expectedSavings,
					action: event.action,
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
	});
}
