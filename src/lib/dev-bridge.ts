import type {
  CanonicalConversationRequest,
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import type { ConnectedToolId } from "@/lib/providers/connected-tool-status";
import type {
  CliSessionCreateSessionArgs,
  TerminalCreateSessionArgs,
} from "@/lib/terminal/types";

const DEV_API_BASE = "http://127.0.0.1:3001";

function isElectronRuntime() {
  if (typeof navigator === "undefined") {
    return false;
  }
  return navigator.userAgent.toLowerCase().includes("electron");
}

async function postJson<TResponse>(args: {
  path: string;
  body: unknown;
}): Promise<TResponse> {
  try {
    const response = await fetch(`${DEV_API_BASE}${args.path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args.body),
    });
    return (await response.json()) as TResponse;
  } catch (error) {
    throw new Error(
      `dev bridge request failed for ${args.path}: ${String(error)}`,
    );
  }
}

export function installDevApiBridge() {
  if (!import.meta.env.DEV) {
    return;
  }
  if (typeof window === "undefined") {
    return;
  }
  if (isElectronRuntime()) {
    return;
  }
  if (window.api?.provider?.streamTurn && window.api?.terminal?.runCommand) {
    return;
  }

  const existingApi = window.api ?? {};
  window.api = {
    ...existingApi,
    provider: {
      ...existingApi.provider,
      streamTurn: async (args: {
        turnId?: string;
        providerId: ProviderId;
        prompt: string;
        conversation?: CanonicalConversationRequest;
        taskId?: string;
        workspaceId?: string;
        cwd?: string;
        runtimeOptions?: ProviderRuntimeOptions;
      }) => {
        const result = await postJson<{ events: unknown[] }>({
          path: "/api/provider/turn",
          body: args,
        });
        return result.events;
      },
      abortTurn: (args: { turnId: string }) =>
        postJson({
          path: "/api/provider/abort",
          body: args,
        }),
      respondApproval: (args: {
        turnId: string;
        requestId: string;
        approved: boolean;
      }) =>
        postJson({
          path: "/api/provider/approval",
          body: args,
        }),
      respondUserInput: (args: {
        turnId: string;
        requestId: string;
        answers?: Record<string, string>;
        denied?: boolean;
      }) =>
        postJson({
          path: "/api/provider/user-input",
          body: args,
        }),
      checkAvailability: (args: { providerId: ProviderId }) =>
        postJson({
          path: "/api/provider/check",
          body: args,
        }),
      getConnectedToolStatus: async (args: {
        providerId: ProviderId;
        cwd?: string;
        runtimeOptions?: ProviderRuntimeOptions;
        toolIds?: ConnectedToolId[];
      }) => ({
        ok: false,
        providerId: args.providerId,
        detail:
          "Connected-tool preflight is unavailable in the web dev bridge.",
        tools: (args.toolIds ?? []).map((toolId) => ({
          id: toolId,
          label: toolId,
          state: "unknown" as const,
          available: true,
          detail:
            "Connected-tool preflight is unavailable in the web dev bridge.",
        })),
      }),
    },
    terminal: {
      ...existingApi.terminal,
      runCommand: (args: { command: string; cwd?: string }) =>
        postJson({
          path: "/api/terminal/run",
          body: args,
        }),
      createSession: (args: TerminalCreateSessionArgs) =>
        postJson({
          path: "/api/terminal/create",
          body: args,
        }),
      createCliSession: (args: CliSessionCreateSessionArgs) =>
        postJson({
          path: "/api/terminal/create-cli",
          body: args,
        }),
      writeSession: (args: { sessionId: string; input: string }) =>
        postJson({
          path: "/api/terminal/write",
          body: args,
        }),
      readSession: (args: { sessionId: string }) =>
        postJson({
          path: "/api/terminal/read",
          body: args,
        }),
      closeSession: (args: { sessionId: string }) =>
        postJson({
          path: "/api/terminal/close",
          body: args,
        }),
      getSessionResumeInfo: async () => ({
        ok: false,
        stderr:
          "CLI native resume metadata is unavailable in the web dev bridge.",
      }),
    },
    sourceControl: {
      ...existingApi.sourceControl,
      getStatus: (args: { cwd?: string }) =>
        postJson({ path: "/api/scm/status", body: args }),
      stageAll: (args: { cwd?: string }) =>
        postJson({ path: "/api/scm/stage-all", body: args }),
      unstageAll: (args: { cwd?: string }) =>
        postJson({ path: "/api/scm/unstage-all", body: args }),
      commit: (args: { message: string; cwd?: string }) =>
        postJson({ path: "/api/scm/commit", body: args }),
      stageFile: (args: { path: string; cwd?: string }) =>
        postJson({ path: "/api/scm/stage-file", body: args }),
      unstageFile: (args: { path: string; cwd?: string }) =>
        postJson({ path: "/api/scm/unstage-file", body: args }),
      discardFile: (args: { path: string; cwd?: string }) =>
        postJson({ path: "/api/scm/discard-file", body: args }),
      getDiff: (args: { path: string; cwd?: string }) =>
        postJson({ path: "/api/scm/diff", body: args }),
      getHistory: (args: { cwd?: string; limit?: number }) =>
        postJson({ path: "/api/scm/history", body: args }),
      listBranches: (args: { cwd?: string; refreshRemote?: boolean }) =>
        postJson({ path: "/api/scm/branches", body: args }),
      createBranch: (args: { name: string; cwd?: string; from?: string }) =>
        postJson({ path: "/api/scm/branch-create", body: args }),
      checkoutBranch: (args: { name: string; cwd?: string }) =>
        postJson({ path: "/api/scm/branch-checkout", body: args }),
      mergeBranch: (args: { branch: string; cwd?: string }) =>
        postJson({ path: "/api/scm/branch-merge", body: args }),
      rebaseBranch: (args: { branch: string; cwd?: string }) =>
        postJson({ path: "/api/scm/branch-rebase", body: args }),
      cherryPick: (args: { commit: string; cwd?: string }) =>
        postJson({ path: "/api/scm/cherry-pick", body: args }),
    },
  };
}
