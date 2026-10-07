import type { PiPackageListResult, PiPackageScope, PiPackageSummary, PiPackageUpdateSummary } from "@codepiddy/shared";
import { FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppIcon } from "./app-icon.tsx";
import { ModalShell } from "./modal-shell.tsx";
import { SelectMenu } from "./select-menu.tsx";
import { SettingsCheckbox } from "./settings-checkbox.tsx";
import { showSettingsToast } from "./settings-toast-store.ts";
import { StateBlock } from "./state-block.tsx";

interface PiPackageSettingsProps {
	projectRoot: string | null;
	onConfigChanged(action: "install" | "remove" | "update" | "extension"): Promise<string>;
}

function demoResult(): PiPackageListResult {
	return {
		projectTrusted: true,
		updates: [
			{
				source: "git:github.com/example/pi-tools",
				displayName: "example/pi-tools",
				sourceType: "git",
				scope: "project",
			},
		],
		packages: [
			{
				source: "npm:@gotgenes/pi-permission-system",
				scope: "user",
				sourceType: "npm",
				displayName: "@gotgenes/pi-permission-system",
				version: "1.4.2",
				installedPath: "C:\\Users\\demo\\.pi\\agent\\npm\\node_modules\\@gotgenes\\pi-permission-system",
				installed: true,
				filtered: false,
				resources: {
					extensions: { total: 1, enabled: 1 },
					skills: { total: 0, enabled: 0 },
					prompts: { total: 0, enabled: 0 },
					themes: { total: 0, enabled: 0 },
				},
				extensionEnabled: false,
			},
			{
				source: "git:github.com/example/pi-tools",
				scope: "project",
				sourceType: "git",
				displayName: "example/pi-tools",
				version: "0.8.0",
				installedPath: "E:\\project\\.pi\\git\\github.com\\example\\pi-tools",
				installed: true,
				filtered: true,
				resources: {
					extensions: { total: 0, enabled: 0 },
					skills: { total: 2, enabled: 2 },
					prompts: { total: 1, enabled: 1 },
					themes: { total: 0, enabled: 0 },
				},
				extensionEnabled: true,
			},
		],
	};
}

function scopeLabel(scope: PiPackageScope): string {
	return scope === "project" ? "项目" : "用户";
}

function sourceTypeLabel(sourceType: PiPackageSummary["sourceType"]): string {
	if (sourceType === "npm") return "npm";
	if (sourceType === "git") return "Git";
	return "本地路径";
}

function resourceLabel(name: string, count: PiPackageSummary["resources"]["extensions"]): string | null {
	if (count.total === 0) return null;
	return `${name} ${count.enabled}/${count.total}`;
}

function packageKey(item: Pick<PiPackageSummary, "scope" | "source">): string {
	return `${item.scope}:${item.source}`;
}

function updateKey(item: Pick<PiPackageUpdateSummary, "scope" | "source">): string {
	return `${item.scope}:${item.source}`;
}

export function PiPackageSettings({ projectRoot, onConfigChanged }: PiPackageSettingsProps) {
	const [packages, setPackages] = useState<PiPackageSummary[]>([]);
	const [updates, setUpdates] = useState<PiPackageUpdateSummary[]>([]);
	const [projectTrusted, setProjectTrusted] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [checkingUpdates, setCheckingUpdates] = useState(false);
	const [installOpen, setInstallOpen] = useState(false);
	const [installSource, setInstallSource] = useState("");
	const [installScope, setInstallScope] = useState<PiPackageScope>("user");
	const [removeTarget, setRemoveTarget] = useState<PiPackageSummary | null>(null);

	const canUseProject = Boolean(projectRoot) && projectTrusted;
	const updatesBySource = useMemo(() => new Map(updates.map((update) => [updateKey(update), update])), [updates]);
	const userPackages = packages.filter((item) => item.scope === "user");
	const projectPackages = packages.filter((item) => item.scope === "project");

	const applyResult = useCallback((result: PiPackageListResult): void => {
		setPackages(result.packages);
		setUpdates(result.updates);
		setProjectTrusted(result.projectTrusted);
	}, []);

	const loadPackages = useCallback(async (): Promise<void> => {
		setLoading(true);
		setError(null);
		try {
			if (!("codepiddy" in window)) {
				applyResult(demoResult());
				return;
			}
			applyResult(await window.codepiddy.listPiPackages(projectRoot ?? undefined));
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "读取 Pi Package 失败");
		} finally {
			setLoading(false);
		}
	}, [applyResult, projectRoot]);

	useEffect(() => {
		void loadPackages();
	}, [loadPackages]);

	useEffect(() => {
		if (!canUseProject && installScope === "project") setInstallScope("user");
	}, [canUseProject, installScope]);

	async function checkUpdates(): Promise<void> {
		setCheckingUpdates(true);
		try {
			if (!("codepiddy" in window)) {
				setUpdates(demoResult().updates);
				return;
			}
			setUpdates(await window.codepiddy.checkPiPackageUpdates(projectRoot ?? undefined));
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "检查 Pi Package 更新失败", "error");
		} finally {
			setCheckingUpdates(false);
		}
	}

	async function chooseLocalPath(): Promise<void> {
		if (!("codepiddy" in window)) {
			setInstallSource("E:\\pi-packages\\example");
			return;
		}
		try {
			const selected = await window.codepiddy.choosePiPackageLocalPath();
			if (selected) setInstallSource(selected);
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "选择 Pi Package 目录失败", "error");
		}
	}

	async function installPackage(): Promise<void> {
		const source = installSource.trim();
		if (!source) {
			showSettingsToast("请输入 npm、Git 或本地路径来源", "error");
			return;
		}
		if (installScope === "project" && !canUseProject) {
			showSettingsToast("请先信任当前项目，再安装项目级 Pi Package", "error");
			return;
		}
		setBusy("install");
		try {
			if (!("codepiddy" in window)) {
				applyResult(demoResult());
			} else {
				const result = await window.codepiddy.installPiPackage({
					action: "install",
					source,
					scope: installScope,
					...(installScope === "project" && projectRoot ? { projectRoot } : {}),
				});
				applyResult(result);
			}
			setInstallOpen(false);
			setInstallSource("");
			showSettingsToast(await onConfigChanged("install"), "success");
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "安装 Pi Package 失败", "error");
		} finally {
			setBusy(null);
		}
	}

	async function removePackage(item: PiPackageSummary): Promise<void> {
		setBusy(`remove:${packageKey(item)}`);
		try {
			if (!("codepiddy" in window)) {
				setPackages((current) => current.filter((candidate) => packageKey(candidate) !== packageKey(item)));
			} else {
				applyResult(
					await window.codepiddy.removePiPackage({
						action: "remove",
						source: item.source,
						scope: item.scope,
						...(item.scope === "project" && projectRoot ? { projectRoot } : {}),
					}),
				);
			}
			setRemoveTarget(null);
			showSettingsToast(await onConfigChanged("remove"), "success");
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "移除 Pi Package 失败", "error");
		} finally {
			setBusy(null);
		}
	}

	async function updatePackage(item: PiPackageSummary): Promise<void> {
		setBusy(`update:${packageKey(item)}`);
		try {
			if (!("codepiddy" in window)) {
				setUpdates((current) => current.filter((update) => updateKey(update) !== packageKey(item)));
			} else {
				applyResult(
					await window.codepiddy.updatePiPackage({
						action: "update",
						source: item.source,
						scope: item.scope,
						...(item.scope === "project" && projectRoot ? { projectRoot } : {}),
					}),
				);
			}
			showSettingsToast(await onConfigChanged("update"), "success");
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "更新 Pi Package 失败", "error");
		} finally {
			setBusy(null);
		}
	}

	async function setExtensionEnabled(item: PiPackageSummary, enabled: boolean): Promise<void> {
		setBusy(`extension:${packageKey(item)}`);
		try {
			if (!("codepiddy" in window)) {
				setPackages((current) =>
					current.map((candidate) =>
						packageKey(candidate) === packageKey(item) ? { ...candidate, extensionEnabled: enabled } : candidate,
					),
				);
			} else {
				applyResult(
					await window.codepiddy.setPiPackageExtensionEnabled({
						action: "set-extension",
						source: item.source,
						scope: item.scope,
						enabled,
						...(item.scope === "project" && projectRoot ? { projectRoot } : {}),
					}),
				);
			}
			showSettingsToast(await onConfigChanged("extension"), "success");
		} catch (caught) {
			showSettingsToast(caught instanceof Error ? caught.message : "修改 Pi Package extension 状态失败", "error");
		} finally {
			setBusy(null);
		}
	}

	function renderPackage(item: PiPackageSummary) {
		const update = updatesBySource.get(packageKey(item));
		const resourceLabels = [
			resourceLabel("扩展", item.resources.extensions),
			resourceLabel("Skills", item.resources.skills),
			resourceLabel("Prompts", item.resources.prompts),
			resourceLabel("Themes", item.resources.themes),
		].filter((value): value is string => value !== null);
		const updating = busy === `update:${packageKey(item)}`;
		const removing = busy === `remove:${packageKey(item)}`;
		return (
			<div className="pi-package-row" key={packageKey(item)}>
				<span className="pi-package-icon" aria-hidden="true">
					<AppIcon name="package" size={16} />
				</span>
				<div className="pi-package-copy">
					<div className="pi-package-title">
						<strong>{item.displayName}</strong>
						<span className={`pi-package-scope ${item.scope === "project" ? "is-project" : ""}`}>
							{scopeLabel(item.scope)}
						</span>
						<span className="pi-package-source-type">{sourceTypeLabel(item.sourceType)}</span>
						{item.filtered ? <span className="pi-package-source-type">已过滤资源</span> : null}
					</div>
					<code className="pi-package-source">{item.source}</code>
					<div className="pi-package-meta">
						<span>{item.version ? `v${item.version}` : "版本未知"}</span>
						<span>{item.installed ? "已安装" : "未安装"}</span>
						{resourceLabels.map((label) => (
							<span key={label}>{label}</span>
						))}
					</div>
					{item.installedPath ? <code className="pi-package-path">{item.installedPath}</code> : null}
					{item.resources.extensions.total > 0 ? (
						<SettingsCheckbox
							className="pi-package-extension-toggle"
							checked={item.extensionEnabled}
							disabled={busy !== null}
							onChange={(enabled) => void setExtensionEnabled(item, enabled)}
						>
							<span className="pi-package-extension-copy">
								<strong>加载扩展</strong>
								<small>开启后重新连接 Agent 时加载这个包的 extension</small>
							</span>
						</SettingsCheckbox>
					) : null}
				</div>
				<div className="pi-package-actions">
					{update ? (
						<button
							className="secondary-button"
							type="button"
							disabled={busy !== null}
							onClick={() => void updatePackage(item)}
						>
							<RefreshCw size={13} strokeWidth={2} />
							{updating ? "更新中…" : "更新"}
						</button>
					) : null}
					<button
						className="secondary-button danger-button"
						type="button"
						disabled={busy !== null}
						onClick={() => setRemoveTarget(item)}
					>
						<Trash2 size={13} strokeWidth={2} />
						{removing ? "移除中…" : "移除"}
					</button>
				</div>
			</div>
		);
	}

	return (
		<section className="settings-card pi-package-settings-card">
			<div className="settings-card-heading">
				<div>
					<h2>Pi Packages</h2>
					<p>
						管理 Pi 的扩展包来源、资源和版本。包可以包含 extensions、skills、prompts 和 themes； CodePIddy
						当前隔离第三方 extension，避免和客户端权限扩展重复。
					</p>
				</div>
				<div className="skill-settings-actions">
					<div className="settings-status">{packages.length} 个包</div>
					<button
						className="secondary-button"
						type="button"
						disabled={loading || checkingUpdates}
						onClick={() => void checkUpdates()}
					>
						<RefreshCw size={13} strokeWidth={2} />
						{checkingUpdates ? "检查中…" : "检查更新"}
					</button>
					<button className="primary-button" type="button" onClick={() => setInstallOpen(true)}>
						<AppIcon name="plus" size={13} />
						安装包
					</button>
				</div>
			</div>

			<div className="pi-package-toolbar">
				<span>
					{projectRoot
						? projectTrusted
							? "用户级和项目级包可管理"
							: "项目未受信任，只显示用户级包"
						: "打开项目后可管理项目级包"}
				</span>
				<button className="secondary-button" type="button" disabled={loading} onClick={() => void loadPackages()}>
					<AppIcon name="restore" size={13} />
					刷新
				</button>
			</div>

			{loading ? <StateBlock tone="loading" title="正在读取 Pi Packages" compact /> : null}
			{error ? <StateBlock tone="error" title={error} compact /> : null}
			{!loading && !error && packages.length === 0 ? (
				<StateBlock tone="neutral" icon="package" title="还没有安装 Pi Package" compact>
					安装后会显示来源、版本、资源和扩展开关。
				</StateBlock>
			) : null}
			{!loading && !error && packages.length > 0 ? (
				<div className="pi-package-groups">
					{projectPackages.length > 0 ? (
						<section className="pi-package-group">
							<div className="pi-package-group-heading">
								<span>项目包</span>
								<small>{projectPackages.length}</small>
							</div>
							<div className="pi-package-list">{projectPackages.map(renderPackage)}</div>
						</section>
					) : null}
					<section className="pi-package-group">
						<div className="pi-package-group-heading">
							<span>用户包</span>
							<small>{userPackages.length}</small>
						</div>
						{userPackages.length > 0 ? (
							<div className="pi-package-list">{userPackages.map(renderPackage)}</div>
						) : (
							<div className="pi-package-group-empty">还没有用户级包</div>
						)}
					</section>
				</div>
			) : null}

			<small>
				更新只作用于当前包，不会调用裸 <code>pi update</code>，也不会更新 Pi 运行时。 配置变更后空闲 Agent
				会自动重连；运行中的 Agent 停止或重连后生效。
			</small>

			{installOpen ? (
				<ModalShell
					title="安装 Pi Package"
					description="安装前请确认来源可信。第三方包可能包含可执行代码或指导模型执行命令。"
					className="pi-package-install-modal"
					width="lg"
					onClose={() => setInstallOpen(false)}
					closeDisabled={busy === "install"}
					footer={
						<>
							<button
								className="secondary-button"
								type="button"
								disabled={busy === "install"}
								onClick={() => setInstallOpen(false)}
							>
								取消
							</button>
							<button
								className="primary-button"
								type="button"
								disabled={busy === "install"}
								onClick={() => void installPackage()}
							>
								{busy === "install" ? "安装中…" : "确认安装"}
							</button>
						</>
					}
				>
					<div className="settings-field">
						<span>来源</span>
						<div className="pi-package-source-field">
							<input
								value={installSource}
								onChange={(event) => setInstallSource(event.target.value)}
								placeholder="npm:@scope/package、git:github.com/user/repo 或本地路径"
							/>
							<button
								className="secondary-button"
								type="button"
								disabled={busy === "install"}
								onClick={() => void chooseLocalPath()}
							>
								<FolderOpen size={13} strokeWidth={2} />
								选择目录
							</button>
						</div>
					</div>
					<div className="settings-field">
						<span>作用域</span>
						<SelectMenu
							label="Pi Package 作用域"
							value={installScope}
							options={[
								{
									value: "user",
									label: "用户级",
									description: "写入 ~/.pi/agent/settings.json，所有项目可用",
								},
								{
									value: "project",
									label: "项目级",
									description: projectRoot
										? projectTrusted
											? "写入当前项目的 .pi/settings.json"
											: "需要先信任当前项目"
										: "需要先打开项目",
									disabled: !canUseProject,
								},
							]}
							onChange={(value) => setInstallScope(value === "project" ? "project" : "user")}
						/>
					</div>
					<StateBlock tone="warning" title="第三方包风险" compact>
						extension 当前不会进入 CodePIddy Agent；skills、prompts 和 themes 仍可能被 Pi
						资源解析。安装前请确认来源可信。
					</StateBlock>
				</ModalShell>
			) : null}

			{removeTarget ? (
				<ModalShell
					title="移除 Pi Package"
					description={`移除 ${removeTarget.displayName}？npm / Git 包会删除安装目录，本地路径只移除配置。`}
					onClose={() => setRemoveTarget(null)}
					closeDisabled={busy === `remove:${packageKey(removeTarget)}`}
					width="sm"
					footer={
						<>
							<button
								className="secondary-button"
								type="button"
								disabled={busy === `remove:${packageKey(removeTarget)}`}
								onClick={() => setRemoveTarget(null)}
							>
								取消
							</button>
							<button
								className="primary-button danger-button"
								type="button"
								disabled={busy === `remove:${packageKey(removeTarget)}`}
								onClick={() => void removePackage(removeTarget)}
							>
								{busy === `remove:${packageKey(removeTarget)}` ? "移除中…" : "确认移除"}
							</button>
						</>
					}
				>
					<p>
						来源：<code>{removeTarget.source}</code>
					</p>
				</ModalShell>
			) : null}
		</section>
	);
}
