import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  FetchPrCheckLogsArgsSchema,
  FetchPrContextIndexArgsSchema,
} from "../electron/main/ipc/schemas";
import { PR_CONTEXT_LIMITS } from "../src/lib/pr-context";

const root = path.resolve(import.meta.dir, "..");

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const preloadSource = read("electron/preload.ts");
const windowApiSource = read("src/types/window-api.d.ts");
const scmIpcSource = read("electron/main/ipc/scm.ts");
const hostProtocolSource = read("electron/host-service/protocol.ts");
const hostDispatchSource = read("electron/host-service.ts");
const prContextRuntimeSource = read(
  "electron/host-service/pr-context-runtime.ts",
);
const prContextDialogSource = read("src/components/layout/PrContextDialog.tsx");
const topBarPrSource = read("src/components/layout/TopBarOpenPR.tsx");
const appStoreSource = read("src/store/app.store.ts");

const CHANNELS = [
  {
    ipc: "scm:fetch-pr-context-index",
    host: "scm.fetch-pr-context-index",
    preloadMethod: "fetchPrContextIndex",
    runtimeFn: "fetchPrContextIndex",
  },
  {
    ipc: "scm:fetch-pr-check-logs",
    host: "scm.fetch-pr-check-logs",
    preloadMethod: "fetchPrCheckLogs",
    runtimeFn: "fetchPrCheckLogs",
  },
] as const;

describe("PR context IPC chain", () => {
  for (const channel of CHANNELS) {
    describe(channel.ipc, () => {
      test("renderer type declaration exists", () => {
        expect(windowApiSource).toContain(`${channel.preloadMethod}?: (args: {`);
      });

      test("preload bridges the channel", () => {
        expect(preloadSource).toContain(`${channel.preloadMethod}: (args:`);
        expect(preloadSource).toContain(
          `ipcRenderer.invoke("${channel.ipc}", args)`,
        );
      });

      test("main handles the channel and validates before forwarding", () => {
        expect(scmIpcSource).toContain(`ipcMain.handle("${channel.ipc}"`);
        expect(scmIpcSource).toContain(
          `invokeHostService("${channel.host}", parsed.data)`,
        );
      });

      test("host protocol declares both a request and a result shape", () => {
        const requestIndex = hostProtocolSource.indexOf(`"${channel.host}": {`);
        const resultIndex = hostProtocolSource.indexOf(
          `"${channel.host}": {`,
          requestIndex + 1,
        );
        expect(requestIndex).toBeGreaterThanOrEqual(0);
        expect(resultIndex).toBeGreaterThan(requestIndex);
      });

      test("host service dispatches to the runtime", () => {
        expect(hostDispatchSource).toContain(`case "${channel.host}":`);
        expect(hostDispatchSource).toContain(
          `await ${channel.runtimeFn}(request.params)`,
        );
      });

      test("the runtime function is exported", () => {
        expect(prContextRuntimeSource).toContain(
          `export async function ${channel.runtimeFn}(`,
        );
      });
    });
  }

  test("every layer names the same two channels and no more", () => {
    const preloadChannels = [
      ...preloadSource.matchAll(
        /ipcRenderer\.invoke\(\s*"(scm:fetch-pr-[^"]+)"/g,
      ),
    ].map((match) => match[1]);
    const mainChannels = [
      ...scmIpcSource.matchAll(/ipcMain\.handle\(\s*"(scm:fetch-pr-[^"]+)"/g),
    ].map((match) => match[1]);
    const expected = CHANNELS.map((channel) => channel.ipc).sort();
    expect([...preloadChannels].sort()).toEqual(expected);
    expect([...mainChannels].sort()).toEqual(expected);
  });
});

describe("PR context IPC argument schemas", () => {
  test("index args accept a bounded PR url and reject anything else", () => {
    expect(
      FetchPrContextIndexArgsSchema.safeParse({
        prUrl: "https://github.com/sendbird/stave/pull/348",
        cwd: "/repo",
      }).success,
    ).toBe(true);
    expect(
      FetchPrContextIndexArgsSchema.safeParse({ prUrl: "not-a-url" }).success,
    ).toBe(false);
    expect(
      FetchPrContextIndexArgsSchema.safeParse({
        prUrl: "https://github.com/o/r/pull/1",
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      FetchPrContextIndexArgsSchema.safeParse({
        prUrl: `https://github.com/o/r/pull/1?x=${"y".repeat(4_000)}`,
      }).success,
    ).toBe(false);
  });

  test("check log args require a hex head SHA and a capped id list", () => {
    const base = {
      prUrl: "https://github.com/sendbird/stave/pull/348",
      headSha: "88a73338498bed7d96bb21c7c7f6a3c3358d5f16",
    };
    expect(
      FetchPrCheckLogsArgsSchema.safeParse({ ...base, checkIds: [1, 2] })
        .success,
    ).toBe(true);
    for (const headSha of [
      "$(rm -rf /)",
      "--repo attacker/evil",
      "zzzz",
      "",
      "88a7333;ls",
    ]) {
      expect(
        FetchPrCheckLogsArgsSchema.safeParse({ ...base, headSha, checkIds: [] })
          .success,
        headSha,
      ).toBe(false);
    }
    expect(
      FetchPrCheckLogsArgsSchema.safeParse({
        ...base,
        checkIds: Array.from(
          { length: PR_CONTEXT_LIMITS.maxSelectedChecks + 1 },
          (_, i) => i,
        ),
      }).success,
    ).toBe(false);
    expect(
      FetchPrCheckLogsArgsSchema.safeParse({
        ...base,
        checkIds: [-1],
      }).success,
    ).toBe(false);
    expect(
      FetchPrCheckLogsArgsSchema.safeParse({
        ...base,
        checkIds: [1],
        extra: "x",
      }).success,
    ).toBe(false);
  });
});

describe("PR context ships with its consumer", () => {
  test("the dialog is reachable from the PR menu", () => {
    expect(topBarPrSource).toContain("PrContextDialog");
    expect(topBarPrSource).toContain("Attach PR context");
  });

  test("the dialog fetches metadata first and logs only on attach", () => {
    const loadIndexBlock = prContextDialogSource.slice(
      prContextDialogSource.indexOf("const loadIndex"),
      prContextDialogSource.indexOf("const handleAttach"),
    );
    expect(loadIndexBlock).toContain("fetchPrContextIndex");
    expect(loadIndexBlock).not.toContain("fetchPrCheckLogs");
    expect(prContextDialogSource).toContain("fetchPrCheckLogs");
  });

  test("the attachment lands on the canonical retrieved-context path", () => {
    expect(prContextDialogSource).toContain("attachTaskSourceContext");
    expect(prContextDialogSource).toContain('type: "retrieved_context"');
  });

  test("turn assembly withholds stale PR context", () => {
    expect(appStoreSource).toContain("partitionStalePrContexts");
    expect(appStoreSource).toContain("...freshSourceContexts,");
    expect(appStoreSource).not.toContain("...(task.sourceContexts ?? []),");
  });
});
