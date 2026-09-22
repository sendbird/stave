import {
  buildDeterministicKickoffProposal,
  classifyKickoffSource,
  DEFAULT_KICKOFF_SOURCE_CONFIGS,
} from "@/lib/workspace-kickoff";
import { useState } from "react";
import { Button } from "@/components/ui";
import { KickoffDialog } from "@/components/layout/KickoffDialog";
import { useAppStore } from "@/store/app.store";

// The actual dialog, with local fixture state and no worktree/provider writes.
useAppStore.setState({
  projectPath: "/tmp/kickoff-preview",
  projectName: "Kickoff preview",
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

export function KickoffPreview() {
  const [open, setOpen] = useState(true);
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
    </>
  );
}
