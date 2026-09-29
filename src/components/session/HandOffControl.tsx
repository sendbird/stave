import { useEffect, useRef } from "react";
import { Target } from "lucide-react";
import {
  COMPOSER_CONTROL_BUTTON,
  ComposerControlLabel,
  composerControlAttributes,
} from "@/components/ai-elements/composer-control-density";
import { Button } from "@/components/ui";
import { useScopedTaskId } from "@/components/session/task-scope-context";
import { isActiveMissionState } from "@/lib/missions/domain";
import type { Macro } from "@/lib/macros/types";
import type { Playbook } from "@/lib/playbooks/schema";
import { useAppStore } from "@/store/app.store";
import { useTaskMission } from "@/store/missions-store";
import { usePlaybooksUiStore } from "@/store/playbooks-ui-store";

const PLAYBOOK_ENTRY_PREFIX = "playbook:";

/**
 * Playbooks with a shortcut, shaped as `!` palette entries so `!shortcut`
 * finds them next to macros. Selecting one opens the Start mission sheet.
 */
export function playbookPaletteEntries(playbooks: readonly Playbook[]): Macro[] {
  return playbooks.flatMap((playbook) =>
    playbook.shortcut
      ? [
          {
            id: `${PLAYBOOK_ENTRY_PREFIX}${playbook.id}`,
            label: playbook.name,
            slug: playbook.shortcut,
            description: `Hand off to this playbook · ${playbook.stages.length} stages`,
            body: "",
            insertMode: "replace" as const,
            createdAt: playbook.createdAt,
            updatedAt: playbook.updatedAt,
          },
        ]
      : [],
  );
}

const ASSIGN_ENTRY_ID = "agents:assign";

/**
 * `!assign` in the composer: the rest of the draft becomes the request and the
 * Assign to agent sheet opens. The agent makes its own task, so this works on
 * a new task as well as on one with history.
 */
export const ASSIGN_PALETTE_ENTRY: Macro = {
  id: ASSIGN_ENTRY_ID,
  label: "Assign to agent",
  slug: "assign",
  description: "Hand this request to a saved agent; it gets its own task",
  body: "",
  insertMode: "replace",
  createdAt: "1970-01-01T00:00:00.000Z",
  updatedAt: "1970-01-01T00:00:00.000Z",
};

export function isAssignPaletteEntry(entry: Pick<Macro, "id">): boolean {
  return entry.id === ASSIGN_ENTRY_ID;
}

/** The playbook id behind a palette entry, or null for a macro. */
export function playbookIdOfPaletteEntry(entry: Pick<Macro, "id">): string | null {
  return entry.id.startsWith(PLAYBOOK_ENTRY_PREFIX) ? entry.id.slice(PLAYBOOK_ENTRY_PREFIX.length) : null;
}

/**
 * The task a hand-off from this composer would target, or null when a mission
 * cannot start here: no task, a provider missions do not run on, or a mission
 * already running.
 */
export function useHandOffTarget(): { workspaceId: string; taskId: string } | null {
  const taskId = useScopedTaskId();
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const provider = useAppStore((state) => state.tasks.find((task) => task.id === taskId)?.provider ?? null);
  const mission = useTaskMission(workspaceId, taskId);
  if (!taskId || !workspaceId || (provider !== "claude-code" && provider !== "codex")) return null;
  if (mission && isActiveMissionState(mission.mission.state)) return null;
  return { workspaceId, taskId };
}

/**
 * Opens the Start mission sheet with the composer's text as the assignment.
 * Once the mission starts, the draft is cleared — through the composer while
 * it still shows that task, otherwise in the task's saved draft.
 */
export function useOpenHandOff(args: { clearComposer: () => void }) {
  const target = useHandOffTarget();
  const openStartSheet = usePlaybooksUiStore((state) => state.openStartSheet);
  const scopedTaskId = useScopedTaskId();
  const latest = useRef({ taskId: scopedTaskId, clearComposer: args.clearComposer, mounted: true });
  latest.current.taskId = scopedTaskId;
  latest.current.clearComposer = args.clearComposer;
  useEffect(() => {
    const current = latest.current;
    current.mounted = true;
    return () => {
      current.mounted = false;
    };
  }, []);
  if (!target) return null;
  return (options: { assignment: string; playbookId?: string }) => {
    const assignment = options.assignment.trim();
    openStartSheet({
      ...target,
      assignment,
      ...(options.playbookId ? { playbookId: options.playbookId } : {}),
      fromComposerDraft: assignment.length > 0,
      onStarted: () => {
        if (latest.current.mounted && latest.current.taskId === target.taskId) latest.current.clearComposer();
        else useAppStore.getState().updatePromptDraft({ taskId: target.taskId, patch: { text: "" } });
      },
    });
  };
}

/** "Hand off" in the composer's control row. */
export function HandOffControl(props: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={COMPOSER_CONTROL_BUTTON}
      {...composerControlAttributes}
      data-hand-off-control="true"
      disabled={props.disabled}
      aria-label="Hand off to a mission"
      title="Hand off: a mission carries this task through a playbook, stage by stage"
      onClick={props.onClick}
    >
      <Target />
      <ComposerControlLabel>Hand off</ComposerControlLabel>
    </Button>
  );
}
