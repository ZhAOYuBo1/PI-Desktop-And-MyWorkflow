import { Check } from "lucide-react";
import { type ReactNode, useId } from "react";

export function SettingsCheckbox({
	checked,
	disabled = false,
	onChange,
	children,
	className = "",
	labelClickable = true,
	trailing,
}: {
	checked: boolean;
	disabled?: boolean;
	onChange(checked: boolean): void;
	children: ReactNode;
	className?: string;
	labelClickable?: boolean;
	trailing?: ReactNode;
}) {
	const id = useId();
	const content = labelClickable ? (
		<label className="settings-checkbox-content is-clickable" htmlFor={id}>
			{children}
		</label>
	) : (
		<div className="settings-checkbox-content">{children}</div>
	);

	return (
		/* 真实 input 是 absolute 的 1px 隐藏元素；control 必须是它的包含块，
		   否则 input 会相对 .main-pane 定位并撑大其 scrollHeight，聚焦时整页跳动。 */
		<div className={`settings-checkbox-control ${className}`.trim()} style={{ position: "relative" }}>
			<input
				id={id}
				type="checkbox"
				checked={checked}
				disabled={disabled}
				onChange={(event) => onChange(event.target.checked)}
			/>
			<label className="settings-checkbox-hitarea" htmlFor={id}>
				<span className="settings-checkbox-mark" aria-hidden="true">
					<Check size={12} strokeWidth={3.2} />
				</span>
			</label>
			{content}
			{trailing ? <span className="settings-checkbox-trailing">{trailing}</span> : null}
		</div>
	);
}
