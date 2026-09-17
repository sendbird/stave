import { describe, expect, test } from "bun:test";
import { buildStaveLocalMcpServerInstructions } from "../electron/main/stave-mcp-server-instructions";

describe("buildStaveLocalMcpServerInstructions", () => {
  test("names the tool families and the injected-context rule", () => {
    const text = buildStaveLocalMcpServerInstructions();
    expect(text).toContain("stave_*_workspace_*");
    expect(text).toContain("stave_remember");
    expect(text).toContain("stave_respond_approval");
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
