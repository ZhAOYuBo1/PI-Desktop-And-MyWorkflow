export type SettingsToastTone = "success" | "error";

export function SettingsToast({
	message,
	tone,
	onClose,
}: {
	message: string;
	tone: SettingsToastTone;
	onClose(): void;
}) {
	const content = (
		<>
			<span>{message}</span>
			<button type="button" onClick={onClose}>
				关闭
			</button>
		</>
	);
	return tone === "success" ? (
		<output className="settings-toast is-success">{content}</output>
	) : (
		<div className="settings-toast is-error" role="alert">
			{content}
		</div>
	);
}
