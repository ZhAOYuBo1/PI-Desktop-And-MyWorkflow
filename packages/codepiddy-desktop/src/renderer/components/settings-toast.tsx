import { AppIcon } from "./app-icon.tsx";

export type SettingsToastTone = "success" | "error";

export interface SettingsToastAction {
	label: string;
	onClick(): void;
}

export function SettingsToast({
	message,
	detail,
	path,
	tone,
	action,
	onClose,
}: {
	message: string;
	detail?: string;
	path?: string;
	tone: SettingsToastTone;
	action?: SettingsToastAction;
	onClose(): void;
}) {
	const content = (
		<>
			<div className="settings-toast-main">
				<span className="settings-toast-message">{message}</span>
				{detail ? <small className="settings-toast-detail">{detail}</small> : null}
				{path ? <code className="settings-toast-path">{path}</code> : null}
			</div>
			{action ? (
				<button className="settings-toast-action" type="button" onClick={action.onClick}>
					{action.label}
				</button>
			) : null}
			<button className="settings-toast-close" type="button" aria-label="关闭消息" title="关闭" onClick={onClose}>
				<AppIcon name="close" size={14} />
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
