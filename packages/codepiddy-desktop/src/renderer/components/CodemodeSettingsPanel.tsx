import type { CodemodeMode, CodemodeSettings, SettingsStatus } from "@codepiddy/shared";
import { useEffect, useState } from "react";
import { SelectMenu } from "./select-menu.tsx";
import { showSettingsToast } from "./settings-toast-store.ts";

const demoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo");

const DEFAULT_CODEMODE_SETTINGS: CodemodeSettings = {
	mode: "on",
	inlineBudget: null,
};

interface CodemodeDraft {
	mode: CodemodeMode;
	inlineBudget: string;
}

function toDraft(settings: CodemodeSettings): CodemodeDraft {
	return {
		mode: settings.mode,
		inlineBudget: settings.inlineBudget === null ? "" : String(settings.inlineBudget),
	};
}

function parseInlineBudget(value: string): number | null {
	const text = value.trim();
	if (!text) return null;
	if (!/^\d+$/.test(text)) throw new Error("工具目录预算必须是非负整数");
	const parsed = Number(text);
	if (!Number.isSafeInteger(parsed)) throw new Error("工具目录预算超出可保存范围");
	return parsed;
}

export function CodemodeSettingsPanel({
	settings,
	onStatusChange,
}: {
	settings: CodemodeSettings | null;
	onStatusChange?: (status: SettingsStatus) => void;
}) {
	const [draft, setDraft] = useState<CodemodeDraft>(() => toDraft(settings ?? DEFAULT_CODEMODE_SETTINGS));
	const [saving, setSaving] = useState(false);
	const [dirty, setDirty] = useState(false);

	useEffect(() => {
		setDraft(toDraft(settings ?? DEFAULT_CODEMODE_SETTINGS));
		setDirty(false);
	}, [settings]);

	function updateDraft(patch: Partial<CodemodeDraft>): void {
		setDraft((current) => ({ ...current, ...patch }));
		setDirty(true);
	}

	async function save(): Promise<void> {
		if (saving) return;
		let next: CodemodeSettings;
		try {
			next = {
				mode: draft.mode,
				inlineBudget: parseInlineBudget(draft.inlineBudget),
			};
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "Codemode 设置无效", "error");
			return;
		}

		if (demoMode || !("codepiddy" in window)) {
			setDraft(toDraft(next));
			setDirty(false);
			showSettingsToast("Codemode 设置已保存。", "success");
			return;
		}

		setSaving(true);
		try {
			const status = await window.codepiddy.saveCodemodeSettings(next);
			setDraft(toDraft(status.codemode));
			setDirty(false);
			onStatusChange?.(status);
			showSettingsToast("Codemode 设置已保存；新启动或重置后的 Agent 生效。", "success");
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "保存 Codemode 设置失败", "error");
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="settings-card codemode-settings-card">
			<div className="settings-card-heading">
				<div>
					<h2>Codemode</h2>
					<p>
						Codemode 让模型用 JavaScript 批量调用其他工具，适合合并多次读取、过滤大结果和串联调用。这里配置 Pi
						原生 <code>settings.json</code> 的 Codemode 行为。
					</p>
				</div>
				<div className="settings-status">{saving ? "保存中" : dirty ? "未保存" : "已保存"}</div>
			</div>

			<div className="codemode-setting-grid">
				<div className="settings-field">
					<span>执行模式</span>
					<SelectMenu
						label="Codemode 执行模式"
						value={draft.mode}
						options={[
							{
								value: "on",
								label: "标准",
								description: "保留常规工具，同时允许 Pi 按需使用 Codemode 批量调用工具",
							},
							{
								value: "only",
								label: "仅 Codemode",
								description: "隐藏可直接调用的工具，让模型通过 Codemode 脚本统一调用",
							},
						]}
						onChange={(value) => updateDraft({ mode: value as CodemodeMode })}
					/>
					<small>仅 Codemode 会把工具目录收进脚本环境，工具调用过程仍会显示在转录流里。</small>
				</div>

				<label className="settings-field">
					<span>工具目录预算</span>
					<input
						type="number"
						min={0}
						step={500}
						value={draft.inlineBudget}
						placeholder="3000（Pi 默认）"
						onChange={(event) => updateDraft({ inlineBudget: event.target.value })}
					/>
					<small>
						控制 Codemode 系统提示里内联多少工具说明。越大越容易发现冷门工具，但会占用更多上下文；留空使用 Pi
						默认值。
					</small>
				</label>
			</div>

			<div className="settings-actions">
				<button className="primary-button" type="button" disabled={saving} onClick={() => void save()}>
					{saving ? "保存中…" : "保存 Codemode 设置"}
				</button>
			</div>
			<small>设置写入 Pi 原生 settings.json；修改后，新启动或重置后的 Agent 才会使用新值。</small>
		</section>
	);
}
