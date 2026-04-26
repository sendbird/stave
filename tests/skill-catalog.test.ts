import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildCanonicalConversationRequest } from "@/lib/providers/canonical-request";
import {
  buildClaudePromptFromConversation,
  buildCodexPromptFromConversation,
} from "@/lib/providers/provider-request-translators";
import {
  getActiveSkillTokenMatch,
  getCompatibleSkillEntries,
  replaceSkillToken,
  resolveSkillSelections,
} from "@/lib/skills/catalog";
import type { SkillCatalogEntry, SkillPromptContext } from "@/lib/skills/types";
import { discoverSkillCatalog } from "../electron/main/utils/skills";

async function writeSkill(rootPath: string, slug: string, description: string) {
  const skillDir = path.join(rootPath, slug);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${slug}\ndescription: ${description}\n---\n\n# ${slug}\n\n${description}\n`,
    "utf8",
  );
}

function createCatalogSkill(args: Partial<SkillCatalogEntry> & Pick<SkillCatalogEntry, "id" | "slug" | "scope" | "provider">): SkillCatalogEntry {
  return {
    id: args.id,
    slug: args.slug,
    name: args.name ?? args.slug,
    description: args.description ?? `${args.slug} description`,
    scope: args.scope,
    provider: args.provider,
    path: args.path ?? `/tmp/${args.slug}/SKILL.md`,
    realPath: args.realPath ?? `/tmp/${args.slug}/SKILL.md`,
    sourceRootPath: args.sourceRootPath ?? "/tmp",
    sourceRootRealPath: args.sourceRootRealPath ?? "/tmp",
    invocationToken: args.invocationToken ?? `$${args.slug}`,
    instructions: args.instructions ?? `${args.slug} instructions`,
  };
}

describe("skill discovery", () => {
  let tempHome = "";
  const originalHome = process.env.HOME;
  const originalClaudeHome = process.env.CLAUDE_HOME;
  const originalCodexHome = process.env.CODEX_HOME;
  const originalSharedSkillsHome = process.env.STAVE_SHARED_SKILLS_HOME;

  beforeEach(async () => {
    tempHome = await mkdtemp(path.join(os.tmpdir(), "stave-skills-"));
    process.env.HOME = tempHome;
    delete process.env.CLAUDE_HOME;
    delete process.env.CODEX_HOME;
    delete process.env.STAVE_SHARED_SKILLS_HOME;
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalClaudeHome === undefined) {
      delete process.env.CLAUDE_HOME;
    } else {
      process.env.CLAUDE_HOME = originalClaudeHome;
    }
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalCodexHome;
    }
    if (originalSharedSkillsHome === undefined) {
      delete process.env.STAVE_SHARED_SKILLS_HOME;
    } else {
      process.env.STAVE_SHARED_SKILLS_HOME = originalSharedSkillsHome;
    }
    if (tempHome) {
      await rm(tempHome, { recursive: true, force: true });
    }
  });

  test("discovers user and local roots from provider home overrides", async () => {
    const agentsRoot = path.join(tempHome, "shared-agent-home");
    const claudeHomeReal = path.join(agentsRoot, "claude");
    const codexHomeReal = path.join(agentsRoot, "codex");
    const claudeHome = path.join(tempHome, ".claude-link");
    const codexHome = path.join(tempHome, ".codex-link");
    const workspacePath = path.join(tempHome, "workspace");

    await mkdir(claudeHomeReal, { recursive: true });
    await mkdir(codexHomeReal, { recursive: true });
    await mkdir(workspacePath, { recursive: true });
    await symlink(claudeHomeReal, claudeHome);
    await symlink(codexHomeReal, codexHome);
    process.env.CLAUDE_HOME = claudeHome;
    process.env.CODEX_HOME = codexHome;

    await writeSkill(path.join(claudeHomeReal, "skills"), "claude-user", "claude user skill");
    await writeSkill(path.join(codexHomeReal, "skills", ".system"), "codex-system", "codex system skill");
    await writeSkill(path.join(workspacePath, "skills"), "workspace-shared", "workspace shared skill");
    await writeSkill(path.join(workspacePath, ".codex", "skills"), "workspace-codex", "workspace codex skill");

    const result = await discoverSkillCatalog({ workspacePath });

    expect(result.ok).toBeTrue();
    expect(result.catalog.skills.map((skill) => skill.slug)).toContain("claude-user");
    expect(result.catalog.skills.map((skill) => skill.slug)).toContain("codex-system");
    expect(result.catalog.skills.map((skill) => skill.slug)).toContain("workspace-shared");
    expect(result.catalog.skills.map((skill) => skill.slug)).toContain("workspace-codex");
    expect(result.catalog.roots.some((root) =>
      root.scope === "user"
      && root.provider === "claude-code"
    )).toBeTrue();
    expect(result.catalog.roots.some((root) =>
      root.scope === "local"
      && root.provider === "codex"
      && root.path === path.join(workspacePath, ".codex", "skills")
    )).toBeTrue();
  });

  test("scans the shared skills root directory directly without appending /skills", async () => {
    const sharedRoot = path.join(tempHome, "my-shared-skills");
    await writeSkill(sharedRoot, "direct-skill", "skill placed directly in shared root");

    const result = await discoverSkillCatalog({ sharedSkillsHome: sharedRoot });

    expect(result.ok).toBeTrue();
    expect(result.catalog.skills.map((skill) => skill.slug)).toContain("direct-skill");
    expect(result.catalog.roots.some((root) =>
      root.provider === "shared"
      && root.path === sharedRoot
      && root.detail === "Shared skills root configured in Settings."
    )).toBeTrue();
  });

  test("prefers the Settings shared root override over the environment root", async () => {
    const sharedRootFromEnv = path.join(tempHome, "env-shared-root");
    const sharedRootFromSettings = path.join(tempHome, "settings-shared-root");

    process.env.STAVE_SHARED_SKILLS_HOME = sharedRootFromEnv;
    await writeSkill(sharedRootFromEnv, "env-shared", "env shared skill");
    await writeSkill(sharedRootFromSettings, "settings-shared", "settings shared skill");

    const result = await discoverSkillCatalog({
      sharedSkillsHome: sharedRootFromSettings,
    });

    expect(result.ok).toBeTrue();
    expect(result.catalog.sharedSkillsHome).toBe(sharedRootFromSettings);
    expect(result.catalog.skills.map((skill) => skill.slug)).toContain("settings-shared");
    expect(result.catalog.skills.map((skill) => skill.slug)).not.toContain("env-shared");
    expect(result.catalog.roots.some((root) =>
      root.provider === "shared"
      && root.path === sharedRootFromSettings
      && root.detail === "Shared skills root configured in Settings."
    )).toBeTrue();
  });
});

describe("stave auto skill compatibility", () => {
  const allSkills: SkillCatalogEntry[] = [
    createCatalogSkill({ id: "local:claude:commit", slug: "commit", scope: "local", provider: "claude-code" }),
    createCatalogSkill({ id: "local:codex:generate", slug: "generate", scope: "local", provider: "codex" }),
    createCatalogSkill({ id: "local:shared:review", slug: "review", scope: "local", provider: "shared" }),
    createCatalogSkill({ id: "local:stave:release", slug: "release", scope: "local", provider: "stave" }),
  ];

  test("stave provider sees ALL skills regardless of declared provider", () => {
    const compatible = getCompatibleSkillEntries({ skills: allSkills, providerId: "stave" });
    expect(compatible.map((s) => s.slug).sort()).toEqual(["commit", "generate", "release", "review"]);
  });

  test("claude-code provider only sees claude-code and shared skills", () => {
    const compatible = getCompatibleSkillEntries({ skills: allSkills, providerId: "claude-code" });
    const slugs = compatible.map((s) => s.slug).sort();
    expect(slugs).toEqual(["commit", "review"]);
  });

  test("codex provider only sees codex and shared skills", () => {
    const compatible = getCompatibleSkillEntries({ skills: allSkills, providerId: "codex" });
    const slugs = compatible.map((s) => s.slug).sort();
    expect(slugs).toEqual(["generate", "review"]);
  });

  test("stave can resolve skill tokens from any provider", () => {
    const resolved = resolveSkillSelections({
      text: "$commit $generate do it",
      skills: allSkills,
      providerId: "stave",
    });
    expect(resolved.selectedSkills.map((s) => s.slug)).toEqual(["commit", "generate"]);
    expect(resolved.normalizedText).toBe("do it");
  });

  test("stave resolves skill tokens that claude-code or codex would not see", () => {
    // codex skill should NOT resolve in claude-code mode
    const claudeResolved = resolveSkillSelections({
      text: "$generate",
      skills: allSkills,
      providerId: "claude-code",
    });
    expect(claudeResolved.selectedSkills).toHaveLength(0);

    // but SHOULD resolve in stave mode
    const staveResolved = resolveSkillSelections({
      text: "$generate",
      skills: allSkills,
      providerId: "stave",
    });
    expect(staveResolved.selectedSkills).toHaveLength(1);
    expect(staveResolved.selectedSkills[0]?.slug).toBe("generate");
  });
});

describe("skill token resolution", () => {
  test("prefers local skills over broader scopes and strips resolved tokens", () => {
    const skills: SkillCatalogEntry[] = [
      createCatalogSkill({ id: "global:shared:fixer", slug: "fixer", scope: "global", provider: "shared" }),
      createCatalogSkill({ id: "user:codex:fixer", slug: "fixer", scope: "user", provider: "codex" }),
      createCatalogSkill({ id: "local:shared:fixer", slug: "fixer", scope: "local", provider: "shared" }),
      createCatalogSkill({ id: "user:codex:reviewer", slug: "reviewer", scope: "user", provider: "codex" }),
    ];

    const resolved = resolveSkillSelections({
      text: "$fixer $reviewer tighten the implementation",
      skills,
      providerId: "codex",
    });

    expect(resolved.selectedSkills.map((skill) => skill.slug)).toEqual(["fixer", "reviewer"]);
    expect(resolved.selectedSkills[0]?.scope).toBe("local");
    expect(resolved.normalizedText).toBe("tighten the implementation");
  });

  test("tracks the active $ token and replaces it with the selected slug", () => {
    const match = getActiveSkillTokenMatch({
      value: "Need $rev",
      caretIndex: "Need $rev".length,
    });

    expect(match).not.toBeNull();
    expect(match?.query).toBe("rev");
    expect(replaceSkillToken({
      value: "Need $rev",
      match: match!,
      skill: { slug: "reviewer" },
    })).toBe("Need $reviewer ");
  });
});

describe("provider skill prompt serialization", () => {
  const skillContext: SkillPromptContext = {
    id: "local:shared:reviewer",
    slug: "reviewer",
    name: "reviewer",
    description: "Review code with a strict checklist.",
    scope: "local",
    provider: "shared",
    path: "/tmp/reviewer/SKILL.md",
    invocationToken: "$reviewer",
    instructions: "Review the code for regressions and missing tests.",
  };

  test("includes full skill instructions in Claude prompts instead of native slash commands", () => {
    const conversation = buildCanonicalConversationRequest({
      providerId: "claude-code",
      history: [],
      userInput: "Inspect the patch.",
      skillContexts: [skillContext],
    });

    const prompt = buildClaudePromptFromConversation({
      conversation,
      fallbackPrompt: "Inspect the patch.",
    });

    // Skill instructions must be embedded in the prompt body so Claude Code
    // can execute them directly — Stave skills are not in Claude's native
    // skill registry, so /token prefixes caused "skill not found" errors.
    expect(prompt.includes("[Activated Skills]")).toBeTrue();
    expect(prompt.includes("Review the code for regressions and missing tests.")).toBeTrue();
    expect(prompt.startsWith("/reviewer")).toBeFalse();
  });

  test("injects selected skill instructions into Codex prompts", () => {
    const conversation = buildCanonicalConversationRequest({
      providerId: "codex",
      history: [],
      userInput: "Inspect the patch.",
      skillContexts: [skillContext],
    });

    const prompt = buildCodexPromptFromConversation({
      conversation,
      fallbackPrompt: "Inspect the patch.",
    });

    expect(prompt.includes("[Activated Skills]")).toBeTrue();
    expect(prompt.includes("Review the code for regressions and missing tests.")).toBeTrue();
  });
});
