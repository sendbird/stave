import { describe, expect, test } from "bun:test";
import { buildStaveLocalMcpServerInstructions } from "../electron/main/stave-mcp-server-instructions";

describe("buildStaveLocalMcpServerInstructions", () => {
  test("names the tool families and the injected-context rule", () => {
    const text = buildStaveLocalMcpServerInstructions();
    expect(text).toContain("stave_*_workspace_*");
    expect(text).toContain("stave_remember");
    expect(text).toContain("stave_respond_user_input");
    expect(text).not.toContain("stave_respond_approval");
    expect(text).toContain("[Retrieved Context]");
    expect(text).toContain("stave_get_workspace_information");
  });

  test("mentions Lens only when the browser tools are registered", () => {
    expect(buildStaveLocalMcpServerInstructions()).toContain("stave_lens_");
    expect(
      buildStaveLocalMcpServerInstructions({ browserToolsEnabled: true }),
    ).toContain("stave_lens_snapshot");
    expect(
      buildStaveLocalMcpServerInstructions({ browserToolsEnabled: false }),
    ).not.toContain("stave_lens_");
  });

  test("stays small because it is resident in every turn", () => {
    expect(buildStaveLocalMcpServerInstructions().length).toBeLessThan(1_200);
  });
});

describe("tool names in free text", () => {
  test("the server instructions and the memory context name only registered tools", async () => {
    const { readFile } = await import("node:fs/promises");
    const registry = [
      await readFile("electron/main/stave-mcp-server.ts", "utf8"),
      await readFile("electron/main/stave-collaboration-tools.ts", "utf8"),
      await readFile("electron/main/browser/browser-tools.ts", "utf8"),
      await readFile("src/lib/missions/briefing.ts", "utf8"),
    ].join("\n");
    const texts = [
      buildStaveLocalMcpServerInstructions(),
      await readFile("src/lib/task-context/repository-memory.ts", "utf8"),
    ];
    const named = new Set(texts.flatMap((text) => text.match(/\bstave_[a-z]+(?:_[a-z]+)*\b/g) ?? []));
    expect(named.size).toBeGreaterThan(0);
    for (const tool of named) {
      expect({ tool, registered: registry.includes(`"${tool}"`) }).toEqual({ tool, registered: true });
    }
  });
});
