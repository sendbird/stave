import { afterEach, describe, expect, mock, test } from "bun:test";

const sentMessages: Array<{ channel: string; payload: unknown }> = [];
const invokeCalls: Array<{ method: string; params: unknown }> = [];
let workspaceInformationListener:
  | ((payload: { workspaceId: string; workspaceInformation: unknown }) => void)
  | null = null;
let taskTurnUpdateListener:
  | ((payload: {
      workspaceId: string;
      taskId: string;
      turnId: string;
      eventType: string;
    }) => void)
  | null = null;

mock.module("electron", () => ({
  app: {
    getPath: () => "/tmp/stave-test-user-data",
  },
  webContents: {
    getAllWebContents: () => [{
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) => {
        sentMessages.push({ channel, payload });
      },
    }],
  },
}));

mock.module("../electron/main/host-service-client", () => ({
  invokeHostService: async (method: string, params: unknown) => {
    invokeCalls.push({ method, params });
    return {
      ok: true,
      workspaceId: "workspace-1",
      taskId: "task-1",
      taskTitle: "Task",
      turnId: "turn-1",
      provider: "claude-code",
      model: "claude-sonnet-4-6",
    };
  },
  resolveHostServiceScriptPath: (args: {
    moduleUrl: string;
    pathExists?: (path: string) => boolean;
  }) => {
    const pathExists = args.pathExists ?? (() => false);
    const siblingCandidate = "/tmp/stave/out/main/host-service.js";
    if (pathExists(siblingCandidate)) {
      return siblingCandidate;
    }
    return siblingCandidate;
  },
  measureSerializedHostServiceRequestBytes: (args: {
    method: string;
    params: unknown;
  }) => Buffer.byteLength(JSON.stringify(args), "utf8"),
  onHostServiceEvent: (
    event: string,
    listener: (payload: never) => void,
  ) => {
    if (event === "local-mcp.workspace-information-updated") {
      workspaceInformationListener = listener as typeof workspaceInformationListener;
    }
    if (event === "local-mcp.task-turn-updated") {
      taskTurnUpdateListener = listener as typeof taskTurnUpdateListener;
    }
    return () => {
      if (event === "local-mcp.workspace-information-updated") {
        workspaceInformationListener = null;
      }
      if (event === "local-mcp.task-turn-updated") {
        taskTurnUpdateListener = null;
      }
    };
  },
}));

const localMcpService = await import("../electron/main/stave-mcp-service");

afterEach(() => {
  sentMessages.length = 0;
  invokeCalls.length = 0;
  mock.restore();
});

describe("local MCP service bridge", () => {
  test("routes runTask through the host-service local MCP action", async () => {
    const result = await localMcpService.runTask({
      workspaceId: "workspace-1",
      prompt: "Ship it",
    });

    expect(result.turnId).toBe("turn-1");
    expect(invokeCalls).toEqual([{
      method: "local-mcp.invoke",
      params: {
        action: "run-task",
        args: {
          workspaceId: "workspace-1",
          prompt: "Ship it",
        },
      },
    }]);
  });

  test("routes an Advisor consult to the process that minted the grant", async () => {
    // The grant registry is a module-level map in the host-service child, so a
    // main-process lookup would always miss with `unknown-consult-key`.
    await localMcpService.consultAdvisor({
      consultKey: "grant-1",
      question: "Is the cancellation path sound?",
      context: "runAdvisorCall(...)",
    });

    expect(invokeCalls).toEqual([{
      method: "provider.consult-advisor",
      params: {
        consultKey: "grant-1",
        question: "Is the cancellation path sound?",
        context: "runAdvisorCall(...)",
      },
    }]);
  });

  test("routes approved Crane work through the trusted kickoff action", async () => {
    const retrievedContextParts = [{
      type: "retrieved_context" as const,
      sourceId: "crane:CRANE-42",
      title: "Crane CRANE-42",
      content: "Untrusted remote issue context.",
    }];

    await localMcpService.runLocallyApprovedCraneTask({
      workspaceId: "workspace-1",
      prompt: "Work on the approved issue",
      provider: "codex",
      runtimeOptions: { model: "gpt-5.6" },
      retrievedContextParts,
    });

    expect(invokeCalls).toEqual([{
      method: "crane.run-task",
      params: {
        workspaceId: "workspace-1",
        prompt: "Work on the approved issue",
        provider: "codex",
        runtimeOptions: { model: "gpt-5.6" },
        retrievedContextParts,
      },
    }]);
  });

  test("releases completed Crane task control through the trusted action", async () => {
    await localMcpService.releaseLocallyManagedCraneTask({
      workspaceId: "workspace-1",
      taskId: "task-1",
    });

    expect(invokeCalls).toEqual([{
      method: "crane.release-task-control",
      params: {
        workspaceId: "workspace-1",
        taskId: "task-1",
      },
    }]);
  });

  test("routes interactive takeover through authoritative host task control", async () => {
    await localMcpService.takeOverManagedTask({
      workspaceId: "workspace-1",
      taskId: "task-1",
    });

    expect(invokeCalls).toEqual([{
      method: "task.take-over",
      params: {
        workspaceId: "workspace-1",
        taskId: "task-1",
      },
    }]);
  });

  test("routes managed task stop through authoritative host task control", async () => {
    await localMcpService.stopManagedTask({
      workspaceId: "workspace-1",
      taskId: "task-1",
    });

    expect(invokeCalls).toEqual([{
      method: "task.stop",
      params: {
        workspaceId: "workspace-1",
        taskId: "task-1",
      },
    }]);
  });

  test("forwards workspace information updates back to renderer listeners", () => {
    expect(workspaceInformationListener).not.toBeNull();
    const payload = {
      workspaceId: "workspace-1",
      workspaceInformation: {
        notes: "updated",
      },
    };

    workspaceInformationListener?.(payload);

    expect(sentMessages).toEqual([{
      channel: "local-mcp:workspace-information-updated",
      payload,
    }]);
  });

  test("forwards persisted task turn updates back to renderer listeners", () => {
    expect(taskTurnUpdateListener).not.toBeNull();
    const payload = {
      workspaceId: "workspace-1",
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "codex",
      model: "gpt-5.6",
      sequence: 4,
      eventType: "text",
      done: false,
    };

    taskTurnUpdateListener?.(payload);

    expect(sentMessages).toEqual([{
      channel: "local-mcp:task-turn-updated",
      payload,
    }]);
  });
});
