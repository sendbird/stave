import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  attributeWorkspacePorts,
  discoverWorkspaceListeningPorts,
  parseListeningSockets,
} from "../electron/host-service/workspace-listening-ports";
import { listeningPortUrl } from "../src/lib/workspace-scripts/listening-ports";

const workspacePath = "/tmp/project";
const nestedPath = `${workspacePath}/.stave/workspaces/feature`;
const base = { workspaceId: "main", workspacePath, knownPaths: [nestedPath] };

function socket(fd: number, family: string, address: string) {
  return `\nf${fd}\0t${family}\0n${address}\0`;
}

function listener(pid: number, host = "127.0.0.1", port = 5173) {
  return { pid, host, port, processName: "node" };
}

describe("workspace listening ports", () => {
  test("parses real lsof field framing and preserves each family's bind address", () => {
    const output = [
      "p21\0cDev Server\0",
      socket(12, "IPv4", "127.0.0.1:5173"),
      socket(13, "IPv6", "[::1]:5173"),
      socket(14, "IPv4", "*:8080"),
      socket(15, "IPv6", "*:8081"),
      socket(16, "IPv6", "[2001:db8::1]:443"),
      socket(17, "IPv4", "127.0.0.1:0"),
      socket(18, "IPv6", "[::1]:65536"),
      socket(19, "IPv4", "127.0.0.1:9->127.0.0.1:4"),
      "\np44\0cnode\0",
      socket(4, "IPv4", "192.0.2.1:3000"),
      "\n",
    ].join("");
    expect(parseListeningSockets(output)).toEqual([
      ...[
        listener(21),
        listener(21, "::1"),
        listener(21, "0.0.0.0", 8080),
        listener(21, "::", 8081),
        listener(21, "2001:db8::1", 443),
      ].map((row) => ({ ...row, processName: "Dev Server" })),
      listener(44, "192.0.2.1", 3000),
    ]);
  });

  test("coalesces repeat descriptors and same-process dual loopback without hiding other binds", () => {
    const rows = attributeWorkspacePorts({
      ...base,
      listeners: [listener(21, "::1"), listener(21), listener(21), listener(21, "192.0.2.1"), listener(31, "::1")],
      parents: new Map(),
      cwds: new Map([[21, workspacePath], [31, workspacePath]]),
      owners: new Map(),
    });
    expect(rows).toEqual([
      { ...listener(31, "::1"), attribution: "inferred" },
      { ...listener(21), attribution: "inferred" },
      { ...listener(21, "192.0.2.1"), attribution: "inferred" },
    ]);
  });

  test("prefers a registered PID or its descendants over cwd and ignores ambiguous ownership", () => {
    const rows = attributeWorkspacePorts({
      ...base,
      listeners: [listener(21), listener(22), listener(23), listener(24)],
      parents: new Map([[22, 21]]),
      cwds: new Map([[21, nestedPath], [23, workspacePath], [24, workspacePath]]),
      owners: new Map([
        [21, new Set(["main"])],
        [23, new Set(["nested"])],
        [24, new Set(["main", "nested"])],
      ]),
    });
    expect(rows).toEqual([21, 22].map((pid) => ({ ...listener(pid), attribution: "owned" })));
  });

  test("uses the closest workspace cwd and keeps nested, parent and similarly named paths distinct", () => {
    const evidence = {
      listeners: [21, 22, 23, 24].map((pid) => listener(pid)),
      parents: new Map([[22, 21], [23, 21]]),
      cwds: new Map([
        [21, `${workspacePath}/packages/app`],
        [22, `${nestedPath}/src`],
        [23, "/tmp/transient"],
        [24, `${workspacePath}-unrelated`],
      ]),
      owners: new Map(),
    };
    const parent = attributeWorkspacePorts({ ...base, ...evidence });
    const nested = attributeWorkspacePorts({
      ...evidence,
      workspaceId: "nested",
      workspacePath: nestedPath,
      knownPaths: [workspacePath],
    });
    expect(parent.map(({ pid, attribution }) => [pid, attribution])).toEqual([[21, "inferred"], [23, "inferred"]]);
    expect(nested.map(({ pid }) => pid)).toEqual([22]);
  });

  test("opens wildcard binds on the matching loopback family and preserves specific binds", () => {
    const owned = { attribution: "owned" } as const;
    expect(listeningPortUrl({ ...listener(21, "0.0.0.0"), ...owned })).toBe("http://127.0.0.1:5173");
    expect(listeningPortUrl({ ...listener(21, "::"), ...owned })).toBe("http://[::1]:5173");
    expect(listeningPortUrl({ ...listener(21, "192.0.2.1"), ...owned })).toBe("http://192.0.2.1:5173");
    expect(listeningPortUrl({ ...listener(21, "fe80::1%en0"), ...owned })).toBeNull();
  });
});

if (process.platform === "darwin") {
  test("discovers a live macOS listener in a nested workspace and keeps it out of the parent", async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "stave-listening-ports-")));
    const nested = path.join(root, "feature");
    await mkdir(nested);
    const child = Bun.spawn([process.execPath, "-e", `
      const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("ok") });
      console.log(server.port);
    `], { cwd: nested, stdout: "pipe", stderr: "inherit" });
    const output = child.stdout.getReader();
    try {
      const { value } = await output.read();
      const port = Number(new TextDecoder().decode(value).trim());
      expect(port).toBeGreaterThan(0);
      const [parent, inferred, owned] = await Promise.all([
        discoverWorkspaceListeningPorts({ workspaceId: "main", workspacePath: root, knownPaths: [nested], readOwners: () => new Map() }),
        discoverWorkspaceListeningPorts({ workspaceId: "feature", workspacePath: nested, knownPaths: [root], readOwners: () => new Map() }),
        discoverWorkspaceListeningPorts({ workspaceId: "feature", workspacePath: nested, knownPaths: [root], readOwners: () => new Map([[child.pid, new Set(["feature"])]]) }),
      ]);
      expect(parent).toEqual({ status: "available", ports: [] });
      expect(inferred).toEqual({
        status: "available",
        ports: [expect.objectContaining({ pid: child.pid, host: "127.0.0.1", port, attribution: "inferred" })],
      });
      expect(owned).toEqual({
        status: "available",
        ports: [expect.objectContaining({ pid: child.pid, port, attribution: "owned" })],
      });
    } finally {
      await output.cancel();
      child.kill();
      await child.exited;
      await rm(root, { recursive: true, force: true });
    }
  });
}
