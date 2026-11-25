import { expect, test } from "bun:test";
import { agentOutputFiles, assignedFolder } from "../src/components/agent-progress/use-agent-resource-views";
import { buildWorkspaceScratchSubagentInstruction } from "../src/lib/workspace-scratch";
import { claudeSubagentScratchId } from "../electron/providers/claude-subagent-hooks";

test("native folder lookup matches the launch hook and the explicit Codex brief", async () => {
  expect(await assignedFolder({ agentId: "worker-a", providerId: "claude-code", type: "Explore" }))
    .toBe(claudeSubagentScratchId({ agentId: "worker-a", agentType: "Explore" }));
  expect(await assignedFolder({ providerId: "codex", prompt: buildWorkspaceScratchSubagentInstruction(".stave/scratch/agents/worker-b/") })).toBe("worker-b");
  expect(await assignedFolder({ providerId: "codex", type: "worker-b" })).toBeUndefined();
});

test("a shared directory shows assigned files and exact citations, including older outputs", () => {
  const file = (name: string) => ({ path: ".stave/scratch/" + name, sizeBytes: 16, mtimeMs: 1 });
  const own = file("agents/build/debug.log"), other = file("agents/build-next/debug.log"), cited = file("artifacts/file with spaces.md");
  const listing = { files: [own, other], olderArtifacts: [cited], totalBytes: 48, fileCount: 3, truncated: true };
  expect(agentOutputFiles(listing, "build", "See [report](<" + cited.path + ">)")).toEqual([own, cited]);
  expect(agentOutputFiles(listing, undefined, "`" + other.path + ".old`")).toEqual([]);
});
