import type { ReactNode } from "react";
import { AppIcon, type AppIconName } from "./app-icon.tsx";

export type StateBlockTone = "neutral" | "success" | "warning" | "error" | "loading";

const DEFAULT_ICONS: Record<StateBlockTone, AppIconName> = {
	neutral: "folder",
	success: "check-circle",
	warning: "warning",
	error: "x-circle",
	loading: "clock",
};

export function StateBlock({
	tone = "neutral",
	icon,
	title,
	children,
	actions,
	className = "",
	compact = false,
}: {
	tone?: StateBlockTone;
	icon?: AppIconName;
	title?: ReactNode;
	children?: ReactNode;
	actions?: ReactNode;
	className?: string;
	compact?: boolean;
}) {
	return (
		<div
			className={`state-block is-${tone}${compact ? " is-compact" : ""} ${className}`.trim()}
			role={tone === "error" ? "alert" : undefined}
			aria-live={tone === "loading" ? "polite" : undefined}
		>
			<span className={`state-block-mark state-mark state-mark-${tone}`} aria-hidden="true">
				<AppIcon name={icon ?? DEFAULT_ICONS[tone]} size={compact ? 14 : 17} />
			</span>
			<div className="state-block-copy">
				{title ? <strong>{title}</strong> : null}
				{children ? <div className="state-block-detail">{children}</div> : null}
			</div>
			{actions ? <div className="state-block-actions">{actions}</div> : null}
		</div>
	);
}
