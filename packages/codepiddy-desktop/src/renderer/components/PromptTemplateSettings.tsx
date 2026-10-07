import type { PromptTemplateScope, PromptTemplateSummary } from "@codepiddy/shared";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { AppIcon } from "./app-icon.tsx";
import { ModalShell } from "./modal-shell.tsx";
import { showSettingsToast } from "./settings-toast-store.ts";
import { StateBlock } from "./state-block.tsx";

interface PromptTemplateDraft {
	scope: PromptTemplateScope;
	originalName?: string;
	name: string;
	description: string;
	argumentHint: string;
	content: string;
}

function templateKey(template: Pick<PromptTemplateSummary, "scope" | "name">): string {
	return `${template.scope}:${template.name}`;
}

function demoPromptTemplates(): PromptTemplateSummary[] {
	return [
		{
			name: "review",
			description: "Review the current change for correctness and regressions.",
			argumentHint: "[focus]",
			content: "Review this change for correctness, regressions, and missing tests.\nFocus on: $ARGUMENTS",
			scope: "user",
			filePath: "demo://prompts/review.md",
		},
		{
			name: "fix-bug",
			description: "Trace and fix a reproducible bug.",
			argumentHint: "<description>",
			content: "Investigate and fix this bug:\n\n$ARGUMENTS\n\nAdd a regression test when practical.",
			scope: "project",
			filePath: "demo://project/.pi/prompts/fix-bug.md",
		},
	];
}

export function PromptTemplateSettings({
	projectRoot,
	onUseTemplate,
	onConfigChanged,
}: {
	projectRoot: string | null;
	onUseTemplate(template: PromptTemplateSummary): void;
	onConfigChanged(action: "save" | "delete"): Promise<string>;
}) {
	const [templates, setTemplates] = useState<PromptTemplateSummary[]>([]);
	const [draft, setDraft] = useState<PromptTemplateDraft | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<PromptTemplateSummary | null>(null);

	const loadTemplates = useCallback(async (): Promise<void> => {
		setLoading(true);
		setError(null);
		try {
			if (!("codepiddy" in window)) {
				setTemplates(demoPromptTemplates());
				return;
			}
			setTemplates(await window.codepiddy.listPromptTemplates(projectRoot ?? undefined));
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "读取 Prompt 模板失败");
		} finally {
			setLoading(false);
		}
	}, [projectRoot]);

	useEffect(() => {
		void loadTemplates();
	}, [loadTemplates]);

	const grouped = useMemo(
		() => ({
			project: templates.filter((template) => template.scope === "project"),
			user: templates.filter((template) => template.scope === "user"),
		}),
		[templates],
	);

	function newTemplate(scope: PromptTemplateScope): void {
		if (scope === "project" && !projectRoot) {
			showSettingsToast("请先打开一个项目，再创建项目模板", "error");
			return;
		}
		setDraft({
			scope,
			name: "",
			description: "",
			argumentHint: "",
			content: "",
		});
	}

	async function persistDraft(): Promise<PromptTemplateSummary | null> {
		if (!draft) return null;
		if (!draft.name.trim()) {
			showSettingsToast("模板名称不能为空", "error");
			return null;
		}
		if (!draft.content.trim()) {
			showSettingsToast("模板内容不能为空", "error");
			return null;
		}
		setBusy(true);
		try {
			if (!("codepiddy" in window)) {
				const saved: PromptTemplateSummary = {
					name: draft.name.trim(),
					description: draft.description.trim(),
					argumentHint: draft.argumentHint.trim() || null,
					content: draft.content.trim(),
					scope: draft.scope,
					filePath:
						draft.scope === "project"
							? `demo://project/.pi/prompts/${draft.name.trim()}.md`
							: `demo://prompts/${draft.name.trim()}.md`,
				};
				const originalKey = draft.originalName ? `${draft.scope}:${draft.originalName}` : null;
				setTemplates((current) => [
					...current.filter(
						(template) =>
							templateKey(template) !== templateKey(saved) &&
							(originalKey === null || templateKey(template) !== originalKey),
					),
					saved,
				]);
				setDraft({
					scope: saved.scope,
					originalName: saved.name,
					name: saved.name,
					description: saved.description,
					argumentHint: saved.argumentHint ?? "",
					content: saved.content,
				});
				return saved;
			}
			const next = await window.codepiddy.savePromptTemplate({
				scope: draft.scope,
				...(draft.scope === "project" && projectRoot ? { projectRoot } : {}),
				...(draft.originalName ? { originalName: draft.originalName } : {}),
				name: draft.name,
				description: draft.description,
				argumentHint: draft.argumentHint,
				content: draft.content,
			});
			setTemplates(next);
			const saved =
				next.find((template) => template.scope === draft.scope && template.name === draft.name.trim()) ?? null;
			if (saved) {
				setDraft({
					scope: saved.scope,
					originalName: saved.name,
					name: saved.name,
					description: saved.description,
					argumentHint: saved.argumentHint ?? "",
					content: saved.content,
				});
			}
			return saved;
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "保存 Prompt 模板失败", "error");
			return null;
		} finally {
			setBusy(false);
		}
	}

	async function saveTemplate(): Promise<void> {
		const saved = await persistDraft();
		if (!saved) return;
		showSettingsToast(await onConfigChanged("save"), "success");
	}

	async function saveAndUse(): Promise<void> {
		const saved = await persistDraft();
		if (!saved) return;
		showSettingsToast(await onConfigChanged("save"), "success");
		onUseTemplate(saved);
	}

	async function deleteTemplate(template: PromptTemplateSummary): Promise<void> {
		setBusy(true);
		try {
			if (!("codepiddy" in window)) {
				setTemplates((current) => current.filter((item) => templateKey(item) !== templateKey(template)));
			} else {
				setTemplates(
					await window.codepiddy.deletePromptTemplate({
						scope: template.scope,
						...(template.scope === "project" && projectRoot ? { projectRoot } : {}),
						name: template.name,
					}),
				);
			}
			setDraft(null);
			setDeleteTarget(null);
			showSettingsToast(await onConfigChanged("delete"), "success");
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "删除 Prompt 模板失败", "error");
		} finally {
			setBusy(false);
		}
	}

	async function openFolder(scope: PromptTemplateScope): Promise<void> {
		if (!("codepiddy" in window)) {
			showSettingsToast("演示模式不能打开模板目录", "error");
			return;
		}
		try {
			await window.codepiddy.openPromptTemplateFolder({
				scope,
				...(scope === "project" && projectRoot ? { projectRoot } : {}),
			});
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "打开模板目录失败", "error");
		}
	}

	function renderGroup(scope: PromptTemplateScope, items: PromptTemplateSummary[]): ReactNode {
		return (
			<section className="prompt-template-group" key={scope}>
				<div className="prompt-template-group-heading">
					<span>{scope === "project" ? "项目模板" : "用户模板"}</span>
					<small>{items.length}</small>
				</div>
				{items.length === 0 ? (
					<div className="prompt-template-group-empty">还没有{scope === "project" ? "项目" : "用户"}模板</div>
				) : (
					<div className="prompt-template-list">
						{items.map((template) => {
							const selected = draft?.scope === template.scope && draft.name.trim() === template.name;
							return (
								<div
									className={`prompt-template-row${selected ? " is-selected" : ""}`}
									key={templateKey(template)}
								>
									<button
										type="button"
										className="prompt-template-row-main"
										onClick={() =>
											setDraft({
												scope: template.scope,
												originalName: template.name,
												name: template.name,
												description: template.description,
												argumentHint: template.argumentHint ?? "",
												content: template.content,
											})
										}
									>
										<span className="prompt-template-name">/{template.name}</span>
										<span className="prompt-template-description">{template.description || "无说明"}</span>
										{template.argumentHint ? <code>{template.argumentHint}</code> : null}
									</button>
									<button
										type="button"
										className="prompt-template-use-button"
										onClick={() => onUseTemplate(template)}
										title="插入到当前输入框"
									>
										<AppIcon name="arrow-up" size={13} />
									</button>
								</div>
							);
						})}
					</div>
				)}
			</section>
		);
	}

	return (
		<section className="settings-card prompt-template-settings-card">
			<div className="settings-card-heading">
				<div>
					<h2>Prompt 模板</h2>
					<p>用 Markdown 保存可复用提示词；在输入框输入 / 后可直接调用。</p>
				</div>
				<div className="skill-settings-actions">
					<div className="settings-status">{templates.length} 个模板</div>
					<button className="secondary-button" type="button" onClick={() => newTemplate("user")}>
						<AppIcon name="plus" size={13} />
						新建用户模板
					</button>
					<button
						className="secondary-button"
						type="button"
						disabled={!projectRoot}
						onClick={() => newTemplate("project")}
					>
						<AppIcon name="plus" size={13} />
						新建项目模板
					</button>
				</div>
			</div>

			<div className="prompt-template-toolbar">
				<button className="secondary-button" type="button" onClick={() => void openFolder("user")}>
					<AppIcon name="folder" size={13} />
					打开用户目录
				</button>
				<button
					className="secondary-button"
					type="button"
					disabled={!projectRoot}
					onClick={() => void openFolder("project")}
				>
					<AppIcon name="folder" size={13} />
					打开项目目录
				</button>
				<button className="secondary-button" type="button" disabled={loading} onClick={() => void loadTemplates()}>
					<AppIcon name="restore" size={13} />
					刷新
				</button>
			</div>

			<div className="prompt-template-layout">
				<div className="prompt-template-browser">
					{loading ? <StateBlock tone="loading" title="正在读取 Prompt 模板" compact /> : null}
					{error ? <StateBlock tone="error" title={error} compact /> : null}
					{!loading && !error && templates.length === 0 ? (
						<StateBlock tone="neutral" icon="message-question" title="还没有 Prompt 模板" compact>
							新建后会在输入框的 / 命令菜单中出现。
						</StateBlock>
					) : null}
					{!loading && !error ? (
						<>
							{projectRoot ? renderGroup("project", grouped.project) : null}
							{renderGroup("user", grouped.user)}
						</>
					) : null}
				</div>

				<div className="prompt-template-editor">
					{draft ? (
						<>
							<div className="prompt-template-editor-heading">
								<div>
									<strong>{draft.originalName ? "编辑模板" : "新建模板"}</strong>
									<small>{draft.scope === "project" ? "项目 .pi/prompts" : "用户 ~/.pi/agent/prompts"}</small>
								</div>
								<span className="tool-settings-badge">{draft.scope === "project" ? "项目" : "用户"}</span>
							</div>
							<label className="settings-field">
								<span>名称</span>
								<input
									value={draft.name}
									disabled={busy}
									onChange={(event) => setDraft({ ...draft, name: event.target.value })}
									placeholder="例如 review"
								/>
							</label>
							<label className="settings-field">
								<span>说明</span>
								<input
									value={draft.description}
									disabled={busy}
									onChange={(event) => setDraft({ ...draft, description: event.target.value })}
									placeholder="在 / 菜单里显示的一句话说明"
								/>
							</label>
							<label className="settings-field">
								<span>参数提示</span>
								<input
									value={draft.argumentHint}
									disabled={busy}
									onChange={(event) => setDraft({ ...draft, argumentHint: event.target.value })}
									placeholder="例如 [focus] 或 <file>"
								/>
							</label>
							<label className="settings-field prompt-template-content-field">
								<span>模板内容</span>
								<textarea
									value={draft.content}
									disabled={busy}
									onChange={(event) => setDraft({ ...draft, content: event.target.value })}
									placeholder="支持 $1、$ARGUMENTS、$@ 和 ${1:-default}"
									rows={12}
								/>
							</label>
							<div className="prompt-template-editor-actions">
								<button
									className="primary-button"
									type="button"
									disabled={busy}
									onClick={() => void saveTemplate()}
								>
									保存
								</button>
								<button
									className="secondary-button"
									type="button"
									disabled={busy}
									onClick={() => void saveAndUse()}
								>
									保存并插入
								</button>
								<button
									className="secondary-button danger-button"
									type="button"
									disabled={busy || !draft.originalName}
									onClick={() => {
										const template = templates.find(
											(item) => item.scope === draft.scope && item.name === draft.originalName,
										);
										if (template) setDeleteTarget(template);
									}}
								>
									删除
								</button>
								<button
									className="secondary-button"
									type="button"
									disabled={busy}
									onClick={() => setDraft(null)}
								>
									取消
								</button>
							</div>
						</>
					) : (
						<StateBlock tone="neutral" icon="message-question" title="选择一个模板" compact>
							编辑内容、参数提示和模板正文，或新建一个模板。
						</StateBlock>
					)}
				</div>
			</div>

			{deleteTarget ? (
				<ModalShell
					title="删除 Prompt 模板"
					description={`删除 /${deleteTarget.name}？此操作会移除模板文件。`}
					onClose={() => setDeleteTarget(null)}
					closeDisabled={busy}
					width="sm"
					footer={
						<>
							<button
								className="secondary-button"
								type="button"
								disabled={busy}
								onClick={() => setDeleteTarget(null)}
							>
								取消
							</button>
							<button
								className="primary-button danger-button"
								type="button"
								disabled={busy}
								onClick={() => void deleteTemplate(deleteTarget)}
							>
								删除
							</button>
						</>
					}
				>
					<p>Pi 下次读取模板列表时会立即反映这次删除。</p>
				</ModalShell>
			) : null}
		</section>
	);
}
