import { useCallback, useRef, useState } from "react";
import { resolveCreatePrMergeState } from "@/components/layout/TopBarOpenPR.utils";
import { openWorkspaceCleanup } from "@/components/layout/workspace-cleanup-events";
import { toast } from "@/components/ui";
import { i18n } from "@/i18n";
import type {
  GitHubPrManageArgs,
  GitHubPrManageDetails,
  GitHubPrManageFailure,
  GitHubPrManageResult,
} from "@/lib/github-pr-manage";
import type { WorkspacePrStatus } from "@/lib/pr-status";
import { useAppStore } from "@/store/app.store";
import {
  pullRequestLifecycleFromState,
  pullRequestLifecycleFromStatus,
  resolvePullRequestManageItems,
  type PullRequestAutoMergeState,
} from "./pull-request-manage-items";

/** The sentence for a failed request: gh's own first line when it gave one. */
export function describePullRequestManageFailure(failure: Pick<GitHubPrManageFailure, "reason" | "detail">): string {
  switch (failure.reason) {
    case "missing-gh": return i18n.t("sourceControl:prManage.errors.missingGh");
    case "unauthenticated": return i18n.t("sourceControl:prManage.errors.unauthenticated");
    case "timeout": return i18n.t("sourceControl:prManage.errors.timeout");
    case "invalid-response": return i18n.t("sourceControl:prManage.errors.invalidResponse");
    case "invalid-target": return i18n.t("sourceControl:prManage.errors.invalidTarget");
    default: return failure.detail || i18n.t("sourceControl:prManage.errors.failed");
  }
}

/** One request over the bridge; a missing bridge or a thrown call is a failure, never an exception. */
export async function requestPullRequestManage(args: GitHubPrManageArgs): Promise<GitHubPrManageResult> {
  const prManage = window.api?.sourceControl?.prManage;
  if (!prManage) {
    return { ok: false, reason: "failed", detail: i18n.t("sourceControl:prManage.errors.bridgeUnavailable") };
  }
  try {
    return await prManage(args);
  } catch (error) {
    return { ok: false, reason: "failed", ...(error instanceof Error && error.message ? { detail: error.message } : {}) };
  }
}

/**
 * Re-reads the PR status of the workspace that asked and of any other
 * workspace showing the same pull request, through the store's refresh path.
 */
export function refreshPullRequestStatus(prUrl: string, workspaceId?: string) {
  const state = useAppStore.getState();
  const workspaceIds = new Set(workspaceId ? [workspaceId] : []);
  for (const [id, info] of Object.entries(state.workspacePrInfoById)) {
    if (info?.pr?.url === prUrl) workspaceIds.add(id);
  }
  for (const id of workspaceIds) void state.fetchWorkspacePrStatus({ workspaceId: id });
}

export interface PullRequestManageTarget {
  prUrl?: string | null;
  cwd?: string;
  /** The workspace this pull request belongs to; enables "Archive workspace…" once it merged. */
  workspaceId?: string;
  /** The status the surface already shows, used until GitHub's own answer arrives. */
  status?: WorkspacePrStatus;
  /** Runs after every write, failed or not, so the surface can re-read what it shows. */
  onChanged?: () => void;
}

export type PullRequestManageBusy = "convert_to_draft" | "auto_merge" | "close" | "reopen";

type Outcome = { result: GitHubPrManageResult; success?: string };

/**
 * State and actions behind the manage menu. Owned by the surface that stays
 * mounted (the top bar, the review detail header) so its dialogs survive the
 * menu closing. One write at a time; every write ends with a status re-read.
 */
export function usePullRequestManage(target: PullRequestManageTarget) {
  const prUrl = target.prUrl ?? "";
  const [read, setRead] = useState<{ prUrl: string; details: GitHubPrManageDetails | null; error: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<PullRequestManageBusy | null>(null);
  const [dialog, setDialog] = useState<"edit" | "close" | null>(null);
  const busyRef = useRef(false);
  const readIdRef = useRef(0);
  const targetRef = useRef(target);
  targetRef.current = target;

  const details = read?.prUrl === prUrl ? read.details : null;
  const detailsError = read?.prUrl === prUrl ? read.error : null;

  const loadDetails = useCallback(async () => {
    const url = targetRef.current.prUrl;
    if (!url) return null;
    const id = ++readIdRef.current;
    setLoading(true);
    const result = await requestPullRequestManage({ action: "details", prUrl: url, cwd: targetRef.current.cwd });
    if (readIdRef.current !== id) return null;
    setLoading(false);
    if (result.ok && result.kind === "details") {
      setRead({ prUrl: url, details: result.details, error: null });
      return result.details;
    }
    setRead({
      prUrl: url,
      details: null,
      error: describePullRequestManageFailure(result.ok ? { reason: "invalid-response" } : result),
    });
    return null;
  }, []);

  /** Status refresh after a write, wherever the write came from (menu, dialogs). */
  const afterWrite = useCallback((pinned: PullRequestManageTarget = targetRef.current) => {
    if (pinned.prUrl) refreshPullRequestStatus(pinned.prUrl, pinned.workspaceId);
    pinned.onChanged?.();
    void loadDetails();
  }, [loadDetails]);

  const write = useCallback(async (
    kind: PullRequestManageBusy,
    messages: { busy: string; success: string; failure: string },
    perform: (pinned: PullRequestManageTarget & { prUrl: string }) => Promise<Outcome>,
  ) => {
    const pinned = targetRef.current;
    // The ref answers before React re-renders, so a double click cannot start two writes.
    if (busyRef.current || !pinned.prUrl) return false;
    busyRef.current = true;
    setBusy(kind);
    const toastId = toast.loading(messages.busy);
    try {
      const { result, success } = await perform({ ...pinned, prUrl: pinned.prUrl });
      if (result.ok) {
        toast.update(toastId, { title: success ?? messages.success, tone: "success" });
        return true;
      }
      toast.update(toastId, { title: messages.failure, description: describePullRequestManageFailure(result), tone: "error" });
      return false;
    } finally {
      busyRef.current = false;
      setBusy(null);
      // The pull request may have changed either way; never leave the status stale.
      afterWrite(pinned);
    }
  }, [afterWrite]);

  const convertToDraft = useCallback(() => write("convert_to_draft", {
    busy: i18n.t("sourceControl:prManage.busy.convertToDraft"),
    success: i18n.t("sourceControl:prManage.toast.convertedToDraft"),
    failure: i18n.t("sourceControl:prManage.toast.convertToDraftFailed"),
  }, async (pinned) => ({ result: await requestPullRequestManage({ action: "draft", prUrl: pinned.prUrl, cwd: pinned.cwd }) })), [write]);

  const reopen = useCallback(() => write("reopen", {
    busy: i18n.t("sourceControl:prManage.busy.reopen"),
    success: i18n.t("sourceControl:prManage.toast.reopened"),
    failure: i18n.t("sourceControl:prManage.toast.reopenFailed"),
  }, async (pinned) => ({ result: await requestPullRequestManage({ action: "reopen", prUrl: pinned.prUrl, cwd: pinned.cwd }) })), [write]);

  const confirmClose = useCallback(async () => {
    const closed = await write("close", {
      busy: i18n.t("sourceControl:prManage.busy.close"),
      success: i18n.t("sourceControl:prManage.toast.closed"),
      failure: i18n.t("sourceControl:prManage.toast.closeFailed"),
    }, async (pinned) => ({ result: await requestPullRequestManage({ action: "close", prUrl: pinned.prUrl, cwd: pinned.cwd }) }));
    if (closed) setDialog(null);
  }, [write]);

  /** Turns auto-merge off when GitHub has it queued, on otherwise; `current` is what the menu showed. */
  const toggleAutoMerge = useCallback((current: GitHubPrManageDetails | null) => {
    if (!current) {
      toast.error(i18n.t("sourceControl:prManage.errors.detailsRequired"));
      return Promise.resolve(false);
    }
    if (current.autoMerge) {
      return write("auto_merge", {
        busy: i18n.t("sourceControl:prManage.busy.autoMergeOff"),
        success: i18n.t("sourceControl:prManage.toast.autoMergeOff"),
        failure: i18n.t("sourceControl:prManage.toast.autoMergeOffFailed"),
      }, async (pinned) => ({
        result: await requestPullRequestManage({ action: "auto-merge", prUrl: pinned.prUrl, cwd: pinned.cwd, enabled: false }),
      }));
    }
    return write("auto_merge", {
      busy: i18n.t("sourceControl:prManage.busy.autoMergeOn"),
      success: i18n.t("sourceControl:prManage.toast.autoMergeOnDefault"),
      failure: i18n.t("sourceControl:prManage.toast.autoMergeOnFailed"),
    }, async (pinned) => {
      // The same resolution the merge dialog uses: the preferred method when
      // the repository allows it, otherwise the first one it does allow.
      const settings = await window.api?.sourceControl?.getRepoMergeSettings?.({ cwd: pinned.cwd, prUrl: pinned.prUrl })
        .catch(() => undefined);
      const repoSettings = settings?.ok
        ? {
            squashMergeAllowed: settings.squashMergeAllowed === true,
            mergeCommitAllowed: settings.mergeCommitAllowed === true,
            rebaseMergeAllowed: settings.rebaseMergeAllowed === true,
            autoMergeAllowed: settings.autoMergeAllowed === true,
          }
        : undefined;
      if (repoSettings && !repoSettings.autoMergeAllowed) {
        return { result: { ok: false, reason: "failed", detail: i18n.t("sourceControl:prManage.errors.autoMergeNotAllowed") } };
      }
      const method = resolveCreatePrMergeState({
        preferredMethod: useAppStore.getState().settings.createPrMergeMethod,
        autoMergeEnabled: true,
        repoSettings,
      }).mergeMethod;
      return {
        // Pinned to the head commit the menu read, so a newer push is not queued unseen.
        result: await requestPullRequestManage({
          action: "auto-merge", prUrl: pinned.prUrl, cwd: pinned.cwd, enabled: true, method, expectedHeadOid: current.headRefOid,
        }),
        success: i18n.t("sourceControl:prManage.toast.autoMergeOn", { method }),
      };
    });
  }, [write]);

  const archiveWorkspace = useCallback(() => {
    const { workspaceId } = targetRef.current;
    if (workspaceId) openWorkspaceCleanup({ workspaceId });
  }, []);

  // A read in flight means `details` is the previous answer: fall back to the
  // status the surface shows, and never label auto-merge from a stale read.
  const fresh = loading && target.status ? null : details;
  const lifecycle = fresh
    ? pullRequestLifecycleFromState(fresh.state)
    : target.status ? pullRequestLifecycleFromStatus(target.status) : null;
  const autoMerge: PullRequestAutoMergeState = loading
    ? "checking"
    : details ? (details.autoMerge ? "on" : "off") : detailsError ? "unknown" : "checking";
  const items = resolvePullRequestManageItems({
    lifecycle,
    isDraft: fresh ? fresh.isDraft : target.status === "draft",
    autoMerge,
    hasWorkspace: Boolean(target.workspaceId),
  });

  return {
    prUrl,
    cwd: target.cwd,
    details,
    detailsError,
    loading,
    lifecycle,
    items,
    busy,
    dialog,
    setDialog,
    loadDetails,
    afterWrite,
    convertToDraft,
    toggleAutoMerge,
    confirmClose,
    reopen,
    archiveWorkspace,
  };
}

export type PullRequestManageController = ReturnType<typeof usePullRequestManage>;
