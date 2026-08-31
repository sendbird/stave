import { describe, expect, test } from "bun:test";
import path from "node:path";

import { runAcpUtilityPrompt } from "../electron/providers/acp/acp-utility-prompt";

const cursorFixturePath = path.join(
  import.meta.dir,
  "fixtures",
  "fake-cursor-acp-agent.ts",
);

describe("runAcpUtilityPrompt", () => {
  test("collects plain text from a disposable Cursor utility turn", async () => {
    const result = await runAcpUtilityPrompt({
      providerId: "cursor",
      prompt: "Rewrite this draft.",
      cwd: import.meta.dir,
      runtimeOptions: { cursorBinaryPath: process.execPath },
      acpArgsForTest: [cursorFixturePath, "standard"],
    });

    expect(result).toMatchObject({
      ok: true,
      text: "Fixture response",
      resolvedModel: "auto",
    });
  });

  test("auto-rejects permission requests during a utility turn", async () => {
    const result = await runAcpUtilityPrompt({
      providerId: "cursor",
      prompt: "Rewrite this draft.",
      cwd: import.meta.dir,
      runtimeOptions: { cursorBinaryPath: process.execPath },
      acpArgsForTest: [cursorFixturePath, "permission"],
    });

    expect(result.ok).toBe(true);
    expect(result.text).toContain("response:");
  });
});
