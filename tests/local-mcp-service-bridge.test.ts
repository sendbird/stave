import { afterEach, describe, expect, mock, test } from "bun:test";

const sentMessages: Array<{ channel: string; payload: unknown }> = [];
const invokeCalls: Array<{ method: string; params: unknown }> = [];
let workspaceInformationListener:
  | ((payload: { workspaceId: string; workspaceInformation: unknown }) => void)
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
      provider: "stave",
      model: "gpt-5.4",
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
    listener: (payload: { workspaceId: string; workspaceInformation: unknown }) => void,
  ) => {
    if (event === "local-mcp.workspace-information-updated") {
      workspaceInformationListener = listener;
    }
    return () => {
      workspaceInformationListener = null;
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
});
