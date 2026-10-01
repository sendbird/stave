import type { StaveTurnGrants } from "./stave-turn-grants";

const threadIdByTask = new Map<string, string>();
const threadExecutableByTask = new Map<string, string>();
// A resumed Codex thread retains its Stave Local MCP connection and catalog.
const grantProfileByThreadKey = new Map<string, string>();
const NO_GRANT_PROFILE = "none";

/**
 * The grant keys a resumed thread must keep. The caller key is left out on
 * purpose: it is derived per task (`caller-grants.ts`), so the header a
 * resumed thread kept still names the same task and needs no fresh thread.
 */
function buildGrantProfile(grants?: StaveTurnGrants) {
  const missionKey = grants?.missionKey ?? "";
  const projectKey = grants?.projectKey ?? "";
  if (!missionKey && !projectKey) return NO_GRANT_PROFILE;
  return JSON.stringify([missionKey, projectKey]);
}

export function shouldStartFreshCodexGrantThread(args: {
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
    args.currentProfile !== NO_GRANT_PROFILE
  );
}

export function resolveCodexThreadSession(args: {
  threadKey: string;
  executablePath: string;
  fallbackThreadId?: string;
  ephemeral?: boolean;
  turnGrants?: StaveTurnGrants;
}) {
  if (args.ephemeral) return undefined;
  const resumeThreadId =
    threadExecutableByTask.get(args.threadKey) === args.executablePath
      ? (threadIdByTask.get(args.threadKey) ?? args.fallbackThreadId?.trim())
      : args.fallbackThreadId?.trim();
  const currentProfile = buildGrantProfile(args.turnGrants);
  return shouldStartFreshCodexGrantThread({
    resumeThreadId,
    previousProfile: grantProfileByThreadKey.get(args.threadKey),
    currentProfile,
  })
    ? undefined
    : resumeThreadId;
}

export function rememberCodexThreadSession(args: {
  threadKey: string;
  threadId?: string;
  executablePath: string;
  turnGrants?: StaveTurnGrants;
}) {
  const threadId = args.threadId?.trim();
  if (!threadId) return;
  threadIdByTask.set(args.threadKey, threadId);
  threadExecutableByTask.set(args.threadKey, args.executablePath);
  grantProfileByThreadKey.set(
    args.threadKey,
    buildGrantProfile(args.turnGrants),
  );
}

function forgetMatchingCodexThreadSessions(predicate: (key: string) => boolean) {
  const forgotten: string[] = [];
  for (const threadKey of threadExecutableByTask.keys()) {
    if (!predicate(threadKey)) continue;
    threadIdByTask.delete(threadKey);
    threadExecutableByTask.delete(threadKey);
    grantProfileByThreadKey.delete(threadKey);
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
