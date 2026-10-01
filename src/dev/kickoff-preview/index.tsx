import {
  buildDeterministicKickoffProposal,
  classifyKickoffSource,
  DEFAULT_KICKOFF_SOURCE_CONFIGS,
} from "@/lib/workspace-kickoff";
import { useEffect, useState } from "react";
import { Button, Toaster } from "@/components/ui";
import { KickoffDialog } from "@/components/layout/KickoffDialog";
import { duplicateAgent } from "@/lib/agents/library";
import { getBuiltinAgent } from "@/lib/agents/starters";
import type { AgentAssignment } from "@/lib/agents/assign";
import { useAgentsUiStore } from "@/store/agents-ui-store";
import { useAppStore } from "@/store/app.store";

// `?stavePreview=kickoff` renders the real dialog with local fixture state and
// no worktree or provider writes. `&agent=1` preselects a saved agent as the
// worker (Who = Agent) in both phases, for screenshots, with the agents bridge
// stubbed so no IPC is made. `&auto=1` turns Stave Auto on, so the first task
// offers Auto and an Auto-routing agent routes each turn.
const params = new URLSearchParams(window.location.search);
const PREVIEW_AGENT = {
  ...duplicateAgent(getBuiltinAgent("implementer")!, []),
  id: "ui-maintainer",
  name: "UI maintainer",
  description: "Use for small UI fixes that keep the design tokens and keyboard order.",
};

const PREVIEW_ASSIGNMENT = {
  id: "assignment-preview-1",
  requestId: "kickoff:preview-1",
  agentConfigId: "ui-maintainer",
  agentName: "UI maintainer",
  agent: PREVIEW_AGENT,
  assignment: "Tighten the spacing of the settings sidebar.",
  providerId: "claude-code",
  model: null,
  repositoryPath: "/tmp/kickoff-preview",
  workspaceMode: "new-worktree",
  workspaceId: "preview-workspace",
  taskId: "preview-task",
  branch: "agent/ui-maintainer-spacing",
  state: "started",
  detail: null,
  createdAt: "2026-09-28T09:00:00.000Z",
  updatedAt: "2026-09-28T09:01:00.000Z",
} as unknown as AgentAssignment;

const withAgent = params.get("agent") === "1";

useAppStore.setState({
  repositoryPath: "/tmp/kickoff-preview",
  repositoryName: "Kickoff preview",
  defaultBranch: "main",
  draftProvider: "cursor",
  providerAvailability: {
    "claude-code": true,
    codex: true,
    cursor: true,
    kiro: false,
  },
  resolveKickoffProposal: async ({ input }) => ({
    ok: true,
    proposal: buildDeterministicKickoffProposal({
      classification: classifyKickoffSource({
        input,
        configs: DEFAULT_KICKOFF_SOURCE_CONFIGS,
      }),
    }),
  }),
  cancelKickoffResolution: () => {},
  kickoffWorkspace: async () => ({
    ok: true,
    noticeLevel: "warning",
    message: "Preview only. No workspace was created.",
  }),
});
if (withAgent) {
  useAppStore.getState().updateSettings({ patch: { customAgents: [PREVIEW_AGENT] } });
}
if (params.get("auto") === "1") {
  useAppStore.getState().updateSettings({ patch: { autoRoutingEnabled: true } });
}

function installBridgeStub() {
  const api = ((window as { api?: Record<string, unknown> }).api ??= {});
  api.agents = {
    recordTask: async () => ({ ok: true, value: PREVIEW_ASSIGNMENT }),
    releaseTask: async () => ({ ok: true, value: null }),
    listAssignments: async () => ({ ok: true, value: [] }),
    subscribeChanged: () => () => {},
  };
}

export function KickoffPreview() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    installBridgeStub();
    if (withAgent) {
      // Preselect the agent (Who = Agent) in both phases for the screenshot.
      useAgentsUiStore.getState().openKickoffWithAgent({
        agentConfigId: "ui-maintainer",
        text: "Tighten the spacing of the settings sidebar. Keep the keyboard order.",
        source: "WEB-418",
      });
      setOpen(true);
    }
  }, []);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open kickoff</Button>
      <Button
        onClick={() =>
          useAppStore.getState().updateSettings({
            patch: { themeMode: "light", customThemeId: null },
          })
        }
      >
        Light
      </Button>
      <Button
        onClick={() =>
          useAppStore.getState().updateSettings({
            patch: { themeMode: "dark", customThemeId: null },
          })
        }
      >
        Dark
      </Button>
      <KickoffDialog open={open} onOpenChange={setOpen} />
      <Toaster />
    </>
  );
}
