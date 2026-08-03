import { describe, expect, test } from "bun:test";
import {
  appendCommandOutput,
  createCommandOutputCollector,
  runCommandArgs,
} from "../electron/main/utils/command";

describe("appendCommandOutput", () => {
  test("preserves output below the limit", () => {
    expect(appendCommandOutput("hello", " world")).toBe("hello world");
  });

  test("keeps only the most recent output once the limit is exceeded", () => {
    const chunk = "a".repeat(80_000);
    const result = appendCommandOutput(chunk, `b${"c".repeat(80_000)}`);

    expect(result.length).toBe(128_000);
    expect(result.endsWith(`b${"c".repeat(80_000)}`)).toBe(true);
    expect(result.startsWith("a")).toBe(true);
  });

  test("supports a larger operation-specific output cap", () => {
    expect(appendCommandOutput("12345", "67890", 8)).toBe("34567890");
  });

  test("does not retain half of a surrogate pair at the truncation boundary", () => {
    expect(appendCommandOutput("", "😀B", 2)).toBe("B");
  });

  test("decodes UTF-8 characters split across output chunks", () => {
    const encoded = Buffer.from("A😀B", "utf8");
    const collector = createCommandOutputCollector();

    collector.append(encoded.subarray(0, 3));
    collector.append(encoded.subarray(3));

    expect(collector.finish()).toBe("A😀B");
    expect(collector.finish()).toBe("A😀B");
    expect(collector.wasTruncated()).toBe(false);
  });

  test("reports when collected output exceeded its cap", () => {
    const collector = createCommandOutputCollector(4);
    collector.append(Buffer.from("abcdef", "utf8"));

    expect(collector.finish()).toBe("cdef");
    expect(collector.wasTruncated()).toBe(true);
  });

  test("terminates commands that exceed their deadline", async () => {
    const result = await runCommandArgs({
      command: process.execPath,
      commandArgs: ["-e", "setTimeout(() => {}, 10000)"],
      timeoutMs: 20,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe(-1);
    expect(result.stderr).toContain("timed out after 20ms");
  });
});
