import { useEffect, useState } from "react";
import { SettingsToast } from "./settings-toast.tsx";
import { dismissSettingsToast, type SettingsToastItem, subscribeSettingsToasts } from "./settings-toast-store.ts";

export function SettingsToastHost() {
	const [items, setItems] = useState<SettingsToastItem[]>([]);

	useEffect(() => subscribeSettingsToasts(setItems), []);

	if (items.length === 0) return null;
	return (
		<div className="settings-toast-stack">
			{items.map((item) => (
				<SettingsToast
					key={item.id}
					message={item.message}
					detail={item.detail}
					path={item.path}
					action={
						item.action
							? {
									label: item.action.label,
									onClick: () => {
										item.action?.onClick();
										dismissSettingsToast(item.id);
									},
								}
							: undefined
					}
					tone={item.tone}
					onClose={() => dismissSettingsToast(item.id)}
				/>
			))}
		</div>
	);
}
