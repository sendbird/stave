import { requireCompactResumeSession } from "../../src/lib/providers/native-compaction";
import { resolveDefaultCodexFallbackModel } from "../../src/lib/providers/model-catalog";
import { resolveProviderResumeSessionId } from "../../src/lib/providers/provider-request-translators";
import {
  buildCodexThreadResumeParams,
  buildCodexThreadStartParams,
  type CodexConfigOverrides,
} from "./codex-app-server-params";
import {
  isCodexModelUnavailableError,
  toErrorMessage,
} from "./codex-app-server-errors";
import { canResumeCodexThreadAfterInterrupt } from "./codex-orphan-turn-cleanup";
import {
  buildCodexDeveloperInstructions,
  buildCodexInstructionProfileKey,
  buildCodexThreadKey,
  resolveCodexInstructionRefresh,
} from "./codex-runtime-config";
import {
  forgetCodexThreadSessionsForExecutable,
  forgetCodexThreadSessionsForTask,
  rememberCodexThreadSession,
  resolveCodexThreadSession,
} from "./codex-thread-session";
import type { StreamTurnArgs } from "./types";

// Instruction profile each live thread last saw; a change becomes a one-time
// refresh block on the next turn instead of rotating the thread (in-memory).
const instructionProfileByThreadKey = new Map<string, string>();
const freshCodexThreadExecutables = new Set<string>();

type CodexEnsureThreadClient = {
  request<T>(method: string, params: unknown): Promise<T>;
  threadLifetime: {
    acquire(threadId: string): Promise<() => void>;
  };
};

function resolveCodexResumeThreadFallback(args: {
  conversation?: StreamTurnArgs["conversation"];
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  return resolveProviderResumeSessionId({
    conversation: args.conversation,
    fallbackResumeId: args.runtimeOptions?.codexResumeThreadId,
  });
}

export function forgetCodexInstructionProfilesForExecutable(
  executablePath: string,
) {
  for (const threadKey of forgetCodexThreadSessionsForExecutable(
    executablePath,
  )) {
    instructionProfileByThreadKey.delete(threadKey);
  }
  freshCodexThreadExecutables.add(executablePath);
}

export function forgetCodexInstructionProfilesForTask(taskId: string) {
  for (const threadKey of forgetCodexThreadSessionsForTask(taskId)) {
    instructionProfileByThreadKey.delete(threadKey);
  }
}

export async function ensureCodexThread(args: {
  client: CodexEnsureThreadClient;
  executablePath: string;
  taskId?: string;
  cwd: string;
  input?: string;
  conversation?: StreamTurnArgs["conversation"];
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  ephemeral?: boolean;
  configOverrides?: CodexConfigOverrides;
  boundSecretFingerprint?: string;
  /**
   * A secondary read-only run must not delegate to a Worker-mode subagent: it is
   * a bounded analysis pass, and a worker would escape both its turn budget and
   * its read-only contract. Mirrors the Claude adapter's gate.
   */
  secondaryReadOnly?: boolean;
  /** Gates the Lens instruction block; see `buildCodexDeveloperInstructions`. */
  hasStaveLocalMcp?: boolean;
  turnGrants?: StreamTurnArgs["staveTurnGrants"];
  /** Set on the one retry that substitutes GPT-6 Sol for an unavailable GPT-6.1 Sol. */
  modelFallbackAttempted?: boolean;
}) {
  const threadKey = buildCodexThreadKey({
    taskId: args.taskId,
    cwd: args.cwd,
    runtimeOptions: args.runtimeOptions,
    boundSecretFingerprint: args.boundSecretFingerprint,
  });
  const instructionArgs = {
    runtimeOptions: args.runtimeOptions,
    ...(args.secondaryReadOnly ? { secondaryReadOnly: true } : {}),
    ...(args.hasStaveLocalMcp ? { hasStaveLocalMcp: true } : {}),
  };
  const instructionProfile = buildCodexInstructionProfileKey(instructionArgs);
  let resumeThreadId = resolveCodexThreadSession({
    threadKey,
    executablePath: args.executablePath,
    ephemeral: args.ephemeral,
    turnGrants: args.turnGrants,
    fallbackThreadId: freshCodexThreadExecutables.has(args.executablePath)
      ? undefined
      : resolveCodexResumeThreadFallback({
          conversation: args.conversation,
          runtimeOptions: args.runtimeOptions,
        }),
  });
  if (resumeThreadId && !(await canResumeCodexThreadAfterInterrupt(resumeThreadId))) {
    if (args.runtimeOptions?.codexResumeThreadId?.trim()) {
      throw new Error("Previous Codex turn is still stopping. Start a new session to continue safely.");
    }
    resumeThreadId = undefined;
  }

  requireCompactResumeSession(
    args.conversation?.input.content ?? args.input ?? "",
    resumeThreadId,
  );

  let releaseThread = resumeThreadId
    ? await args.client.threadLifetime.acquire(resumeThreadId)
    : undefined;
  try {
    const response = resumeThreadId
      ? await args.client.request<{ thread: { id: string }; model?: string }>("thread/resume", {
          ...buildCodexThreadResumeParams({
            threadId: resumeThreadId,
            cwd: args.cwd,
            runtimeOptions: args.runtimeOptions,
            // Forward caller config overrides on resume too. Previously dropped
            // here, which silently discarded MCP-isolation and injected-secret
            // shell env whenever a thread resumed instead of starting fresh.
            configOverrides: args.configOverrides,
            ...(args.secondaryReadOnly ? { secondaryReadOnly: true } : {}),
            ...(args.hasStaveLocalMcp ? { hasStaveLocalMcp: true } : {}),
          }),
        })
      : await args.client.request<{ thread: { id: string }; model?: string }>(
          "thread/start",
          buildCodexThreadStartParams({
            cwd: args.cwd,
            runtimeOptions: args.runtimeOptions,
            ...(args.ephemeral
              ? {
                  ephemeral: true,
                  sandbox: "read-only" as const,
                  approvalPolicy: "never" as const,
                }
              : {}),
            configOverrides: args.configOverrides,
            ...(args.secondaryReadOnly ? { secondaryReadOnly: true } : {}),
            ...(args.hasStaveLocalMcp ? { hasStaveLocalMcp: true } : {}),
          }),
        );
    const threadId = response.thread.id;
    releaseThread ??= await args.client.threadLifetime.acquire(threadId);
    let instructionRefresh: string | null = null;
    if (!args.ephemeral) {
      rememberCodexThreadSession({
        threadKey,
        threadId,
        executablePath: args.executablePath,
        turnGrants: args.turnGrants,
      });
      instructionRefresh = resolveCodexInstructionRefresh({
        resumed: Boolean(resumeThreadId),
        previousProfile: instructionProfileByThreadKey.get(threadKey),
        currentProfile: instructionProfile,
        developerInstructions: buildCodexDeveloperInstructions(instructionArgs),
      });
      instructionProfileByThreadKey.set(threadKey, instructionProfile);
    }
    return {
      threadId,
      threadKey,
      resolvedModel: response.model,
      resumedThreadId: resumeThreadId ?? null,
      releaseThread,
      instructionRefresh,
      fallbackModel: args.modelFallbackAttempted
        ? args.runtimeOptions?.model
        : undefined,
    };
  } catch (error) {
    releaseThread?.();
    const fallbackModel = args.modelFallbackAttempted
      ? undefined
      : resolveDefaultCodexFallbackModel({
          model: args.runtimeOptions?.model ?? "",
        });
    if (
      fallbackModel &&
      isCodexModelUnavailableError(toErrorMessage(error))
    ) {
      const started = await ensureCodexThread({
        ...args,
        runtimeOptions: { ...args.runtimeOptions, model: fallbackModel },
        modelFallbackAttempted: true,
      });
      return { ...started, fallbackModel };
    }
    throw error;
  }
}
