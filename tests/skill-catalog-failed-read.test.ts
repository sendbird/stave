import { afterEach, describe, expect, test } from "bun:test";
import type { SkillCatalogEntry, SkillCatalogRoot } from "../src/lib/skills/types";
import { skillCatalogLoadState } from "../src/components/layout/skill-catalog-load-state";

const SKILL: SkillCatalogEntry = {
  id: "skill-team-review",
  slug: "team-review",
  name: "Team review",
  description: "Our checklist",
  scope: "local",
  provider: "shared",
  path: "/repo/skills/team-review/SKILL.md",
  realPath: "/repo/skills/team-review/SKILL.md",
  sourceRootPath: "/repo/skills",
  sourceRootRealPath: null,
  invocationToken: "$team-review",
  instructions: "Rank findings by blast radius.",
};
const ROOT: SkillCatalogRoot = {
  id: "root-repo",
  scope: "local",
  provider: "shared",
  source: "shared_root",
  path: "/repo/skills",
  realPath: null,
  exists: true,
};
const READ_AT = "2026-10-22T00:00:00.000Z";

type CatalogReply = { ok: boolean; message?: string; catalog: Record<string, unknown> };
const originalWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

function installCatalog(getCatalog: (args: { workspacePath?: string }) => Promise<CatalogReply>) {
  const values = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
      clear: () => values.clear(),
    },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    api: { skills: { getCatalog } },
  };
}

const found = (): CatalogReply => ({
  ok: true,
  catalog: { workspacePath: "/repo", fetchedAt: READ_AT, skills: [SKILL], roots: [ROOT], detail: "Found 1 skill." },
});
const failed = (): CatalogReply => ({
  ok: false,
  message: "EACCES: permission denied",
  catalog: { workspacePath: "/repo", fetchedAt: new Date().toISOString(), skills: [], roots: [], detail: "Skill discovery failed." },
});

describe("skill catalog reads that fail", () => {
  test("keep the skills last read for the same roots, and say the read failed", async () => {
    let reply = found;
    installCatalog(async () => reply());
    const { useAppStore } = await import("../src/store/app.store");
    await useAppStore.getState().refreshSkillCatalog({ workspacePath: "/repo" });
    expect(useAppStore.getState().skillCatalog).toMatchObject({ status: "ready", loadedAt: READ_AT, skills: [SKILL] });

    reply = failed;
    await useAppStore.getState().refreshSkillCatalog({ workspacePath: "/repo" });
    const kept = useAppStore.getState().skillCatalog;
    expect(kept).toMatchObject({ status: "error", loadedAt: READ_AT, skills: [SKILL], roots: [ROOT], detail: "EACCES: permission denied" });
    // The attempt time still spaces out retries; it is not when the lists were read.
    expect(kept.fetchedAt).not.toBe(READ_AT);
    expect(skillCatalogLoadState(kept)).toMatchObject({ status: "ready", stale: true, refreshError: "EACCES: permission denied" });

    // Another workspace's failed read has nothing of its own to show.
    await useAppStore.getState().refreshSkillCatalog({ workspacePath: "/other" });
    const other = useAppStore.getState().skillCatalog;
    expect(other).toMatchObject({ status: "error", workspacePath: "/other", loadedAt: null, skills: [], roots: [] });
    expect(skillCatalogLoadState(other)).toEqual({ status: "error", error: "EACCES: permission denied" });
  });

  test("an older read that fails late does not overwrite a newer answer", async () => {
    const pending: Array<(reply: CatalogReply) => void> = [];
    installCatalog(() => new Promise<CatalogReply>((resolve) => pending.push(resolve)));
    const { useAppStore } = await import("../src/store/app.store");
    const older = useAppStore.getState().refreshSkillCatalog({ workspacePath: "/repo" });
    const newer = useAppStore.getState().refreshSkillCatalog({ workspacePath: "/repo" });
    pending[1]!(found());
    await newer;
    pending[0]!(failed());
    await older;
    expect(useAppStore.getState().skillCatalog).toMatchObject({ status: "ready", skills: [SKILL] });
  });
});

describe("skillCatalogLoadState", () => {
  const base = {
    status: "idle" as const,
    workspacePath: "/repo",
    sharedSkillsHome: null,
    fetchedAt: null,
    skills: [],
    roots: [],
    detail: "",
  };

  test("is pending until a read answers, and shows an unread catalog as it is when nothing reads it", () => {
    expect(skillCatalogLoadState(base)).toEqual({ status: "pending" });
    expect(skillCatalogLoadState({ ...base, status: "loading" })).toEqual({ status: "pending" });
    expect(skillCatalogLoadState(base, false)).toEqual({ status: "ready", data: base });
  });
});
