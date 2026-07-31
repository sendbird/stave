import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

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

function sorted(values: Iterable<string>) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function collectMatches(source: string, pattern: RegExp) {
  return new Set(collectMatchList(source, pattern));
}

function collectMatchList(source: string, pattern: RegExp) {
  return [...source.matchAll(pattern)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  );
}

function findDuplicates(values: readonly string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return sorted(duplicates);
}

const preloadSource = read("electron/preload.ts");
const windowApiSource = read("src/types/window-api.d.ts");
const providerIpcSource = read("electron/main/ipc/provider.ts");
const hostProtocolSource = read("electron/host-service/protocol.ts");
const hostDispatchSource = read("electron/host-service.ts");

const preloadProviderBlock = sliceBetween(
  preloadSource,
  "  provider: {",
  "  persistence: {",
);
const windowProviderBlock = sliceBetween(
  windowApiSource,
  "interface WindowProviderApi {",
  "interface WindowFsApi {",
);

const preloadMethods = collectMatches(
  preloadProviderBlock,
  /^ {4}([A-Za-z]\w*):/gm,
);
const declaredMethods = collectMatches(
  windowProviderBlock,
  /^ {2}([A-Za-z]\w*)\?:/gm,
);
const preloadInvokeChannelList = collectMatchList(
  preloadProviderBlock,
  /ipcRenderer\.invoke\(\s*"(provider:[^"]+)"/g,
);
const mainHandleChannelList = collectMatchList(
  providerIpcSource,
  /ipcMain\.handle\(\s*"(provider:[^"]+)"/g,
);
const preloadInvokeChannels = new Set(preloadInvokeChannelList);
const mainHandleChannels = new Set(mainHandleChannelList);
const hostMethods = collectMatches(
  providerIpcSource,
  /invokeHostService\(\s*"(provider\.[^"]+)"/g,
);

describe("provider IPC contract manifest", () => {
  test("keeps preload methods and the renderer Window API declaration aligned", () => {
    expect(sorted(preloadMethods)).toEqual(sorted(declaredMethods));
  });

  test("keeps every renderer invoke wired to exactly one main handler", () => {
    expect(findDuplicates(preloadInvokeChannelList)).toEqual([]);
    expect(findDuplicates(mainHandleChannelList)).toEqual([]);
    expect(sorted(preloadInvokeChannels)).toEqual(sorted(mainHandleChannels));
    expect(providerIpcSource).toContain('owner.send("provider:stream-event"');
    expect(
      /ipcRenderer\.on\(\s*"provider:stream-event"/.test(preloadSource),
    ).toBe(true);
  });

  test("validates every provider request at the main-process boundary", () => {
    for (const channel of mainHandleChannels) {
      const handlerStart = providerIpcSource.indexOf(`"${channel}"`);
      const nextHandler = providerIpcSource.indexOf(
        "ipcMain.handle(",
        handlerStart + channel.length + 2,
      );
      const handlerSource = providerIpcSource.slice(
        handlerStart,
        nextHandler < 0 ? undefined : nextHandler,
      );
      expect(
        handlerSource,
        `${channel} must parse an explicit IPC schema`,
      ).toContain("safeParse(");
    }
  });

  test("keeps forwarded routes in both the host protocol and dispatch", () => {
    for (const method of hostMethods) {
      expect(
        hostProtocolSource,
        `${method} missing from host protocol`,
      ).toContain(`"${method}"`);
      expect(
        hostDispatchSource,
        `${method} missing from host dispatch`,
      ).toContain(`case "${method}"`);
    }
  });
});
