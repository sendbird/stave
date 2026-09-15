import { expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("keep-active preferences persist exact workspace and tab identities", async () => {
  const directory = mkdtempSync(join(tmpdir(), "stave-lens-preferences-"));
  mock.module("electron", () => ({ app: { getPath: () => directory } }));
  try {
    const { isLensKeptActive, setLensKeptActive } = await import("../electron/main/browser/lens-resource-preferences");
    expect(isLensKeptActive("w", "tab")).toBe(false);
    setLensKeptActive("w", "tab", true);
    expect(isLensKeptActive("w", "tab")).toBe(true);
    expect(isLensKeptActive("other", "tab")).toBe(false);
    expect(JSON.parse(readFileSync(join(directory, "lens-keep-active.json"), "utf8"))).toEqual([JSON.stringify(["w", "tab"])]);
    setLensKeptActive("w", "tab", false);
    expect(isLensKeptActive("w", "tab")).toBe(false);
    expect(JSON.parse(readFileSync(join(directory, "lens-keep-active.json"), "utf8"))).toEqual([]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    mock.restore();
  }
});
