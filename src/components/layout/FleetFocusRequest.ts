import { useEffect, useMemo, useRef, useState } from "react";
import { i18n } from "@/i18n";
import { toast } from "@/lib/notifications/toast";
import { useFleetTaskRows, type FleetTaskTableRepository } from "@/components/layout/FleetTaskTable";
import { getFleetAttentionTier, type FleetAttentionItem } from "@/lib/fleet/attention-projection";
import {
  FLEET_FOCUS_WORKSPACE_WAIT_MS,
  resolveFleetFocus,
  stepFleetFocus,
  type FleetFocusView,
} from "@/lib/fleet/fleet-focus";
import type { FleetBoardLayout } from "@/store/app-settings";
import { clearFleetFocus, useFleetFocusStore } from "@/store/fleet-focus-store";

const NO_REPOSITORIES: readonly FleetTaskTableRepository[] = [];
/** About half a second of frames for the row to render after the filters change. */
const SCROLL_ATTEMPTS = 30;

/** The rendered row (or its open panel) of a task, in whichever layout drew it. */
function findFleetFocusElement(taskKey: string) {
  const escaped = CSS.escape(taskKey);
  return document.querySelector<HTMLElement>(`[data-fleet-task-table-row="${escaped}"]`) ??
    document.querySelector<HTMLElement>(`[data-agent-fleet-card="${escaped}"]`) ??
    document.querySelector<HTMLElement>(`[data-task-key="${escaped}"]`) ??
    // A card's task beyond its first few rows is reached through its open panel.
    document.getElementById(`fleet-task-controls-${taskKey}`);
}

/**
 * Consumes "open Fleet on this row" requests (`openFleetAt`). Each request is
 * resolved once against the task's own rows: when the task is gone the
 * request is dropped and nothing changes; otherwise `onShow` receives the
 * board view with only what hid the row reset, the row is scrolled into view
 * and the request is cleared by its id. A workspace not on the board yet (a
 * Tars execution workspace still being loaded) is waited for, then a notice
 * says Fleet cannot show it. Only the target's workspace is read, and only
 * while a request waits.
 */
export function useFleetFocusRequest(args: {
  repositories: readonly FleetTaskTableRepository[];
  layout: FleetBoardLayout;
  nowMs: number;
  view: FleetFocusView;
  attentionItemsByWorkspaceId: Readonly<Record<string, readonly FleetAttentionItem[] | undefined>>;
  onShow: (show: { taskKey: string; view: FleetFocusView }) => void;
}) {
  const request = useFleetFocusStore((state) => state.request);
  const targetWorkspaceId = request?.workspaceId ?? null;
  const focusRepositories = useMemo(() => {
    if (!targetWorkspaceId) return NO_REPOSITORIES;
    return args.repositories.flatMap((repository) => {
      const workspaces = repository.workspaces.filter((workspace) => workspace.id === targetWorkspaceId);
      return workspaces.length > 0 ? [{ ...repository, workspaces }] : [];
    });
  }, [args.repositories, targetWorkspaceId]);
  const focus = useFleetTaskRows({ repositories: focusRepositories, filter: "all", searchQuery: "", nowMs: args.nowMs });
  const handledId = useRef<number | null>(null);
  const [scrollKey, setScrollKey] = useState<string | null>(null);
  // The request whose wait for its workspace ran out.
  const [workspaceWaitOverId, setWorkspaceWaitOverId] = useState<number | null>(null);
  const requestId = request?.id ?? null;
  useEffect(() => {
    if (requestId === null) return;
    const timer = setTimeout(() => setWorkspaceWaitOverId(requestId), FLEET_FOCUS_WORKSPACE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [requestId]);
  const { view, layout, onShow, attentionItemsByWorkspaceId } = args;
  const listSettled = focus.load.pending.length === 0;

  useEffect(() => {
    const step = stepFleetFocus({
      request,
      handledId: handledId.current,
      workspaceWaitOver: request !== null && workspaceWaitOverId === request.id,
      resolve: () => resolveFleetFocus({
        target: request!,
        layout,
        workspaceKnown: focusRepositories.length > 0,
        rows: listSettled ? focus.rows : null,
        workspaceHasBlockingAttention: (attentionItemsByWorkspaceId[request!.workspaceId] ?? [])
          .some((item) => getFleetAttentionTier(item.kind) === "blocking"),
        ownerOf: (row) => focus.ownerByKey.get(row.key),
        view,
      }),
    });
    handledId.current = step.handledId;
    if (step.show) {
      onShow(step.show);
      setScrollKey(step.show.taskKey);
    }
    if (step.notice === "workspaceNotLoaded") toast.info(i18n.t("fleet:focus.workspaceNotLoaded"));
    if (step.clearId !== null) clearFleetFocus(step.clearId);
  }, [attentionItemsByWorkspaceId, focus.ownerByKey, focus.rows, focusRepositories, layout, listSettled, onShow, request, view,
    workspaceWaitOverId]);

  useEffect(() => {
    if (!scrollKey) return;
    let attempts = 0;
    let frame = 0;
    const attempt = () => {
      const element = findFleetFocusElement(scrollKey);
      if (element || ++attempts >= SCROLL_ATTEMPTS) {
        element?.scrollIntoView({ block: "center" });
        setScrollKey(null);
        return;
      }
      frame = window.requestAnimationFrame(attempt);
    };
    frame = window.requestAnimationFrame(attempt);
    return () => window.cancelAnimationFrame(frame);
  }, [scrollKey]);
}
