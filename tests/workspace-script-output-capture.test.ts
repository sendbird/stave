import { expect, test } from "bun:test";
import { createScriptOutputCapture } from "../electron/main/workspace-scripts/output-capture";

test("one oversized chunk and later Unicode chunks cannot exceed the verification byte budget", () => {
  const capture = createScriptOutputCapture();
  capture.append("failure: ");
  capture.append("한글🚀".repeat(100_000));
  capture.append("more output ".repeat(100_000));
  expect(Buffer.byteLength(capture.read(), "utf8")).toBeLessThanOrEqual(64 * 1024);
  expect(capture.read()).toStartWith("failure: ");
  expect(capture.read()).toContain("Verification output truncated");
});

test("ordinary output retains exact chunk order without a truncation warning", () => {
  const capture = createScriptOutputCapture();
  capture.append("line one\n"); capture.append("line two\n");
  expect(capture.read()).toBe("line one\nline two\n");
});
