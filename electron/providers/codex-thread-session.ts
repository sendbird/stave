import type { StaveCollaborationGrants } from "./stave-collaboration-grants";

const threadIdByTask = new Map<string, string>();
const threadExecutableByTask = new Map<string, string>();
// A resumed Codex thread retains its Stave Local MCP connection and catalog.
const collaborationProfileByThreadKey = new Map<string, string>();
const NO_COLLABORATION_PROFILE = "none";

function buildCollaborationProfile(grants?: StaveCollaborationGrants) {
  const consultKey = grants?.consultKey ?? "";
  const workerKey = grants?.workerKey ?? "";
  return consultKey || workerKey
    ? JSON.stringify([consultKey, workerKey])
    : NO_COLLABORATION_PROFILE;
}

export function shouldStartFreshCodexCollaborationThread(args: {
  resumeThreadId?: string;
  previousProfile?: string;
  currentProfile: string;
}) {
  if (!args.resumeThreadId || args.previousProfile === args.currentProfile) {
    return false;
  }
  // After an app restart, an ordinary persisted thread remains safe to resume.
  // A granted turn must reconnect so conditional tools and current headers are
  // installed instead of inheriting the old catalog.
  return (
    args.previousProfile !== undefined ||
    args.currentProfile !== NO_COLLABORATION_PROFILE
  );
}

export function resolveCodexThreadSession(args: {
  threadKey: string;
  executablePath: string;
  fallbackThreadId?: string;
  ephemeral?: boolean;
  collaborationGrants?: StaveCollaborationGrants;
}) {
  if (args.ephemeral) return undefined;
  const resumeThreadId =
    threadExecutableByTask.get(args.threadKey) === args.executablePath
      ? (threadIdByTask.get(args.threadKey) ?? args.fallbackThreadId?.trim())
      : args.fallbackThreadId?.trim();
  const currentProfile = buildCollaborationProfile(args.collaborationGrants);
  return shouldStartFreshCodexCollaborationThread({
    resumeThreadId,
    previousProfile: collaborationProfileByThreadKey.get(args.threadKey),
    currentProfile,
  })
    ? undefined
    : resumeThreadId;
}

export function rememberCodexThreadSession(args: {
  threadKey: string;
  threadId?: string;
  executablePath: string;
  collaborationGrants?: StaveCollaborationGrants;
}) {
  const threadId = args.threadId?.trim();
  if (!threadId) return;
  threadIdByTask.set(args.threadKey, threadId);
  threadExecutableByTask.set(args.threadKey, args.executablePath);
  collaborationProfileByThreadKey.set(
    args.threadKey,
    buildCollaborationProfile(args.collaborationGrants),
  );
}

function forgetMatchingCodexThreadSessions(predicate: (key: string) => boolean) {
  const forgotten: string[] = [];
  for (const threadKey of threadExecutableByTask.keys()) {
    if (!predicate(threadKey)) continue;
    threadIdByTask.delete(threadKey);
    threadExecutableByTask.delete(threadKey);
    collaborationProfileByThreadKey.delete(threadKey);
    forgotten.push(threadKey);
  }
  return forgotten;
}

export function forgetCodexThreadSessionsForExecutable(executablePath: string) {
  return forgetMatchingCodexThreadSessions(
    (threadKey) => threadExecutableByTask.get(threadKey) === executablePath,
  );
}

export function forgetCodexThreadSessionsForTask(taskId: string) {
  const keyPrefix = `${taskId}:`;
  return forgetMatchingCodexThreadSessions((threadKey) =>
    threadKey.startsWith(keyPrefix),
  );
}
