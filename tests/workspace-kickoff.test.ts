import { describe, expect, test } from "bun:test";
import { canApplyKickoffDialogOpenChange } from "@/components/layout/KickoffDialog.utils";
import {
  DEFAULT_KICKOFF_SOURCE_CONFIGS,
  buildDeterministicKickoffProposal,
  buildKickoffResolutionPrompt,
  buildWorkspaceInformationSeed,
  classifyKickoffSource,
  normalizeKickoffSourceConfigs,
  parseKickoffProposalResponse,
} from "@/lib/workspace-kickoff";
import type { WorkspaceInformationState } from "@/lib/workspace-information";
import type { ProviderId } from "@/lib/providers/provider.types";
import { runWorkspaceKickoff } from "@/store/workspace-kickoff-actions";
import type { PromptDraftRuntimeOverrides } from "@/types/chat";

describe("workspace kickoff", () => {
  test("keeps the dialog open while kickoff work is in progress", () => {
    expect(
      canApplyKickoffDialogOpenChange({ open: false, busy: true }),
    ).toBe(false);
    expect(
      canApplyKickoffDialogOpenChange({ open: false, busy: false }),
    ).toBe(true);
    expect(
      canApplyKickoffDialogOpenChange({ open: true, busy: true }),
    ).toBe(true);
  });

  test("classifies Confluence before Jira on a shared host", () => {
    const classification = classifyKickoffSource({
      input: "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Kickoff",
      configs: DEFAULT_KICKOFF_SOURCE_CONFIGS,
    });

    expect(classification.kind).toBe("configured");
    expect(classification.config?.id).toBe("confluence");
    expect(classification.extractedReference).toEqual({
      host: "example.atlassian.net",
      spaceKey: "ENG",
      title: "Kickoff",
    });
  });

  test("uses key patterns for non-URL input", () => {
    const classification = classifyKickoffSource({
      input: "Please implement STAVE-123",
      configs: DEFAULT_KICKOFF_SOURCE_CONFIGS,
    });
    expect(classification.config?.id).toBe("jira");
  });

  test("keeps key patterns case-sensitive for free-form text", () => {
    const classification = classifyKickoffSource({
      input: "refactor the chart-2024 dashboard helpers",
      configs: DEFAULT_KICKOFF_SOURCE_CONFIGS,
    });
    expect(classification.kind).toBe("freeform");
    expect(classification.config).toBeNull();
  });

  test("matches URL path patterns case-insensitively", () => {
    const classification = classifyKickoffSource({
      input: "https://example.atlassian.net/WIKI/spaces/ENG/pages/123/Kickoff",
      configs: DEFAULT_KICKOFF_SOURCE_CONFIGS,
    });
    expect(classification.config?.id).toBe("confluence");
  });

  test("skips disabled configs and invalid regexes without throwing", () => {
    const configs = normalizeKickoffSourceConfigs([
      {
        ...DEFAULT_KICKOFF_SOURCE_CONFIGS[0],
        enabled: false,
      },
      {
        ...DEFAULT_KICKOFF_SOURCE_CONFIGS[1],
        id: "broken",
        label: "Broken",
        match: {
          hostSuffixes: ["example.com"],
          pathPattern: "[",
          keyPattern: "[",
        },
      },
    ]);

    expect(
      classifyKickoffSource({
        input: "https://example.com/anything",
        configs,
      }).kind,
    ).toBe("freeform");
  });

  test("builds a resolution prompt with project guidance", () => {
    const classification = classifyKickoffSource({
      input: "STAVE-123",
      configs: DEFAULT_KICKOFF_SOURCE_CONFIGS,
    });
    const prompt = buildKickoffResolutionPrompt({
      instructionPrompt: "Return JSON.",
      classification,
      branchNamingRule: "Use feature/<ticket>.",
      projectBasePrompt: "Follow AGENTS.md.",
    });

    expect(prompt).toContain("Source type: Jira");
    expect(prompt).toContain("Use feature/<ticket>.");
    expect(prompt).toContain("Follow AGENTS.md.");
  });

  test("parses fenced JSON, sanitizes branches, and drops unknown targets", () => {
    const classification = classifyKickoffSource({
      input: "STAVE-123",
      configs: DEFAULT_KICKOFF_SOURCE_CONFIGS,
    });
    const proposal = parseKickoffProposalResponse({
      value: `\`\`\`json
        {
          "branchName": "feat/Kickoff spaces!",
          "workspaceLabel": "Kickoff",
          "sourceSummary": "STAVE-123 kickoff",
          "firstTaskTitle": "Implement kickoff",
          "firstTaskPrompt": "Read STAVE-123 and implement it.",
          "panelEntries": [
            {"target":"jiraIssues","title":"Kickoff","url":"https://example.atlassian.net/browse/STAVE-123","reference":"STAVE-123","note":""},
            {"target":"unknown","title":"Ignore"}
          ],
          "notes": "Source confirmed",
          "todos": ["Implement", "Test"]
        }
      \`\`\``,
      classification,
      model: "gpt-test",
    });

    expect(proposal?.branchName).toBe("feat/Kickoff-spaces");
    expect(proposal?.panelEntries).toHaveLength(1);
    expect(proposal?.todos).toEqual(["Implement", "Test"]);
  });

  test("builds a deterministic fallback and workspace information seed", () => {
    const classification = classifyKickoffSource({
      input: "https://example.atlassian.net/browse/STAVE-123",
      configs: DEFAULT_KICKOFF_SOURCE_CONFIGS,
    });
    const proposal = buildDeterministicKickoffProposal({ classification });
    proposal.todos = ["Inspect acceptance criteria"];
    const information = buildWorkspaceInformationSeed(proposal);

    expect(proposal.degraded).toBe(true);
    expect(proposal.branchName).toBe("feat/stave-123");
    expect(information.jiraIssues[0]).toMatchObject({
      issueKey: "STAVE-123",
      url: "https://example.atlassian.net/browse/STAVE-123",
    });
    expect(information.todos[0]?.text).toBe("Inspect acceptance criteria");
  });

  test("maps deterministic source metadata to target-specific fields", () => {
    const confluence = buildDeterministicKickoffProposal({
      classification: classifyKickoffSource({
        input:
          "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Kickoff",
        configs: DEFAULT_KICKOFF_SOURCE_CONFIGS,
      }),
    });
    const figma = buildDeterministicKickoffProposal({
      classification: classifyKickoffSource({
        input:
          "https://www.figma.com/design/abc123/Workspace-Kickoff?node-id=12-34",
        configs: DEFAULT_KICKOFF_SOURCE_CONFIGS,
      }),
    });

    expect(
      buildWorkspaceInformationSeed(confluence).confluencePages[0],
    ).toMatchObject({
      title: "Kickoff",
      spaceKey: "ENG",
    });
    expect(
      buildWorkspaceInformationSeed(figma).figmaResources[0],
    ).toMatchObject({
      title: "Workspace Kickoff",
      nodeId: "12-34",
    });
  });

  test("keeps source configs valid while their label is cleared", () => {
    const configs = normalizeKickoffSourceConfigs([
      { ...DEFAULT_KICKOFF_SOURCE_CONFIGS[0], label: "" },
    ]);

    expect(configs).toHaveLength(1);
    expect(configs[0]?.label).toBe("confluence");
  });

  test("creates a seeded workspace and starts its first task", async () => {
    const classification = classifyKickoffSource({
      input: "https://example.atlassian.net/browse/STAVE-123",
      configs: DEFAULT_KICKOFF_SOURCE_CONFIGS,
    });
    const proposal = buildDeterministicKickoffProposal({ classification });
    let createdInformation: WorkspaceInformationState | undefined;
    let selectedTaskProvider: ProviderId | undefined;
    let sentPrompt = "";
    let sentProvider: ProviderId | undefined;
    let sentRuntimeOverrides: PromptDraftRuntimeOverrides | undefined;
    const state = {
      activeTaskId: "task-1" as string | null,
      createWorkspace: async (args: {
        name: string;
        label?: string;
        mode: "branch";
        fromBranch?: string;
        fromBranchKind?: "local" | "remote";
        initialTaskTitle?: string;
        workspaceInformation?: WorkspaceInformationState;
      }) => {
        createdInformation = args.workspaceInformation;
        return { ok: true };
      },
      setTaskProvider: (args: { taskId: string; provider: ProviderId }) => {
        selectedTaskProvider = args.provider;
      },
      updatePromptDraft: () => undefined,
      sendUserMessage: async (args: {
        taskId: string;
        content: string;
        providerOverride?: ProviderId;
        runtimeOverrides?: PromptDraftRuntimeOverrides;
      }) => {
        sentPrompt = args.content;
        sentProvider = args.providerOverride;
        sentRuntimeOverrides = args.runtimeOverrides;
        return { status: "sent" };
      },
    };

    const result = await runWorkspaceKickoff({
      input: {
        proposal,
        startFirstTask: true,
        firstTaskProvider: "codex",
        firstTaskRuntimeOverrides: {
          autoRouting: false,
          model: "gpt-5.6-sol",
          codexReasoningEffort: "max",
        },
        extraInstructions: "Preserve backward compatibility.",
      },
      getState: () => state,
    });

    expect(result.ok).toBe(true);
    expect(createdInformation?.jiraIssues[0]?.issueKey).toBe("STAVE-123");
    expect(selectedTaskProvider).toBe("codex");
    expect(sentPrompt).toContain("Additional instructions:");
    expect(sentPrompt).toContain("Preserve backward compatibility.");
    expect(sentProvider).toBe("codex");
    expect(sentRuntimeOverrides).toEqual({
      autoRouting: false,
      model: "gpt-5.6-sol",
      codexReasoningEffort: "max",
    });
  });

  test("keeps the selected model and effort with a first task draft", async () => {
    const proposal = buildDeterministicKickoffProposal({
      classification: classifyKickoffSource({
        input: "Draft a migration plan",
        configs: DEFAULT_KICKOFF_SOURCE_CONFIGS,
      }),
    });
    let promptDraftPatch:
      | { text: string; runtimeOverrides?: PromptDraftRuntimeOverrides }
      | undefined;
    let sendCount = 0;
    const state = {
      activeTaskId: "task-1" as string | null,
      createWorkspace: async () => ({ ok: true }),
      setTaskProvider: () => undefined,
      updatePromptDraft: (args: {
        taskId: string;
        patch: {
          text: string;
          runtimeOverrides?: PromptDraftRuntimeOverrides;
        };
      }) => {
        promptDraftPatch = args.patch;
      },
      sendUserMessage: async () => {
        sendCount += 1;
        return { status: "sent" };
      },
    };

    const result = await runWorkspaceKickoff({
      input: {
        proposal,
        startFirstTask: false,
        firstTaskProvider: "claude-code",
        firstTaskRuntimeOverrides: {
          autoRouting: false,
          model: "claude-opus-4-8",
          claudeEffort: "xhigh",
        },
      },
      getState: () => state,
    });

    expect(result.ok).toBe(true);
    expect(sendCount).toBe(0);
    expect(promptDraftPatch?.text).toBe(proposal.firstTaskPrompt);
    expect(promptDraftPatch?.runtimeOverrides).toEqual({
      autoRouting: false,
      model: "claude-opus-4-8",
      claudeEffort: "xhigh",
    });
  });
});
