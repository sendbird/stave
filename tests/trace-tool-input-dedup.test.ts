import { describe, expect, test } from "bun:test";
import {
  deriveTraceToolSummary,
  getResidualToolInput,
} from "@/components/session/message/assistant-trace.utils";

/*
 * The expanded tool step used to repeat whatever the header chip already
 * showed: `Bash [bun run typecheck]` followed by an INPUT panel reading
 * `{"command":"bun run typecheck"}`. These guard the de-duplication.
 */

function residualFor(toolName: string, input: Record<string, unknown>): string | null {
  const serialized = JSON.stringify(input);
  return getResidualToolInput({
    input: serialized,
    summary: deriveTraceToolSummary({ toolName, input: serialized }),
  });
}

describe("getResidualToolInput", () => {
  test("drops the panel entirely for single-argument tools", () => {
    expect(residualFor("Bash", { command: "bun run typecheck" })).toBeNull();
    expect(residualFor("Grep", { pattern: "animate-cot-step-in" })).toBeNull();
    expect(residualFor("WebFetch", { url: "https://beui.dev" })).toBeNull();
    /* A bare filename is its own basename, so nothing is lost by dropping it. */
    expect(residualFor("Read", { file_path: "globals.css" })).toBeNull();
  });

  test("keeps the directory that the basename chip hides", () => {
    const residual = residualFor("Read", { file_path: "src/components/ai-elements/tool.tsx" });

    expect(residual).not.toBeNull();
    expect(residual).toContain("src/components/ai-elements/tool.tsx");
  });

  test("keeps the arguments the chip does not cover", () => {
    const residual = residualFor("Grep", { pattern: "TODO", path: "src", output_mode: "content" });

    expect(residual).not.toBeNull();
    expect(JSON.parse(residual as string)).toEqual({ path: "src", output_mode: "content" });
    /* The chip's own field must not reappear inside the residual panel. */
    expect(residual).not.toContain("pattern");
  });

  test("keeps the full value when the chip only shows a truncated preview", () => {
    const command = "echo ".concat("x".repeat(400));
    const residual = residualFor("Bash", { command });

    expect(residual).not.toBeNull();
    expect(residual).toContain(command);
  });

  test("does not claim a source key when the chip text is derived, not copied", () => {
    const summary = deriveTraceToolSummary({
      toolName: "Read",
      input: JSON.stringify({ file_path: "src/components/ai-elements/tool.tsx" }),
    });
    expect(summary?.text).toBe("tool.tsx");
    expect(summary?.sourceKey).toBeUndefined();
  });

  test("falls back to the raw input when it is not a JSON object", () => {
    expect(getResidualToolInput({ input: "plain text", summary: null })).toBe("plain text");
    expect(getResidualToolInput({ input: "   ", summary: null })).toBeNull();
  });
});
