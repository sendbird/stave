import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { thresholdTone } from "@/components/ads/utils/tone";

const ROOT = path.resolve(import.meta.dir, "..");

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/**
 * Every `type …Tone… = …;` declaration whose body names a string literal of
 * its own, once `Extract<…>`/`Exclude<…>` (which can only narrow an existing
 * vocabulary) are set aside: that is a new tone vocabulary rather than `Tone`.
 */
const TONE_DECLARATION = /\btype\s+(\w*Tone\w*)\s*(?:<[^>]*>)?\s*=([^;]*);/g;
const NARROWING = /\b(?:Extract|Exclude)<[^<>]*>/g;

function toneUnionDeclarations(file: string, source: string): string[] {
  return [...source.matchAll(TONE_DECLARATION)]
    .filter((match) => match[2]!.replace(NARROWING, "").includes('"'))
    .map((match) => `${file}:${source.slice(0, match.index).split("\n").length} ${match[1]}`);
}

describe("tone vocabulary", () => {
  test("product code declares no tone union of its own", () => {
    const offenders = listSourceFiles(path.join(ROOT, "src"))
      .map((file) => path.relative(ROOT, file))
      .filter((file) => !file.startsWith(`src${path.sep}components${path.sep}ads${path.sep}`))
      .flatMap((file) => toneUnionDeclarations(file, readFileSync(path.join(ROOT, file), "utf8")));
    // Use `Tone` or `Extract<Tone, …>` from `src/components/ads/utils/tone`, a
    // `*State` for a work state, or a `*Hue` for an identity or a category.
    expect(offenders).toEqual([]);
  });

  test("the check reads declarations the way they are written", () => {
    expect(toneUnionDeclarations("a.ts", 'type BadTone = "ok" | "warn";')).toEqual(["a.ts:1 BadTone"]);
    expect(toneUnionDeclarations("a.ts", 'export type BadTone =\n  | "ok"\n  | "warn";')).toHaveLength(1);
    expect(toneUnionDeclarations("a.ts", 'type MixedTone = Hue | "accent";')).toHaveLength(1);
    expect(toneUnionDeclarations("a.ts", 'type GoodTone = Extract<Tone, "success" | "danger">;')).toEqual([]);
    expect(toneUnionDeclarations("a.ts", "type AliasTone = Tone;")).toEqual([]);
  });
});

describe("thresholdTone", () => {
  const scale = [
    { from: 60, tone: "warning" },
    { from: 85, tone: "danger" },
  ] as const;

  test("the highest threshold reached wins", () => {
    expect(thresholdTone(0, scale, "success")).toBe("success");
    expect(thresholdTone(59.9, scale, "success")).toBe("success");
    expect(thresholdTone(60, scale, "success")).toBe("warning");
    expect(thresholdTone(84, scale, "success")).toBe("warning");
    expect(thresholdTone(85, scale, "success")).toBe("danger");
    expect(thresholdTone(1000, scale, "success")).toBe("danger");
  });

  test("the order a scale is written in does not matter", () => {
    expect(thresholdTone(90, [...scale].reverse(), "neutral")).toBe("danger");
    expect(thresholdTone(70, [...scale].reverse(), "neutral")).toBe("warning");
  });

  test("a reading that is not a number takes the fallback", () => {
    expect(thresholdTone(Number.NaN, scale, "neutral")).toBe("neutral");
    expect(thresholdTone(5, [], "muted")).toBe("muted");
  });
});
