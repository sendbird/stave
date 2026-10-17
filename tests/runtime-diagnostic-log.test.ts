import { afterAll, expect, mock, setSystemTime, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const userDataPath = mkdtempSync(path.join(os.tmpdir(), "stave-runtime-diagnostic-log-"));
mock.module("electron", () => ({ app: { getPath: () => userDataPath } }));

const { appendRuntimeDiagnostic, __runtimeDiagnosticLogTest } = await import("../electron/main/runtime-diagnostic-log");

afterAll(() => {
  setSystemTime();
  rmSync(userDataPath, { recursive: true, force: true });
});

const report = (sessionId: string) =>
  appendRuntimeDiagnostic({ scope: "renderer", context: "test", message: "boom", metadata: { sessionId } });

const loggedLines = () => readFileSync(path.join(userDataPath, "renderer-errors.log"), "utf8").trim().split("\n");

test("drops expired duplicate fingerprints once many distinct reports pile up, and still deduplicates fresh ones", async () => {
  setSystemTime(new Date("2026-10-01T00:00:00.000Z"));
  for (let index = 0; index < 300; index += 1) await report(`old-${index}`);
  expect(__runtimeDiagnosticLogTest.fingerprintCount()).toBe(300);

  setSystemTime(new Date("2026-10-01T00:00:05.000Z"));
  await report("fresh");
  expect(__runtimeDiagnosticLogTest.fingerprintCount()).toBe(1);

  await report("fresh");
  expect(loggedLines()).toHaveLength(301);
});
