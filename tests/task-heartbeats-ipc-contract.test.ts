import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  TaskHeartbeatCreateArgsSchema,
  TaskHeartbeatIdArgsSchema,
  TaskHeartbeatListArgsSchema,
  TaskHeartbeatSetPausedArgsSchema,
  TaskHeartbeatUpdateArgsSchema,
} from "../electron/main/ipc/schemas";
import { TASK_HEARTBEAT_LIMITS } from "@/lib/automation/task-supervisor";

const root = path.resolve(import.meta.dir, "..");

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function sliceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing start marker: ${start}`).toBeGreaterThanOrEqual(
    0,
  );
  expect(endIndex, `missing end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

const preloadSource = read("electron/preload.ts");
const windowApiSource = read("src/types/window-api.d.ts");
const heartbeatIpcSource = read("electron/main/ipc/task-heartbeats.ts");
const ipcIndexSource = read("electron/main/ipc/index.ts");
const supervisorServiceSource = read(
  "electron/main/task-supervisor-service.ts",
);

const preloadBlock = sliceBetween(
  preloadSource,
  "  taskHeartbeats: {",
  "  lsp: {",
);
const windowApiBlock = sliceBetween(
  windowApiSource,
  "interface WindowTaskHeartbeatsApi {",
  "type LspLanguageId",
);

/**
 * The whole chain in one table: renderer declaration -> preload bridge -> main
 * handler -> the main-process supervisor bridge. Every row below is asserted at
 * each layer, and the closing test proves no layer carries a channel that is
 * missing from this table.
 */
const CHANNELS = [
  {
    ipc: "task-heartbeats:list",
    preloadMethod: "list",
    schema: "TaskHeartbeatListArgsSchema",
    serviceFns: ["listTaskHeartbeats"],
  },
  {
    ipc: "task-heartbeats:create",
    preloadMethod: "create",
    schema: "TaskHeartbeatCreateArgsSchema",
    serviceFns: ["createTaskHeartbeat"],
  },
  {
    ipc: "task-heartbeats:update",
    preloadMethod: "update",
    schema: "TaskHeartbeatUpdateArgsSchema",
    serviceFns: ["updateTaskHeartbeat"],
  },
  {
    ipc: "task-heartbeats:set-paused",
    preloadMethod: "setPaused",
    schema: "TaskHeartbeatSetPausedArgsSchema",
    serviceFns: ["pauseTaskHeartbeat", "resumeTaskHeartbeat"],
  },
  {
    ipc: "task-heartbeats:remove",
    preloadMethod: "remove",
    schema: "TaskHeartbeatIdArgsSchema",
    serviceFns: ["removeTaskHeartbeat"],
  },
] as const;

/** The body of one handler, whatever line breaks the source happens to use. */
function handlerSourceFor(channel: string) {
  const handler = heartbeatIpcSource
    .split("ipcMain.handle(")
    .find((segment) => segment.trimStart().startsWith(`"${channel}"`));
  expect(handler, `missing handler for ${channel}`).toBeDefined();
  return handler ?? "";
}

describe("task heartbeat IPC chain", () => {
  for (const channel of CHANNELS) {
    describe(channel.ipc, () => {
      test("renderer type declaration exists", () => {
        expect(windowApiBlock).toContain(`${channel.preloadMethod}?: (args`);
      });

      test("preload bridges the channel", () => {
        expect(preloadBlock).toContain(`${channel.preloadMethod}: (args`);
        expect(preloadBlock).toContain(
          `ipcRenderer.invoke("${channel.ipc}", args)`,
        );
      });

      test("main validates the request before touching the supervisor", () => {
        const handler = handlerSourceFor(channel.ipc);
        expect(handler).toContain(`${channel.schema}.safeParse(args)`);
        expect(handler).not.toContain(`${channel.schema}.parse(`);
        // The parse guard has to come first, otherwise unvalidated args reach
        // the host service.
        for (const serviceFn of channel.serviceFns) {
          expect(handler.indexOf("safeParse(")).toBeLessThan(
            handler.indexOf(`${serviceFn}(`),
          );
        }
      });

      test("main calls the existing supervisor service function", () => {
        const handler = handlerSourceFor(channel.ipc);
        for (const serviceFn of channel.serviceFns) {
          expect(handler, `${channel.ipc} must call ${serviceFn}`).toContain(
            `${serviceFn}(`,
          );
          expect(supervisorServiceSource).toContain(
            `export function ${serviceFn}(`,
          );
        }
        expect(heartbeatIpcSource).toContain(
          'from "../task-supervisor-service"',
        );
      });
    });
  }

  test("every layer names the same five channels and no more", () => {
    const expected = CHANNELS.map((channel) => channel.ipc).sort();
    const preloadChannels = [
      ...preloadSource.matchAll(
        /ipcRenderer\.invoke\(\s*"(task-heartbeats:[^"]+)"/g,
      ),
    ].map((match) => match[1]);
    const mainChannels = [
      ...heartbeatIpcSource.matchAll(
        /ipcMain\.handle\(\s*"(task-heartbeats:[^"]+)"/g,
      ),
    ].map((match) => match[1]);
    expect([...preloadChannels].sort()).toEqual(expected);
    expect([...mainChannels].sort()).toEqual(expected);
    expect(new Set(preloadChannels).size).toBe(expected.length);
    expect(new Set(mainChannels).size).toBe(expected.length);
  });

  test("preload methods and the renderer declaration stay aligned", () => {
    const preloadMethods = [
      ...preloadBlock.matchAll(/^ {4}([A-Za-z]\w*):/gm),
    ].map((match) => match[1]);
    const declaredMethods = [
      ...windowApiBlock.matchAll(/^ {2}([A-Za-z]\w*)\?:/gm),
    ].map((match) => match[1]);
    const expected = CHANNELS.map((channel) => channel.preloadMethod).sort();
    expect([...preloadMethods].sort()).toEqual(expected);
    expect([...declaredMethods].sort()).toEqual(expected);
    expect(windowApiSource).toContain(
      "taskHeartbeats?: WindowTaskHeartbeatsApi;",
    );
  });

  test("the handlers are registered with the rest of the IPC surface", () => {
    expect(ipcIndexSource).toContain(
      'import { registerTaskHeartbeatHandlers } from "./task-heartbeats";',
    );
    expect(ipcIndexSource).toContain("registerTaskHeartbeatHandlers();");
    expect(heartbeatIpcSource).toContain(
      "export function registerTaskHeartbeatHandlers()",
    );
  });

  test("no handler can throw across IPC, and failures mirror routines", () => {
    for (const channel of CHANNELS) {
      const handler = handlerSourceFor(channel.ipc);
      expect(handler, `${channel.ipc} must catch`).toContain(
        "} catch (error) {",
      );
      expect(handler).toContain("errorMessage(");
    }
    expect(handlerSourceFor("task-heartbeats:list")).toContain(
      "snapshot: emptySnapshot()",
    );
    expect(heartbeatIpcSource).toContain(
      "return { heartbeats: [], summaries: [] };",
    );
    for (const channel of ["create", "update", "set-paused"]) {
      expect(handlerSourceFor(`task-heartbeats:${channel}`)).toContain(
        "heartbeat: null",
      );
    }
  });
});

const VALID_INPUT = {
  workspaceId: "workspace-alpha",
  taskId: "task-alpha",
  prompt: "Re-check CI and report only on change.",
  trigger: {
    kind: "schedule",
    schedule: { every: 30, unit: "minutes" },
  },
  maxOccurrences: 12,
  expiresAt: null,
};

const VALID_ID = "6f1c2a2e-6b0d-4f4a-9a2f-1b3c4d5e6f70";

describe("task heartbeat IPC argument schemas", () => {
  test("list args accept an optional bounded workspace id", () => {
    expect(TaskHeartbeatListArgsSchema.safeParse({}).success).toBe(true);
    expect(
      TaskHeartbeatListArgsSchema.safeParse({ workspaceId: "workspace-alpha" })
        .success,
    ).toBe(true);
    expect(
      TaskHeartbeatListArgsSchema.safeParse({ workspaceId: "" }).success,
    ).toBe(false);
    expect(
      TaskHeartbeatListArgsSchema.safeParse({
        workspaceId: "w".repeat(TASK_HEARTBEAT_LIMITS.maxIdChars + 1),
      }).success,
    ).toBe(false);
    // `.strict()`: an unknown key is a rejection, not a silently dropped field.
    expect(
      TaskHeartbeatListArgsSchema.safeParse({ workspaceID: "workspace-alpha" })
        .success,
    ).toBe(false);
    expect(TaskHeartbeatListArgsSchema.safeParse(undefined).success).toBe(
      false,
    );
  });

  test("create args wrap the domain input and inherit its bounds", () => {
    expect(
      TaskHeartbeatCreateArgsSchema.safeParse({ input: VALID_INPUT }).success,
    ).toBe(true);
    expect(TaskHeartbeatCreateArgsSchema.safeParse({}).success).toBe(false);
    expect(
      TaskHeartbeatCreateArgsSchema.safeParse({
        input: { ...VALID_INPUT, taskId: undefined },
      }).success,
    ).toBe(false);
    expect(
      TaskHeartbeatCreateArgsSchema.safeParse({
        input: {
          ...VALID_INPUT,
          prompt: "x".repeat(TASK_HEARTBEAT_LIMITS.maxPromptChars + 1),
        },
      }).success,
    ).toBe(false);
    expect(
      TaskHeartbeatCreateArgsSchema.safeParse({
        input: {
          ...VALID_INPUT,
          maxOccurrences: TASK_HEARTBEAT_LIMITS.maxOccurrenceCap + 1,
        },
      }).success,
    ).toBe(false);
    expect(
      TaskHeartbeatCreateArgsSchema.safeParse({
        input: { ...VALID_INPUT, trigger: { kind: "schedule" } },
      }).success,
    ).toBe(false);
    // `.strict()` at both levels: the wrapper and the domain input.
    expect(
      TaskHeartbeatCreateArgsSchema.safeParse({
        input: VALID_INPUT,
        id: VALID_ID,
      }).success,
    ).toBe(false);
    expect(
      TaskHeartbeatCreateArgsSchema.safeParse({
        input: { ...VALID_INPUT, projectPath: "/repo" },
      }).success,
    ).toBe(false);
  });

  test("update args require an id alongside a full definition", () => {
    expect(
      TaskHeartbeatUpdateArgsSchema.safeParse({
        id: VALID_ID,
        input: VALID_INPUT,
      }).success,
    ).toBe(true);
    expect(
      TaskHeartbeatUpdateArgsSchema.safeParse({ input: VALID_INPUT }).success,
    ).toBe(false);
    for (const id of ["", "not-a-uuid", "../../etc/passwd", VALID_ID + "x"]) {
      expect(
        TaskHeartbeatUpdateArgsSchema.safeParse({ id, input: VALID_INPUT })
          .success,
        id,
      ).toBe(false);
    }
    expect(
      TaskHeartbeatUpdateArgsSchema.safeParse({
        id: VALID_ID,
        input: VALID_INPUT,
        force: true,
      }).success,
    ).toBe(false);
  });

  test("set-paused args carry a real boolean", () => {
    expect(
      TaskHeartbeatSetPausedArgsSchema.safeParse({ id: VALID_ID, paused: true })
        .success,
    ).toBe(true);
    expect(
      TaskHeartbeatSetPausedArgsSchema.safeParse({
        id: VALID_ID,
        paused: false,
      }).success,
    ).toBe(true);
    expect(
      TaskHeartbeatSetPausedArgsSchema.safeParse({ id: VALID_ID }).success,
    ).toBe(false);
    expect(
      TaskHeartbeatSetPausedArgsSchema.safeParse({
        id: VALID_ID,
        paused: "true",
      }).success,
    ).toBe(false);
    expect(
      TaskHeartbeatSetPausedArgsSchema.safeParse({
        id: VALID_ID,
        paused: true,
        reason: "because",
      }).success,
    ).toBe(false);
  });

  test("id args accept only a single uuid", () => {
    expect(TaskHeartbeatIdArgsSchema.safeParse({ id: VALID_ID }).success).toBe(
      true,
    );
    expect(TaskHeartbeatIdArgsSchema.safeParse({}).success).toBe(false);
    expect(
      TaskHeartbeatIdArgsSchema.safeParse({ id: [VALID_ID] }).success,
    ).toBe(false);
    expect(
      TaskHeartbeatIdArgsSchema.safeParse({ id: VALID_ID, cascade: true })
        .success,
    ).toBe(false);
  });
});
