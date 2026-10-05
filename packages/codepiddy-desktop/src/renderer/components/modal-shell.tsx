import type { ReactNode } from "react";
import { AppIcon } from "./app-icon.tsx";

export function ModalCloseButton({
	onClose,
	disabled = false,
	label = "关闭",
}: {
	onClose(): void;
	disabled?: boolean;
	label?: string;
}) {
	return (
		<button
			className="modal-close-button work-panel-icon-button"
			type="button"
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={onClose}
		>
			<AppIcon name="close" size={14} />
		</button>
	);
}

export function ModalShell({
	title,
	description,
	children,
	footer,
	onClose,
	className = "",
	width = "md",
	ariaLabel,
	closeDisabled = false,
	backdropDismiss = true,
	showCloseButton = true,
}: {
	title?: ReactNode;
	description?: ReactNode;
	children?: ReactNode;
	footer?: ReactNode;
	onClose(): void;
	className?: string;
	width?: "sm" | "md" | "lg" | "xl";
	ariaLabel?: string;
	closeDisabled?: boolean;
	backdropDismiss?: boolean;
	showCloseButton?: boolean;
}) {
	return (
		<div className="modal-backdrop" role="presentation">
			{backdropDismiss ? (
				<button
					className="modal-backdrop-dismiss"
					type="button"
					aria-label="关闭浮层"
					disabled={closeDisabled}
					onClick={() => {
						if (!closeDisabled) onClose();
					}}
				/>
			) : null}
			<section
				className={`modal modal-shell modal-shell-${width} ${className}`.trim()}
				role="dialog"
				aria-modal="true"
				aria-label={ariaLabel ?? (typeof title === "string" ? title : "对话框")}
			>
				{title || description || showCloseButton ? (
					<header className="modal-shell-heading">
						<div>
							{title ? <h2>{title}</h2> : null}
							{description ? <p>{description}</p> : null}
						</div>
						{showCloseButton ? (
							<ModalCloseButton label="关闭" disabled={closeDisabled} onClose={onClose} />
						) : null}
					</header>
				) : null}
				<div className="modal-shell-body">{children}</div>
				{footer ? <footer className="modal-shell-footer modal-actions">{footer}</footer> : null}
			</section>
		</div>
	);
}
