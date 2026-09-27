/**
 * Proposed missions, for Issues → Proposed and Fleet's header: the missions
 * playbook start conditions and triage missions proposed, waiting for the
 * user to start or dismiss them, and the recent ones already decided.
 */
import { useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import type { ObservedPullRequest, ProposalsBridgeApi, ProposedMission } from "@/lib/missions/proposed";
import type { Playbook } from "@/lib/playbooks/schema";
import type { WorkspacePrInfo } from "@/lib/pr-status";
import { useAppStore } from "@/store/app.store";

const RECENT_LIMIT = 30;

interface ProposalsState {
  pending: ProposedMission[];
  /** Started or dismissed, most recently decided first: what auto-start did, and what was decided. */
  recent: ProposedMission[];
  loaded: boolean;
  /** Set by "N proposed" in Fleet; Issues opens on Proposed and clears it. */
  proposedTabRequested: boolean;
  /** The playbooks the host last accepted: pull request conditions are read from these, not the draft. */
  syncedPlaybooks: readonly Playbook[] | null;
  load: () => Promise<void>;
  notePlaybooksSynced: (playbooks: readonly Playbook[]) => void;
  dismiss: (id: string) => Promise<{ ok: boolean; message?: string }>;
  markStarted: (id: string, missionId?: string | null) => Promise<void>;
  requestProposedTab: () => void;
  consumeProposedTabRequest: () => boolean;
}

function proposalsApi(): ProposalsBridgeApi | null {
  return typeof window === "undefined" ? null : (window.api?.proposals ?? null);
}

export const useProposalsStore = create<ProposalsState>()((set, get) => ({
  pending: [],
  recent: [],
  loaded: false,
  proposedTabRequested: false,
  syncedPlaybooks: null,

  load: async () => {
    const api = proposalsApi();
    if (!api) return;
    const [pending, decided] = await Promise.all([
      api.list({ state: "pending" }).catch(() => null),
      api.list({ state: "decided", limit: RECENT_LIMIT }).catch(() => null),
    ]);
    if (!pending?.ok) return;
    set({ pending: pending.proposals, recent: decided?.ok ? decided.proposals : [], loaded: true });
  },

  notePlaybooksSynced: (playbooks) => set({ syncedPlaybooks: playbooks }),

  dismiss: async (id) => {
    const api = proposalsApi();
    if (!api) return { ok: false, message: "Proposed missions need the desktop app." };
    const response = await api.dismiss({ id }).catch(() => ({ ok: false, message: "The proposal could not be dismissed." }));
    if (response.ok) await get().load();
    return response;
  },

  markStarted: async (id, missionId = null) => {
    const api = proposalsApi();
    if (!api) return;
    await api.markStarted({ id, missionId }).catch(() => undefined);
    await get().load();
  },

  requestProposedTab: () => set({ proposedTabRequested: true }),
  consumeProposedTabRequest: () => {
    const requested = get().proposedTabRequested;
    if (requested) set({ proposedTabRequested: false });
    return requested;
  },
}));

/** A workspace's pull request, as a pull request start condition reads it; null without one. */
export function toObservedPullRequest(info: WorkspacePrInfo | undefined): ObservedPullRequest | null {
  const pr = info?.pr;
  if (!pr) return null;
  return {
    number: pr.number,
    url: pr.url,
    title: pr.title,
    state: pr.state,
    checks: pr.checksRollup,
    reviewDecision: pr.reviewDecision || null,
    headSha: pr.headRefOid ?? null,
  };
}

/** What changes a pull request's answer to a start condition. */
function pullRequestFingerprint(pr: ObservedPullRequest): string {
  return [pr.number, pr.state, pr.checks, pr.reviewDecision, pr.headSha].join(":");
}

/**
 * What the synced playbooks ask of pull requests, or null when none watches
 * them: a new or changed condition sends every pull request again.
 */
export function pullRequestWatchKey(playbooks: readonly Playbook[] | null): string | null {
  const watching = (playbooks ?? []).filter((playbook) => playbook.startsWhen?.pullRequest);
  if (watching.length === 0) return null;
  return JSON.stringify(
    watching.map((playbook) => [playbook.id, playbook.startsWhen!.pullRequest, Boolean(playbook.startsWhen!.autoStart)]),
  );
}

/**
 * Mounted once in `App.tsx`: loads the proposals, follows `proposals:changed`,
 * and — while a synced playbook watches pull requests — hands each workspace's
 * pull request to the host when its checks, review or head commit change, or
 * the conditions do. An observation counts as sent only once the host decided
 * it; a failed or deferred one (the workspace had another mission) goes again
 * with the next pull request status refresh.
 */
export function useProposalsSync() {
  useEffect(() => {
    const api = proposalsApi();
    const { load } = useProposalsStore.getState();
    void load();
    if (!api) return;
    return api.subscribeChanged(() => void load());
  }, []);

  const syncedPlaybooks = useProposalsStore((state) => state.syncedPlaybooks);
  const watchKey = useMemo(() => pullRequestWatchKey(syncedPlaybooks), [syncedPlaybooks]);
  const prInfoById = useAppStore((state) => state.workspacePrInfoById);
  const workspaces = useAppStore((state) => state.workspaces);
  const sent = useRef(new Map<string, string>());
  const inFlight = useRef(new Map<string, string>());

  useEffect(() => {
    const observe = proposalsApi()?.observePullRequest;
    if (!watchKey || !observe) {
      sent.current.clear();
      return;
    }
    for (const [workspaceId, info] of Object.entries(prInfoById)) {
      const pr = toObservedPullRequest(info);
      if (!pr) continue;
      const fingerprint = `${watchKey}|${pullRequestFingerprint(pr)}`;
      if (sent.current.get(workspaceId) === fingerprint || inFlight.current.get(workspaceId) === fingerprint) continue;
      inFlight.current.set(workspaceId, fingerprint);
      const workspaceName = workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? "";
      void observe({ workspaceId, workspaceName, pr })
        .then((response) => {
          if (response.ok && !response.deferred) sent.current.set(workspaceId, fingerprint);
        })
        .catch(() => undefined)
        .finally(() => {
          if (inFlight.current.get(workspaceId) === fingerprint) inFlight.current.delete(workspaceId);
        });
    }
  }, [prInfoById, watchKey, workspaces]);
}
