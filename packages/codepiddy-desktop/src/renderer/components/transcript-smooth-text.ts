export function nextSmoothText(source: string, current: string): string {
	if (!source.startsWith(current)) return source;
	if (current.length >= source.length) return current;
	const step = Math.max(1, Math.ceil((source.length - current.length) / 12));
	return source.slice(0, Math.min(source.length, current.length + step));
}
