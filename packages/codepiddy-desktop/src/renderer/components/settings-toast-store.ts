import type { SettingsToastTone } from "./settings-toast.tsx";

export interface SettingsToastItem {
	id: number;
	message: string;
	tone: SettingsToastTone;
}

let items: SettingsToastItem[] = [];
let nextId = 1;
const listeners = new Set<(value: SettingsToastItem[]) => void>();
const timers = new Map<number, number>();

function emit(): void {
	for (const listener of listeners) listener(items);
}

export function dismissSettingsToast(id: number): void {
	const timer = timers.get(id);
	if (timer !== undefined) {
		window.clearTimeout(timer);
		timers.delete(id);
	}
	items = items.filter((item) => item.id !== id);
	emit();
}

export function showSettingsToast(message: string, tone: SettingsToastTone): void {
	const id = nextId++;
	items = [...items, { id, message, tone }];
	emit();
	timers.set(
		id,
		window.setTimeout(() => dismissSettingsToast(id), tone === "error" ? 8000 : 3500),
	);
}

export function subscribeSettingsToasts(listener: (value: SettingsToastItem[]) => void): () => void {
	listeners.add(listener);
	listener(items);
	return () => {
		listeners.delete(listener);
	};
}
