import { describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  enhanceUtilityPrompt,
  readPromptEnhancementRepoGuidance,
  type UtilityInferenceRunners,
} from "../electron/providers/utility-inference";

async function withTempRepo(
  files: Record<string, string>,
  run: (cwd: string) => Promise<void>,
) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "stave-enhance-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      await fs.writeFile(path.join(cwd, name), content);
    }
    await run(cwd);
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
}

describe("readPromptEnhancementRepoGuidance", () => {
  test("is undefined without a cwd or without guidance files", async () => {
    expect(await readPromptEnhancementRepoGuidance(undefined)).toBeUndefined();
    await withTempRepo({}, async (cwd) => {
      expect(await readPromptEnhancementRepoGuidance(cwd)).toBeUndefined();
    });
  });

  test("reads AGENTS.md and CLAUDE.md when present and clips them", async () => {
    await withTempRepo(
      { "AGENTS.md": "Use Bun.", "CLAUDE.md": "x".repeat(5_000) },
      async (cwd) => {
        const guidance = (await readPromptEnhancementRepoGuidance(cwd))!;
        expect(guidance.startsWith("# AGENTS.md\nUse Bun.")).toBe(true);
        expect(guidance).toContain("# CLAUDE.md");
        expect(guidance.length).toBeLessThanOrEqual(1_500);
      },
    );
  });
});

describe("enhanceUtilityPrompt context", () => {
  test("forwards renderer context and host-read repo guidance to the runner", async () => {
    const prompts: string[] = [];
    const runners: UtilityInferenceRunners = {
      codex: async (args) => {
        prompts.push(args.prompt);
        return { ok: true, text: "Fix the restore path in src/terminal/restore.ts." };
      },
      "claude-code": async () => ({ ok: false, detail: "unused" }),
      cursor: async () => ({ ok: false, detail: "unused" }),
      kiro: async () => ({ ok: false, detail: "unused" }),
    };
    await withTempRepo({ "AGENTS.md": "Use Bun." }, async (cwd) => {
      const result = await enhanceUtilityPrompt(
        {
          cwd,
          prompt: "fix the restore path",
          activeProviderId: "codex",
          history: [
            { role: "assistant", content: "The bug is in src/terminal/restore.ts." },
          ],
          styleProfile: "Keep it short.",
        },
        runners,
        async () => ({ ready: true }),
      );
      expect(result.ok).toBe(true);
      expect(prompts).toHaveLength(1);
      expect(prompts[0]).toContain("<repo_guidance>\n# AGENTS.md\nUse Bun.");
      expect(prompts[0]).toContain("Assistant: The bug is in src/terminal/restore.ts.");
      expect(prompts[0]).toContain("<style_profile>\nKeep it short.");
    });
  });
});
