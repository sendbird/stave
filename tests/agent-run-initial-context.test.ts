import { describe, expect, test } from "bun:test";
import { AgentRunInitialContextSchema } from "../src/lib/agent-runs/initial-context";

const image = { dataUrl: "data:image/png;base64,AA==", label: "Screenshot", mimeType: "image/png" };
const source = { type: "retrieved_context", sourceId: "task:source", content: "Frozen reply" };

describe("agent run initial context boundary", () => {
  test("clones the context and accepts empty optional collections", () => {
    const input = { imageContexts: [image], retrievedContextParts: [source] };
    const snapshot = AgentRunInitialContextSchema.parse(input);
    expect(snapshot).toEqual(input);
    expect(snapshot.imageContexts?.[0]).not.toBe(image);
    expect(AgentRunInitialContextSchema.parse({})).toEqual({});
  });

  test("rejects oversized collections and content before a run starts", () => {
    expect(AgentRunInitialContextSchema.safeParse({ imageContexts: Array(17).fill(image) }).success).toBe(false);
    expect(AgentRunInitialContextSchema.safeParse({ retrievedContextParts: Array(33).fill(source) }).success).toBe(false);
    expect(AgentRunInitialContextSchema.safeParse({ retrievedContextParts: [{ ...source, content: "x".repeat(500_001) }] }).success).toBe(false);
    expect(AgentRunInitialContextSchema.safeParse({ fileContexts: [{ filePath: "brief.md", language: "markdown", content: "x".repeat(500_001) }] }).success).toBe(false);
  });

  test("refuses unrelated runtime options and non-context parts", () => {
    expect(AgentRunInitialContextSchema.safeParse({ runtimeOptions: { permissionMode: "auto" } }).success).toBe(false);
    expect(AgentRunInitialContextSchema.safeParse({ retrievedContextParts: [{ ...source, type: "system_event" }] }).success).toBe(false);
  });
});
