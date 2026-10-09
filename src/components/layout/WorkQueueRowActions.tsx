import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { sx } from "@/components/ads/utils/stylex";
import { repositorySidebarStyles } from "@/components/layout/repository-workspace-sidebar.styles";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";
import { transition } from "@/components/ads/recipes/transition";
import {
  resolveWorkspaceSnoozeUntil,
  WORKSPACE_SNOOZE_PRESETS,
  type WorkspaceSettlementRecord,
  type WorkspaceSettlementView,
  type WorkspaceSnoozePreset,
} from "@/lib/fleet/workspace-settlement";
import { offerUndoToast } from "@/lib/notifications/pending-undo";
import { useAppStore } from "@/store/app.store";

const SNOOZE_LABEL_KEYS = {
  hour: "workspace:workQueueSettlement.snoozeHour",
  tomorrow: "workspace:workQueueSettlement.snoozeTomorrow",
  "next-week": "workspace:workQueueSettlement.snoozeNextWeek",
} as const satisfies Record<WorkspaceSnoozePreset, string>;

/**
 * A Work queue row's menu: settle, snooze, bring back, and opt the workspace
 * out of automatic settling. Every change offers an undo, so none of them asks
 * for confirmation.
 */
export function WorkQueueRowActions(props: {
  workspaceId: string;
  workspaceName: string;
  view: WorkspaceSettlementView;
}) {
  useTranslation();
  const [open, setOpen] = useState(false);
  const autoSettleDisabled = useAppStore(
    (state) => state.workspaceSettlementById[props.workspaceId]?.autoSettleDisabled === true,
  );
  const settleWorkspaces = useAppStore((state) => state.settleWorkspaces);
  const snoozeWorkspace = useAppStore((state) => state.snoozeWorkspace);
  const unsettleWorkspace = useAppStore((state) => state.unsettleWorkspace);
  const setWorkspaceAutoSettle = useAppStore((state) => state.setWorkspaceAutoSettle);
  const restoreWorkspaceSettlements = useAppStore((state) => state.restoreWorkspaceSettlements);

  // Cmd/Ctrl+Z outside a text field runs the newest of these while it shows.
  const offerUndo = (message: string, previous: WorkspaceSettlementRecord | undefined) => {
    offerUndoToast(message, {
      undoLabel: i18n.t("workspace:workQueueSettlement.undo"),
      onUndo: () =>
        restoreWorkspaceSettlements({ records: { [props.workspaceId]: previous } }),
    });
  };

  const settle = () => {
    const previous = settleWorkspaces({
      settlements: [{ workspaceId: props.workspaceId, reason: "manual" }],
    });
    offerUndo(
      i18n.t("workspace:workQueueSettlement.settled", { name: props.workspaceName }),
      previous[props.workspaceId],
    );
  };
  const snooze = (preset: WorkspaceSnoozePreset) => {
    const until = resolveWorkspaceSnoozeUntil(preset, new Date()).toISOString();
    const previous = snoozeWorkspace({ workspaceId: props.workspaceId, until });
    offerUndo(
      i18n.t("workspace:workQueueSettlement.snoozed", { name: props.workspaceName }),
      previous,
    );
  };
  const bringBack = () => {
    unsettleWorkspace({ workspaceId: props.workspaceId });
  };

  return (
    <div
      className={sx(
        repositorySidebarStyles.rowActions,
        repositorySidebarStyles.rowActionsInline,
        transition.fade,
        open ? repositorySidebarStyles.rowActionsPinned : repositorySidebarStyles.rowActionsReveal,
      )}
    >
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              xstyle={repositorySidebarStyles.rowActionsTrigger}
              data-testid={`work-queue-actions-${props.workspaceId}`}
              aria-label={i18n.t("workspace:workQueueSettlement.actions", { name: props.workspaceName })}
            />
          }
        >
          <MoreVertical className={sx(repositorySidebarStyles.rowActionsIcon)} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {props.view.state === "active" ? (
            <>
              <DropdownMenuItem onSelect={settle}>
                {i18n.t("workspace:workQueueSettlement.settle")}
              </DropdownMenuItem>
              {WORKSPACE_SNOOZE_PRESETS.map((preset) => (
                <DropdownMenuItem key={preset} onSelect={() => snooze(preset)}>
                  {i18n.t(SNOOZE_LABEL_KEYS[preset])}
                </DropdownMenuItem>
              ))}
            </>
          ) : (
            <DropdownMenuItem onSelect={bringBack}>
              {i18n.t("workspace:workQueueSettlement.bringBack")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={autoSettleDisabled}
            onCheckedChange={(checked) =>
              setWorkspaceAutoSettle({ workspaceId: props.workspaceId, enabled: !checked })
            }
          >
            {i18n.t("workspace:workQueueSettlement.neverAuto")}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
