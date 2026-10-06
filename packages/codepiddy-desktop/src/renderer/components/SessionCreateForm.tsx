import type { AgentModelOption } from "@codepiddy/shared";
import { useEffect, useRef } from "react";
import { SelectMenu } from "./select-menu.tsx";

export interface SessionCreateDraft {
	name: string;
	modelIndex: number;
}

export function SessionCreateForm({
	draft,
	models,
	busy,
	error,
	onChange,
	onCancel,
	onSubmit,
}: {
	draft: SessionCreateDraft;
	models: AgentModelOption[];
	busy: boolean;
	error: string | null;
	onChange(draft: SessionCreateDraft): void;
	onCancel(): void;
	onSubmit(): void;
}) {
	const nameInputRef = useRef<HTMLInputElement | null>(null);
	useEffect(() => {
		nameInputRef.current?.focus();
	}, []);

	return (
		<form
			className="session-create-form"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			<div className="session-create-fields">
				<label className="session-create-field">
					<span>会话名称</span>
					<input
						className="session-create-name-input"
						disabled={busy}
						maxLength={200}
						placeholder="未命名会话"
						ref={nameInputRef}
						value={draft.name}
						onChange={(event) => onChange({ ...draft, name: event.target.value })}
					/>
				</label>
				<div className="session-create-field">
					<span>模型</span>
					<SelectMenu
						label="模型"
						searchable
						disabled={busy || models.length === 0}
						value={String(draft.modelIndex)}
						options={models.map((model, index) => ({
							value: String(index),
							label: model.name,
							description: model.provider,
						}))}
						onChange={(value) => onChange({ ...draft, modelIndex: Number(value) })}
					/>
				</div>
			</div>
			<div className="session-create-actions">
				{error ? (
					<span className="session-create-error" role="alert">
						{error}
					</span>
				) : null}
				<button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>
					取消
				</button>
				<button className="primary-button" type="submit" disabled={busy || models.length === 0}>
					{busy ? "创建中…" : "创建会话"}
				</button>
			</div>
		</form>
	);
}
