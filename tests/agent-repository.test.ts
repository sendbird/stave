import { describe, expect, test } from "bun:test";
import {
  MAX_REPOSITORY_AGENT_FILES,
  scanRepositoryAgents,
  type RepositoryDirectoryEntry,
  type RepositoryFileAccess,
} from "@/lib/agents/repository";

/** An in-memory repository: path → content. Folders are implied by the paths. */
function repository(files: Record<string, string>, unreadable: Record<string, string> = {}) {
  const reads: string[] = [];
  const writes: string[] = [];
  const all = { ...files, ...unreadable };
  const access: RepositoryFileAccess = {
    listDirectory: async (directory) => {
      const prefix = `${directory}/`;
      const entries = new Map<string, RepositoryDirectoryEntry>();
      for (const path of Object.keys(all)) {
        if (!path.startsWith(prefix)) continue;
        const [name, ...rest] = path.slice(prefix.length).split("/");
        entries.set(name!, { name: name!, path: `${prefix}${name}`, type: rest.length ? "folder" : "file" });
      }
      // Unsorted on purpose: the scan must not depend on read order.
      return entries.size ? [...entries.values()].reverse() : null;
    },
    readFile: async (path) => {
      reads.push(path);
      if (path in unreadable) return { error: unreadable[path]! };
      return path in files ? { content: files[path]! } : { error: "missing" };
    },
  };
  return { access, reads, writes };
}

const claude = (name: string, extra = "") => `---\nname: ${name}\ndescription: Use for ${name}.\n${extra}---\nDo ${name} work.\n`;

describe("repository agents", () => {
  test("reads every provider agent folder, grouped claude folders included, in a stable order", async () => {
    const repo = repository({
      ".claude/agents/ui.md": claude("ui"),
      ".claude/agents/review/security.md": claude("security", "tools: Read, Grep\n"),
      ".codex/agents/docs.toml": 'name = "docs"\ndescription = "Use for docs."\ndeveloper_instructions = "Write docs."\n',
      ".kiro/agents/ops.json": JSON.stringify({ name: "ops", description: "Use for ops.", prompt: "Run ops." }),
      ".github/agents/triage.agent.md": claude("triage"),
      ".claude/agents/notes.txt": "not an agent",
      ".github/agents/readme.md": "not an agent either",
    });
    const scan = await scanRepositoryAgents(repo.access);
    expect(scan.problems).toEqual([]);
    expect(scan.agents.map((entry) => entry.agent.origin?.path)).toEqual([
      ".claude/agents/review/security.md",
      ".claude/agents/ui.md",
      ".codex/agents/docs.toml",
      ".kiro/agents/ops.json",
      ".github/agents/triage.agent.md",
    ]);
    expect(scan.agents.every((entry) => entry.agent.source === "repository")).toBe(true);
    expect(scan.agents[0]!.agent.permission).toBe("read-only");
    // Only agent files are opened; nothing is written.
    expect(repo.reads).not.toContain(".claude/agents/notes.txt");
    expect(repo.writes).toEqual([]);
  });

  test("an unreadable file, a file without instructions and a second file with the same id are reported, not dropped", async () => {
    const repo = repository(
      {
        ".claude/agents/a.md": claude("shared"),
        ".cursor/agents/b.md": claude("shared"),
        ".claude/agents/empty.md": "---\nname: empty\ndescription: Nothing.\n---\n",
      },
      { ".claude/agents/big.md": "Not read: the file is too large." },
    );
    const scan = await scanRepositoryAgents(repo.access);
    expect(scan.agents.map((entry) => entry.agent.origin?.path)).toEqual([".claude/agents/a.md"]);
    expect(scan.problems.map((problem) => problem.path).sort()).toEqual([
      ".claude/agents/big.md",
      ".claude/agents/empty.md",
      ".cursor/agents/b.md",
    ]);
    expect(scan.problems.find((problem) => problem.path === ".cursor/agents/b.md")?.message).toContain(
      ".claude/agents/a.md",
    );
  });

  test("refused fields travel with the agent so the tab can show them", async () => {
    const repo = repository({ ".claude/agents/x.md": claude("x", "permissionMode: bypassPermissions\nhooks: {}\n") });
    const [entry] = (await scanRepositoryAgents(repo.access)).agents;
    expect(entry!.agent.permission).not.toBe("auto");
    expect(entry!.notes.filter((note) => note.outcome === "refused").map((note) => note.field).sort()).toEqual([
      "hooks",
      "permissionMode",
    ]);
  });

  test("a repository with no agent folders is empty, and too many files are reported instead of read", async () => {
    expect(await scanRepositoryAgents(repository({}).access)).toEqual({ agents: [], problems: [] });
    const many = Object.fromEntries(
      Array.from({ length: MAX_REPOSITORY_AGENT_FILES + 2 }, (_, index) => {
        const name = `agent-${String(index).padStart(3, "0")}`;
        return [`.claude/agents/${name}.md`, claude(name)];
      }),
    );
    const repo = repository(many);
    const scan = await scanRepositoryAgents(repo.access);
    expect(scan.agents.length).toBe(MAX_REPOSITORY_AGENT_FILES);
    expect(scan.problems.length).toBe(2);
    expect(repo.reads.length).toBe(MAX_REPOSITORY_AGENT_FILES);
  });
});
