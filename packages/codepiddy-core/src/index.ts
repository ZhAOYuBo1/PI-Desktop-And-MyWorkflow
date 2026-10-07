export { AgentRegistry, type StoredAgentInstance } from "./agent-registry.ts";
export { searchProjectFiles } from "./file-search.ts";
export { PiRpcProcess, type PiRpcProcessOptions } from "./pi-rpc-process.ts";
export {
	archiveWorkItem,
	createWorkItem,
	deleteWorkItem,
	openProject,
	renameWorkItem,
	restoreWorkItem,
} from "./project-service.ts";
export {
	type ProjectWriteLease,
	ProjectWriteLeaseConflictError,
	ProjectWriteLeaseManager,
} from "./project-write-lease.ts";
export {
	DEFAULT_KICKOFF_PROMPTS,
	DEFAULT_ROLE_PROFILES,
	ensureDefaultRoleProfiles,
	readRoleProfile,
} from "./role-profiles.ts";
export {
	copyWorkspaceEntry,
	createWorkspaceEntry,
	deleteWorkspaceEntry,
	listWorkspaceDir,
	readWorkspaceFile,
	renameWorkspaceEntry,
	resolveWorkspaceEntryPath,
	statWorkspaceFile,
	writeWorkspaceFile,
} from "./workspace-fs.ts";
