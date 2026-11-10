import { useLayoutEffect, useState } from "react";
import { applyAppLocale } from "@/i18n";
import { TarsView } from "@/components/tars/TarsView";
import { tarsSnapshotForWindow, type TarsBridgeApi, type TarsSnapshot } from "@/lib/tars/types";
import { buildTarsBrief } from "@/lib/tars/brief";
import { useAppStore } from "@/store/app.store";
import { normalizeConversationWidth } from "@/store/app-settings";
import { applyThemeClass } from "@/lib/themes/apply";
import { isTarsAnswerRetryable, tarsMessageView, type TarsActInput, type TarsAnswerResult, type TarsConversation, type TarsDecision, type TarsDecisionAnswer, type TarsMessage,
  type TarsReprioritizeInput } from "@/lib/tars/conversation";
import { planTarsQueueMove, tarsQueueOf } from "@/lib/tars/queue-order";
import { isTarsWorkProposal, parseTarsDecisionId, tarsAnswerActRequestId, tarsUnverifiedDecisionId } from "@/lib/tars/decisions";
import { matchTarsNeverRules, tarsActionDisposition, tarsActionKey } from "@/lib/tars/autonomy";
import { collectFleetTarsAttentionItems, type FleetAttentionItem, type FleetAttentionKind } from "@/lib/fleet/attention-projection";
import { collectTarsAttention } from "@/lib/tars/attention";
import { EMPTY_FLEET_ATTENTION, useFleetAttentionStore } from "@/store/fleet-attention-store";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import { useFleetFocusStore } from "@/store/fleet-focus-store";
import { publishTarsSnapshot } from "@/store/tars-snapshot-store";
import { buildTarsTrayFixtures } from "./tars-fixtures";
import { buildTarsBriefFixtures } from "./tars-brief-fixtures";
import { TARS_LAST_VISIBLE_KEY } from "@/components/tars/use-tars-away";
import { buildTarsSideViewFixtures } from "./tars-side-fixtures";
import { buildTarsFollowUpFixtures } from "./tars-follow-up-fixtures";
import { buildTarsPublishFixtures, createPreviewPublishBridge } from "./tars-publish-fixtures";
import { TARS_PREVIEW_RICH_REPLY } from "./tars-rich-reply-fixture";
import { TRANSCRIPT_OVERFLOW_REPLY } from "@/dev/fixtures/transcript-overflow-fixture";
import { buildTarsGalleryFixtures } from "./tars-gallery-fixtures";
import type { TarsComposerDraft } from "@/lib/tars/composer-draft";
import { createPreviewClearBridge } from "./tars-clear-fixtures";
import { buildTarsInsightsFixtures } from "./tars-insights-fixtures";
import { buildTarsStartRepositoryFixtures } from "./tars-start-fixtures";
import { TARS_IDENTITY_UNSAVED_AT } from "@/lib/tars/default-instructions";
import { buildTarsAwayFixtures, createPreviewAwayBridge, syncTarsAwayPreview, TARS_AWAY_PREVIEW_GAP_MS } from "./tars-away-fixtures";
import { createPreviewScheduleBridge } from "./tars-schedule-fixtures";

/** UI-only fixture: session storage simulates reload, never real provider or host execution. */
export function TarsPreview() {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    applyAppLocale(params.get("lang") === "ko" ? "ko" : "en");
    applyThemeClass({ enabled: params.get("theme") === "dark" });
    document.documentElement.dataset.uiDensity = params.get("density") === "compact" ? "compact" : "regular";
    // `messageFontSize=20`: the chat font size setting the conversation's text follows (default 16).
    if (params.has("messageFontSize")) useAppStore.setState((state) => ({ settings: { ...state.settings, messageFontSize: Number(params.get("messageFontSize")) || 16 } }));
    // `conversationWidth=narrow|wide`: the conversation width setting the column and composer follow (default `default`).
    if (params.has("conversationWidth")) useAppStore.setState((state) => ({ settings: { ...state.settings, conversationWidth: normalizeConversationWidth(params.get("conversationWidth")) } }));
    const now = "2026-11-05T00:00:00.000Z";
    // `gallery=true`: every conversation case on one screen for design review (`tars-gallery-fixtures.ts`). Its cards need real work
    // to point at, so it always brings the tray and side-view work; the switches built on them (`live`, `queue`, `recap`...) still apply.
    const galleryMode = params.get("gallery") === "true";
    // `tray=true`: work in every tray lane, Fleet rows and agent runs for it, and a delegated flow in the conversation.
    const fixtures = params.get("tray") === "true" || galleryMode ? buildTarsTrayFixtures(new Date(now)) : null;
    // The run monitor's clock is live: the running stage started a few minutes before this page opened, not on the fixed fixture day.
    if (fixtures) for (const run of Object.values(fixtures.runs)) for (const stage of run.stages) {
      if (stage.status === "running" && !stage.endedAt) stage.startedAt = new Date(Date.now() - 4 * 60_000).toISOString();
    }
    // `live=true`: the running fix's turn streams a test command right now and its run recorded recent progress, fed through the
    // same store slice the host fills (`providerTurnActivityByTask`). `live=stale`: the same run, with nothing observed for nine minutes.
    const liveMode = params.get("live");
    if (fixtures && (liveMode === "true" || liveMode === "stale")) {
      const billingRun = fixtures.runs["run-billing"]!;
      const quiet = liveMode === "stale" ? 9 : 0;
      const ago = (minutes: number) => new Date(Date.now() - (quiet + minutes) * 60_000).toISOString();
      const event = (sequence: number, kind: typeof billingRun.events[number]["kind"], detail: Record<string, unknown>, minutes: number) =>
        ({ id: `preview-event-${sequence}`, agentRunId: billingRun.agentRun.id, sequence, kind, idempotencyKey: null, detail, createdAt: ago(minutes) });
      billingRun.events = [
        event(1, "agent-run-started", {}, 12), event(2, "turn-started", { stageId: "reproduce", attempt: 1 }, 11),
        event(3, "report", { stageId: "reproduce", attempt: 1, outcome: "complete" }, 9), event(4, "stage-completed", { stageId: "reproduce", attempt: 1 }, 9),
        event(5, "turn-started", { stageId: "cause", attempt: 1 }, 8), event(6, "stage-retried", { stageId: "cause", attempt: 2 }, 6),
        event(7, "turn-started", { stageId: "cause", attempt: 2 }, 5),
      ];
      billingRun.agentRun = { ...billingRun.agentRun, updatedAt: ago(5) };
      for (const stage of billingRun.stages) if (stage.status === "running" && !stage.endedAt) stage.startedAt = ago(6);
      if (liveMode === "true") {
        const nowMs = Date.now();
        useAppStore.setState({ providerTurnActivityByTask: { ...useAppStore.getState().providerTurnActivityByTask, "task-billing": {
          turnId: "preview-turn", providerId: "codex", startedAt: nowMs - 5 * 60_000, lastEventAt: nowMs - 3_000, stalledAt: null, pendingInteraction: null,
          orderedWorkItemIds: ["preview-tool"], workItemsById: { "preview-tool": { id: "preview-tool", kind: "tool", status: "running", title: "Run command",
            toolName: "Bash", detail: "bun test tests/billing-export.test.ts", progressMessages: [], startedAt: nowMs - 3_000, updatedAt: nowMs - 3_000 } },
          workGraph: { nodes: {}, rootIds: [] } as never,
        } } });
      }
    }
    // `recap=true`: the view was last visible an hour before the fixtures changed, and one more piece of work ended unfinished.
    if (fixtures && params.get("recap") === "true") {
      window.localStorage.setItem(TARS_LAST_VISIBLE_KEY, new Date(Date.parse(now) - 60 * 60_000).toISOString());
      fixtures.responsibilities.push({ ...fixtures.responsibilities[3]!, id: "export-queue", requestId: "request-export-queue", title: "Migrate the export queue to the new worker",
        state: "cancelled", detail: "The worker image was not available.", taskId: null, agentRunId: null, executionWorkspaceId: null });
    }
    // `queued=true`: one more piece of work waits at an explicitly configured admission limit.
    if (fixtures && params.get("queued") === "true") fixtures.responsibilities.push({ ...fixtures.responsibilities[1]!, id: "search-index", requestId: "request-search-index",
      title: "Speed up the search index rebuild", state: "queued", queueWait: { code: "capacity", active: 1, limit: 1 }, priority: 40, branchName: undefined, taskId: null, agentRunId: null, executionWorkspaceId: null });
    // `queue=true`: three more pieces of work wait in the queue, so Do first, Do later and dragging have something to reorder.
    if (fixtures && params.get("queue") === "true") {
      const queued = (id: string, title: string, priority: number, minutes: number) => ({ ...fixtures.responsibilities[1]!, id, requestId: `request-${id}`, title,
        state: "queued" as const, priority, branchName: undefined, agentId: null, taskId: null, agentRunId: null, executionWorkspaceId: null,
        createdAt: new Date(Date.parse(now) + minutes * 60_000).toISOString(), updatedAt: new Date(Date.parse(now) + minutes * 60_000).toISOString() });
      fixtures.responsibilities.push(queued("queue-auth", "Rotate the staging auth keys", 60, 2), queued("queue-search", "Add retries to the webhook sender", 50, 3),
        queued("queue-docs", "Refresh the API reference examples with the new pagination parameters", 50, 4));
      // What each was handed, for the request view: the host keeps these texts out of the window's snapshot.
      const briefs = buildTarsBriefFixtures(new Date(now), params.get("lang") === "ko");
      for (const row of fixtures.responsibilities) if (briefs[row.id]) Object.assign(row, briefs[row.id]);
    }
    // `workingChanges=true`: the running fix started from the user's working changes; queued work asked for them but there were none.
    if (fixtures && params.get("workingChanges") === "true") for (const row of fixtures.responsibilities) {
      if (row.id === "billing") row.workingChanges = { kind: "snapshot", commit: "3fa9c1d2e4b5a6978877665544332211aabbccdd", ref: "refs/stave/tars/message-delegate/0f1e2d3c4b5a6978" };
      if (row.id === "search-index") row.workingChanges = { kind: "clean" };
    }
    // `outputs=true`: ended work with a frozen report, a review, changes and a link, plus work blocked on unmet criteria (the side view).
    // `publish=true|failed` builds on the same ended work: the completed checkout work is what Tars publishes.
    const publishMode = params.get("publish");
    const side = params.get("outputs") === "true" || publishMode === "true" || publishMode === "failed" || galleryMode ? buildTarsSideViewFixtures(new Date(now)) : null;
    // `followUp=true`: blocked work Tars followed up by itself, waiting work with its next check, and one change past the turn limit.
    const followUp = params.get("followUp") === "true" ? buildTarsFollowUpFixtures(new Date(now), params.get("lang") === "ko") : null;
    // `days=true`: the gallery's cases spread over the last week up to now, so the transcript's day rules show.
    const spread = galleryMode && params.get("days") === "true";
    const gallery = galleryMode && fixtures && side ? buildTarsGalleryFixtures({ start: new Date(now), korean: params.get("lang") === "ko", tray: fixtures, side,
      ...(spread ? { spreadUntil: new Date() } : {}) }) : null;
    // The gallery keeps its own saved state per language (and per spread), so another preview's or language's conversation never replaces it.
    const galleryKey = `stave-preview-gallery-${params.get("lang") === "ko" ? "ko" : "en"}${spread ? "-days" : ""}`;
    const identityKey = gallery ? `${galleryKey}-identity` : "stave-preview-identity";
    // `newProfile=true`: Tars was never used here (identity never saved, conversation never configured), so it starts with the default standing instructions.
    let snapshot: TarsSnapshot = JSON.parse(sessionStorage.getItem(identityKey) ?? "null") ?? {
      runtime: "desktop", identity: { id: "personal", name: "Tars", instructions: "", updatedAt: params.get("newProfile") === "true" ? TARS_IDENTITY_UNSAVED_AT : now }, pendingDecisions: gallery?.pendingDecisions ?? fixtures?.pendingDecisions ?? [],
      followUps: gallery?.followUps ?? followUp?.followUps ?? [],
      responsibilities: gallery?.responsibilities ?? followUp?.responsibilities ?? side?.responsibilities ?? fixtures?.responsibilities ?? [{ id: "preview-responsibility", requestId: "preview-request", title: "Verify the release candidate across two repositories", instruction: "Inspect the actual result.", acceptanceCriteria: ["The required checks pass on the reviewed revision."], repositoryPath: "/tmp/preview", workspaceId: "preview-workspace", executionWorkspaceId: null, providerId: "codex", model: null, agentId: null, priority: 50, maxTurns: 30, revision: 1, state: "running", detail: "Waiting for the independent review result.", taskId: null, agentRunId: null, reverifyAfter: null, createdAt: now, updatedAt: now }],
    };
    // `endedDaysAgo=N`: ended work last changed N days before the fixtures' clock, so retention has something old enough to hide.
    if (params.has("endedDaysAgo") && !sessionStorage.getItem(identityKey)) {
      const ended = new Date(Date.parse(now) - Number(params.get("endedDaysAgo")) * 86_400_000).toISOString();
      snapshot = { ...snapshot, responsibilities: snapshot.responsibilities.map((row) => row.state === "completed" || row.state === "cancelled" ? { ...row, updatedAt: ended } : row) };
    }
    // `start=true`: completed work ended just now by the real clock (the view counts "finished today" from it), so the start screen has some.
    if (params.get("start") === "true" && !sessionStorage.getItem(identityKey)) {
      const ended = new Date().toISOString();
      snapshot = { ...snapshot, responsibilities: snapshot.responsibilities.map((row) => row.state === "completed" ? { ...row, updatedAt: ended } : row) };
    }
    // `decision=unverified`: the run reported success Stave could not verify, so Stave's own decision waits.
    if (params.get("decision") === "unverified" && !sessionStorage.getItem(identityKey)) {
      snapshot = { ...snapshot, responsibilities: snapshot.responsibilities.map((row) => row.id !== "preview-responsibility" ? row
        : { ...row, state: "blocked", detail: "Completion was reported without a Stave-verified check.", detailCode: "unverifiedCompletion", taskId: "preview-task" }),
      pendingDecisions: [...(snapshot.pendingDecisions ?? []), { kind: "unverifiedCompletion", responsibilityId: "preview-responsibility", messageId: null,
        actionIndex: null, operation: null, expectedRevision: 1, proposedAt: now, optionCount: 3 }] };
    }
    // `away=true`: the user left 45 minutes ago and work went on, so opening the page is coming back: the "while you were away"
    // summary sits where they left. `away=live`: the user is here now and the same changes arrive as the clock moves (the e2e moves it).
    const awayMode = params.get("away");
    const away = awayMode === "true" || awayMode === "live" ? (() => {
      const anchor = Number(sessionStorage.getItem("stave-preview-away-anchor")) || Date.now() - (awayMode === "true" ? TARS_AWAY_PREVIEW_GAP_MS : 0);
      sessionStorage.setItem("stave-preview-away-anchor", String(anchor));
      return { fixtures: buildTarsAwayFixtures(new Date(anchor), params.get("lang") === "ko"),
        bridge: createPreviewAwayBridge("stave-preview-away-state", awayMode === "true" ? { lastSeenAt: new Date(anchor).toISOString(), summary: null } : undefined) };
    })() : null;
    /** The clock new preview records are dated from: the fixed fixture day, or the real one when the away fixtures follow it. */
    const clockBase = () => away ? Date.now() : Date.parse(now);
    // `insights=true`: saved standing instructions, repositories with memories and a branch rule, and turns for the usage view (`tars-insights-fixtures.ts`).
    const insights = params.get("insights") === "true" ? buildTarsInsightsFixtures({ now: new Date(), korean: params.get("lang") === "ko", responsibilities: snapshot.responsibilities }) : null;
    if (insights && !sessionStorage.getItem(identityKey)) snapshot = { ...snapshot, identity: { ...snapshot.identity, instructions: insights.instructions } };
    let sendFailed = false;
    const conversationKey = gallery ? `${galleryKey}-conversation` : "stave-preview-conversation";
    const draftKey = "stave-preview-draft";
    // The preview's host record keeps full attachment snapshots, as the desktop host does; a window reads summaries (`tarsMessageView`).
    type PreviewConversation = Omit<TarsConversation, "messages"> & { messages: TarsMessage[] };
    const conversation: PreviewConversation = JSON.parse(sessionStorage.getItem(conversationKey) ?? "null") ?? (
      // `start=true` keeps the conversation empty whatever work the tray holds, so the start screen shows beside it.
      params.get("start") === "true" ? { settings: null, messages: [], receipts: [], activity: [], records: [] } : gallery ? structuredClone(gallery.conversation) : followUp
      ? { settings: null, messages: [followUp.message], receipts: [], activity: [], records: [], events: followUp.events }
      : side
      ? { settings: null, messages: side.messages, receipts: side.receipts, activity: side.activity, records: [] }
      : fixtures ? { settings: null, messages: [fixtures.message], receipts: [fixtures.receipt], activity: fixtures.activity, records: [] }
        : { settings: null, messages: [], receipts: [], activity: [], records: [] });
    // Fleet's projection is not mounted here: publish its rows as the producer would. Tars rows come from the snapshot
    // through Fleet's own projection, so the tray's "needs you" follows every decision kind; other fixture rows are copied.
    const publishAttention = () => useFleetAttentionStore.setState({ snapshot: { ...EMPTY_FLEET_ATTENTION, queueStatus: "next",
      items: [...(fixtures?.attentionItems ?? []).filter((item) => !item.kind.startsWith("tars-")).map((item): FleetAttentionItem => ({
        id: item.id, kind: item.kind as string as FleetAttentionKind, priority: 0, repositoryPath: "/tmp/preview", repositoryName: "preview",
        workspaceId: "exec-release", workspaceName: "Release check", taskId: item.taskId, createdAt: now, source: "live" })),
      ...collectFleetTarsAttentionItems(collectTarsAttention(snapshot))] } });
    publishAttention();
    if (fixtures || side) {
      useFleetAgentRunsStore.setState({ details: { ...fixtures?.runs, ...side?.runs, ...gallery?.runs }, loaded: true });
    }
    conversation.answers ??= [];
    conversation.publications ??= [];
    if (side && !gallery && (publishMode === "true" || publishMode === "failed") && !conversation.messages.some((message) => message.id === "message-publish")) {
      const checkout = snapshot.responsibilities.find((row) => row.id === side.ids.checkout)!;
      const fixture = buildTarsPublishFixtures(new Date(now), { responsibilityId: checkout.id, revision: checkout.revision, korean: params.get("lang") === "ko" });
      conversation.messages.push(fixture.message);
      conversation.receipts.push(fixture.receipt);
      conversation.settings ??= { providerId: "codex", model: "gpt-5.5", maxTurns: 30 };
    }
    if (params.get("decision") === "unverified" && !conversation.activity.some((event) => event.detailCode === "unverifiedCompletion")) conversation.activity.push(
      { id: "activity-unverified", responsibilityId: "preview-responsibility", revision: 1, title: "Verify the release candidate across two repositories",
        state: "blocked", detail: "Completion was reported without a Stave-verified check.", detailCode: "unverifiedCompletion", createdAt: now });
    const saveConversation = () => sessionStorage.setItem(conversationKey, JSON.stringify(conversation));
    /** With the away fixtures, every read first brings the saved state up to what has happened by now. */
    const syncAway = () => { if (away) { snapshot = syncTarsAwayPreview(away.fixtures, Date.now(), conversation, snapshot); saveConversation(); publishAttention(); } };
    syncAway();
    // `schedules=true`: Tars sets up schedules against the page's own clock, and a timer fires them. `schedules=mine` starts with one the user made in Schedules.
    const changeListeners = new Set<(event: { scope: "snapshot" | "conversation" }) => void>();
    const scheduling = params.get("schedules") ? createPreviewScheduleBridge({ storageKey: `${conversationKey}-schedules`, korean: params.get("lang") === "ko",
      mode: params.get("schedules")!, conversation, changed: () => { saveConversation(); for (const listener of changeListeners) listener({ scope: "conversation" }); } }) : null;
    const conversationView = (): TarsConversation => ({ ...structuredClone(conversation), messages: conversation.messages.map((message) => tarsMessageView(structuredClone(message))) });
    // Clearing as the host does it; `retentionDays=N` starts with another retention period than the default.
    const clearing = createPreviewClearBridge({ storageKey: `${conversationKey}-view`, now,
      ...(params.get("retentionDays") ? { retentionDays: Number(params.get("retentionDays")) } : {}),
      getSnapshot: () => snapshot, getConversation: () => ({ ...conversation, messages: conversation.messages.map((message) => tarsMessageView(message)) }), changed: saveConversation });
    /** One second after anything saved, clears included, so a new message never lands before a clear. */
    const nextPreviewAt = () => new Date(Math.max(clockBase() + (conversation.messages.length + conversation.records.length + 1) * 1000,
      ...(clearing.view(conversationView()).clears ?? []).map((record) => Date.parse(record.updatedAt) + 1000))).toISOString();
    // Live progress stays out of the transcript; only the block that needs the user reads as a notice.
    if (params.get("activity") === "true" && !conversation.activity.length) conversation.activity.push(
      { id: "activity-initial", responsibilityId: "preview-responsibility", revision: 1, title: "Verify the release candidate", state: "running", detail: null, createdAt: now },
      { id: "activity-blocked", responsibilityId: "preview-responsibility", revision: 2, title: "Verify the release candidate", state: "blocked", detail: "Waiting for independent review.", createdAt: now });
    let reads = 0;
    let briefReads = 0;
    async function act({ requestId, responsibilityId, expectedRevision, operation, source }: TarsActInput) {
      const existing = conversation.records.find((record) => record.requestId === requestId);
      if (existing) return { record: structuredClone(existing), snapshot: structuredClone(snapshot) };
      const row = snapshot.responsibilities.find((candidate) => candidate.id === responsibilityId);
      const takenOver = row?.state === "takenOver";
      const reason = !row ? "notOwned" as const : row.revision !== expectedRevision ? "stale" as const
        : operation === "handBack" && !takenOver ? "notTakenOver" as const : operation === "takeover" && takenOver ? "alreadyTakenOver" as const
          : (operation === "pause" || operation === "resume") && takenOver ? "takenOver" as const
            // `controlRefusal=true`: the host records the control but refuses it, as when the user took the work over meanwhile.
            : params.get("controlRefusal") === "true" ? "takenOver" as const : null;
      const error = reason ? "Preview control is not admissible." : null;
      // A run command leaves the run going.
      const state = operation === "pause" ? "paused" : operation === "cancel" ? "cancelled" : operation === "takeover" ? "takenOver"
        : operation === "acceptCompletion" ? "completed" : operation === "startNow" ? "running"
          : operation === "extend" || operation === "retryStage" || operation === "skipStage" || operation === "signOff" ? "running" : "queued";
      if (!error) snapshot = { ...snapshot, responsibilities: snapshot.responsibilities.map((candidate) => candidate.id !== responsibilityId ? candidate
        : { ...candidate, revision: expectedRevision + 1, state, reverifyAfter: operation === "handBack" ? now : candidate.reverifyAfter }),
        // A control moves the revision past any proposal waiting on it, so Fleet's decision row ends with it.
        pendingDecisions: (snapshot.pendingDecisions ?? []).filter((decision) => decision.responsibilityId !== responsibilityId) };
      if (!error) publishAttention();
      const createdAt = new Date(clockBase() + (conversation.messages.length + conversation.records.length + 1) * 1000).toISOString();
      const record = { requestId, source, requestHash: "b".repeat(64), action: { kind: "control" as const, responsibilityId, expectedRevision, operation },
        status: error ? "rejected" as const : "applied" as const, error, reason, revision: 2, createdAt, updatedAt: createdAt };
      conversation.records.push(record);
      // A confirming click settles the proposal it confirms, as the host does in one transaction.
      const proposal = conversation.receipts.find((receipt) => `confirm:${receipt.messageId}:${receipt.actionIndex}` === requestId);
      if (proposal?.status === "proposed") Object.assign(proposal, error ? { status: "rejected", error, reason } : { status: "applied", responsibilityId }, { revision: proposal.revision + 1 });
      saveConversation();
      return { record: structuredClone(record), snapshot: structuredClone(snapshot) };
    }
    const publishing = side || away ? createPreviewPublishBridge({ getSnapshot: () => snapshot, conversation, runs: side?.runs ?? {}, failOnce: publishMode === "failed", save: () => saveConversation(),
      setSnapshot: (next) => { snapshot = next; publishTarsSnapshot(structuredClone(snapshot)); } }) : null;
    /** The host's queue move, against the preview snapshot: same order rules, same record line. */
    async function reprioritize({ requestId, responsibilityId, expectedRevision, move, source }: TarsReprioritizeInput) {
      const existing = conversation.records.find((record) => record.requestId === requestId);
      if (existing) return { record: structuredClone(existing), snapshot: structuredClone(snapshot) };
      const row = snapshot.responsibilities.find((candidate) => candidate.id === responsibilityId);
      const plan = row && row.revision === expectedRevision && row.state === "queued" ? planTarsQueueMove(tarsQueueOf(snapshot.responsibilities), responsibilityId, move) : null;
      const reason = !row ? "notOwned" as const : row.revision !== expectedRevision ? "stale" as const : row.state !== "queued" ? "notQueued" as const
        : !plan?.ok ? (plan?.reason === "queueEdge" ? "queueEdge" as const : "stale" as const) : null;
      const changes = plan?.ok ? new Map(plan.changes.map((change) => [change.id, change.priority])) : new Map<string, number>();
      if (!reason) snapshot = { ...snapshot, responsibilities: snapshot.responsibilities.map((candidate) => changes.has(candidate.id)
        ? { ...candidate, priority: changes.get(candidate.id)!, revision: candidate.revision + 1 } : candidate)
        .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)) };
      const createdAt = new Date(clockBase() + (conversation.messages.length + conversation.records.length + 1) * 1000).toISOString();
      const record = { requestId, source, requestHash: "d".repeat(64), action: { kind: "move" as const, responsibilityId, expectedRevision, move },
        status: reason ? "rejected" as const : "applied" as const, error: reason ? "Preview move is not admissible." : null, reason,
        ...(reason ? {} : { priority: changes.get(responsibilityId)! }), revision: 2, createdAt, updatedAt: createdAt };
      conversation.records.push(record);
      saveConversation();
      return { record: structuredClone(record), snapshot: structuredClone(snapshot) };
    }
    const bridge: TarsBridgeApi = {
      ...(publishing ? { previewPublish: publishing.previewPublish, publish: publishing.publish } : {}),
      // A fired schedule is announced as the host announces it, so the conversation reads again without a click.
      ...(scheduling ? { ...scheduling.bridge, onChanged: (listener) => { changeListeners.add(listener); return () => { changeListeners.delete(listener); }; } } : {}),
      reprioritize: async (input) => reprioritize(input),
      ...away?.bridge,
      get: async () => { syncAway(); reads++; if (params.get("readFailure") === "once" && reads === 2) throw new Error("Preview read failed."); return tarsSnapshotForWindow(structuredClone({ ...snapshot, cleared: clearing.cleared() })); },
      clear: (input) => clearing.clear(input),
      undoClear: (input) => clearing.undoClear(input),
      configureView: (input) => clearing.configureView(input),
      // `briefFailure=once`: the first opening's reads fail (a development mount reads twice), so its Retry has something to do.
      getBrief: async ({ responsibilityId }) => {
        briefReads++;
        if (params.get("briefFailure") === "once" && briefReads <= 2) throw new Error("Preview request read failed.");
        const row = snapshot.responsibilities.find((candidate) => candidate.id === responsibilityId);
        if (!row) throw new Error("The responsibility was not found.");
        return buildTarsBrief(row);
      },
      updateIdentity: async (input) => { snapshot = { ...snapshot, identity: { ...snapshot.identity, ...input, updatedAt: nextPreviewAt() } }; sessionStorage.setItem(identityKey, JSON.stringify(snapshot));
        return structuredClone({ ...snapshot, cleared: clearing.cleared() }); },
      create: async () => { throw new Error("Use the global conversation."); },
      act: async (input) => act(input),
      answer: async ({ decisionId, optionIndex, source }): Promise<TarsAnswerResult> => {
        const existing = conversation.answers!.find((answer) => answer.decisionId === decisionId);
        // As the host: an answer is final, except a refusal that leaves the decision open, which takes a new attempt under its own act request id.
        if (existing && !isTarsAnswerRetryable(existing))
          return existing.optionIndex === optionIndex ? { answer: structuredClone(existing), refusal: null } : { answer: structuredClone(existing), refusal: "alreadyAnswered" };
        const attempt = existing ? (existing.attempt ?? 1) + 1 : undefined;
        const parsed = parseTarsDecisionId(decisionId);
        const receipt = parsed && parsed.kind !== "unverifiedCompletion"
          ? conversation.receipts.find((entry) => entry.messageId === parsed.messageId && entry.actionIndex === parsed.actionIndex) : undefined;
        // Stave's own decision names its work; the gallery's is not the default preview row.
        const unverifiedId = parsed?.kind === "unverifiedCompletion" ? parsed.responsibilityId : "preview-responsibility";
        const row = snapshot.responsibilities.find((candidate) => candidate.id === unverifiedId);
        const effect = parsed?.kind === "unverifiedCompletion" ? [{ kind: "control" as const, responsibilityId: parsed.responsibilityId, expectedRevision: parsed.revision, operation: "acceptCompletion" as const },
          { kind: "control" as const, responsibilityId: parsed.responsibilityId, expectedRevision: parsed.revision, operation: "cancel" as const }][optionIndex]
          : receipt?.action.kind === "ask" ? receipt.action.options[optionIndex]?.effect
            : receipt?.action.kind === "control" && optionIndex === 0 ? receipt.action
              // A held work proposal: Confirm applies the saved action, as the host does.
              : receipt && isTarsWorkProposal(receipt) && receipt.status === "proposed" && optionIndex === 0 ? { kind: "proposal" as const } : undefined;
        if (!effect) return { answer: null, refusal: "invalidOption" };
        if (parsed?.kind === "unverifiedCompletion" && tarsUnverifiedDecisionId(unverifiedId, row?.revision ?? 0) !== decisionId) return { answer: null, refusal: "notWaiting" };
        const createdAt = new Date(clockBase() + (conversation.messages.length + conversation.records.length + 1) * 1000).toISOString();
        const label = receipt?.action.kind === "ask" ? receipt.action.options[optionIndex]!.label : null;
        const answer: TarsDecisionAnswer = { decisionId, optionIndex, source, effect, label, status: "pending", reason: null, error: null,
          actRequestId: effect.kind === "control" ? `${tarsAnswerActRequestId(decisionId)}${attempt ? `:${attempt}` : ""}` : null, ...(attempt ? { attempt } : {}),
          messageId: null, revision: (existing?.revision ?? 0) + 1, createdAt, updatedAt: createdAt };
        if (existing) conversation.answers!.splice(conversation.answers!.indexOf(existing), 1, answer); else conversation.answers!.push(answer);
        if (effect.kind === "control") {
          const { record } = await act({ requestId: answer.actRequestId!, responsibilityId: effect.responsibilityId, expectedRevision: effect.expectedRevision, operation: effect.operation, source });
          Object.assign(answer, record.status === "rejected" ? { status: "rejected", reason: record.reason, error: record.error } : { status: "applied" }, { revision: answer.revision + 1 });
        } else if (effect.kind === "proposal") {
          Object.assign(receipt!, { status: "applied", responsibilityId: "preview-responsibility", revision: receipt!.revision + 1 });
          Object.assign(answer, { status: "applied", revision: answer.revision + 1 });
        } else {
          // The chosen option goes back to Tars as the user's answer; the preview answers it at once.
          const reply = "Understood. I will keep the plan and report back when the check finishes.";
          const message = { requestId: `answer:${decisionId}`, text: label!, ...conversation.settings!, id: `answer-${decisionId.replace(/[^A-Za-z0-9-]/g, "-")}`, state: "answered" as const,
            revision: 2, decision: { reply, actions: [] }, reply, error: null, origin: { kind: "answer" as const, decisionId, optionIndex, source,
              question: receipt?.action.kind === "ask" ? receipt.action.question : "", rationale: receipt?.action.kind === "ask" ? receipt.action.options[optionIndex]!.rationale : "" },
            createdAt, updatedAt: createdAt };
          conversation.messages.push(message);
          Object.assign(answer, { status: "applied", messageId: message.id, revision: answer.revision + 1 });
        }
        snapshot = { ...snapshot, pendingDecisions: (snapshot.pendingDecisions ?? []).filter((decision) => !(decision.messageId === receipt?.messageId && decision.actionIndex === receipt?.actionIndex)
          && !(decision.kind === "unverifiedCompletion" && parsed?.kind === "unverifiedCompletion")) };
        publishTarsSnapshot(structuredClone(snapshot));
        publishAttention();
        saveConversation();
        return { answer: structuredClone(answer), refusal: null };
      },
      // The draft is saved like the host saves it, and dropped in the same step that saves the message carrying its request ID.
      getDraft: async () => {
        if (params.get("draftReadFailure") === "true") throw new Error("Preview draft read failed.");
        const saved = JSON.parse(sessionStorage.getItem(draftKey) ?? "null") as TarsComposerDraft | null;
        return saved && conversation.messages.some((message) => message.requestId === saved.requestId) ? null : saved;
      },
      saveDraft: async ({ draft }) => {
        // `draftSaveFailure=request`: typing saves, but the save that carries a send's request ID fails.
        if (params.get("draftSaveFailure") === "request" && draft?.requestId) throw new Error("Preview draft save failed.");
        // As the host: a draft whose request is already a message was sent and is not saved again.
        if (draft && !conversation.messages.some((message) => message.requestId === draft.requestId)) sessionStorage.setItem(draftKey, JSON.stringify(draft));
        else sessionStorage.removeItem(draftKey);
      },
      getConversation: async () => { syncAway(); return clearing.view(conversationView()); },
      configureConversation: async (input) => { conversation.settings = structuredClone(input); saveConversation(); return structuredClone(input); },
      sendMessage: async (input) => {
        if (Object.keys(input).some((key) => !["requestId", "text", "includeWorkingChanges", "attachments"].includes(key)))
          throw new Error("Global messages accept only requestId, text and the working-changes choice.");
        if (!conversation.settings) throw new Error("Missing global settings.");
        // `sendFailure=before`: the host refuses the message before saving it, so nothing exists and the draft stays.
        if (params.get("sendFailure") === "before" && !sendFailed) { sendFailed = true; throw new Error("Preview message was refused before it was saved."); }
        let message = conversation.messages.find((item) => item.requestId === input.requestId);
        // As the host: a request ID names one exact message, so different words, files or choice under it are refused.
        const payload = (value: typeof input) => JSON.stringify([value.text, value.attachments ?? [], value.includeWorkingChanges ?? false]);
        if (message && payload(message) !== payload(input)) throw new Error("This request ID already names a different message.");
        const savedDraft = JSON.parse(sessionStorage.getItem(draftKey) ?? "null") as { requestId?: string | null } | null;
        if (savedDraft?.requestId === input.requestId) sessionStorage.removeItem(draftKey);
        if (!message) {
          const decision: TarsDecision = { reply: "The saved conversation continues across restarts.\n\n**Next:** check the review and keep the current plan.", actions: [] };
          if (params.get("fileLinks") === "true") decision.reply = "[Source](src/example.ts) and `src/example.ts`. [Documentation](https://example.com/docs).";
          if (params.get("richReply") === "true") decision.reply = TARS_PREVIEW_RICH_REPLY;
          // `overflowReply=true`: every block that can be wider than the column (`transcript-overflow-fixture.ts`).
          if (params.get("overflowReply") === "true") decision.reply = TRANSCRIPT_OVERFLOW_REPLY;
          // With side-view fixtures, asking for the report opens it: a view-only show action the host admitted.
          if (side && /report|보고서/i.test(input.text)) {
            decision.reply = params.get("lang") === "ko" ? "결제 화면 작업의 결과 보고서를 옆에 열었습니다." : "I opened the checkout work's result report beside the conversation.";
            decision.actions.push({ kind: "show", responsibilityId: side.ids.checkout, view: "report" });
          }
          // Asking to clear proposes it: the card waits for the user's confirmation, as the host's proposal does.
          if (/\bclear\b|정리|지워/i.test(input.text)) {
            const korean = params.get("lang") === "ko";
            const scopes = /\beverything\b|\ball\b|전부|모두/i.test(input.text) ? ["conversation", "done", "outputs"] as const
              : /done|finished|끝난/i.test(input.text) ? ["done"] as const : ["conversation"] as const;
            decision.reply = korean ? "정리 카드를 띄웠습니다. 확인하면 화면에서만 정리되고 삭제되는 것은 없습니다." : "Here is the clear card. Confirming hides these from view; nothing is deleted.";
            decision.actions.push({ kind: "clear", scopes: [...scopes] });
          }
          // Asking for scheduled work proposes it: the card waits for the user's confirmation, as the host's proposal does.
          scheduling?.decide(input.text, decision);
          if (params.get("receipt")) decision.actions.push({ kind: "delegate", workspaceId: "preview-workspace", title: "Check the review", instruction: "Review the current work.", acceptanceCriteria: ["The review is complete."], priority: 50 });
          const proposal = params.get("proposal");
          if (proposal === "resume" || proposal === "cancel" || proposal === "handBack")
            decision.actions.push({ kind: "control", responsibilityId: "preview-responsibility", expectedRevision: 1, operation: proposal });
          // `proposal=approve` / `proposal=message`: a task operation whose card shows the request it answers or the words it sends.
          // `approval=cut`: the request was too long for the card, so the host cut it and marked it (`truncated`).
          if (proposal === "approve" || proposal === "message") {
            const row = snapshot.responsibilities.find((candidate) => candidate.id === "preview-responsibility");
            const cut = params.get("approval") === "cut";
            const summary = cut ? `Run the release script — set -euo pipefail\n${Array.from({ length: 12 }, (_, index) => `bun run build:package-${index} --out dist/${index}`).join(" && ")}`.slice(0, 499) + "…"
              : "Run the search tests — bun test tests/search.test.ts";
            if (row && proposal === "approve") snapshot = { ...snapshot, responsibilities: snapshot.responsibilities.map((candidate) => candidate !== row ? candidate
              : { ...candidate, pendingRequests: [{ kind: "approval", ref: "preview-approval-ref", requestId: "preview-approval", messageId: "preview-message", taskId: "preview-task", workspaceId: "preview-workspace",
                toolName: "Bash", summary, ...(cut ? { truncated: true as const } : {}) }] }) };
            decision.actions.push({ kind: "control", responsibilityId: "preview-responsibility", expectedRevision: row?.revision ?? 1, operation: proposal,
              input: proposal === "approve" ? { requestRef: "preview-approval-ref" } : { text: "Use the existing search index instead of building a new one." } });
          }
          // `decision=ask`: Tars asks a question whose options pause the work or answer back, in the app's language.
          if (params.get("decision") === "ask") {
            const korean = params.get("lang") === "ko";
            const revision = snapshot.responsibilities.find((row) => row.id === "preview-responsibility")?.revision ?? 1;
            decision.reply = korean ? "릴리스 확인이 아직 실행 중입니다. 어떻게 할지 골라 주세요." : "The release check is still running. Choose how to continue.";
            decision.actions.push({ kind: "ask", recommended: 1,
              question: korean ? "스테이징 배포가 끝날 때까지 릴리스 확인을 멈출까요?" : "Should I pause the release check until the staging deploy finishes?",
              options: [
                { label: korean ? "지금 멈추기" : "Pause it now", rationale: korean ? "스테이징이 끝난 뒤 이어서 확인합니다." : "The check resumes after staging finishes.",
                  effect: { kind: "control", responsibilityId: "preview-responsibility", expectedRevision: revision, operation: "pause" } },
                { label: korean ? "계속 실행" : "Keep it running", rationale: korean ? "이 확인은 스테이징과 관계없습니다." : "This check does not depend on staging.", effect: { kind: "reply" } },
                { label: korean ? "무엇을 기다리는지 설명" : "Explain what it waits for", rationale: korean ? "결정하기 전에 Tars가 설명합니다." : "Tars explains before you decide.", effect: { kind: "reply" } },
              ] });
          }
          const pending = params.get("conversationPending") === "true";
          const createdAt = nextPreviewAt();
          message = { ...input, ...conversation.settings, id: input.requestId, state: pending ? (conversation.messages.length ? "queued" : "reasoning") : "answered", revision: 1, decision: pending ? null : decision, reply: pending ? null : decision.reply, error: null, createdAt, updatedAt: createdAt };
          conversation.messages.push(message);
          const proposed = decision.actions[0];
          // The host's own policy decides what waits: the saved autonomy level, tightened by any "never do" rule that names the action or the repository.
          const key = proposed && proposed.kind !== "schedule" ? tarsActionKey(proposed) : null;
          const matches = key ? matchTarsNeverRules(conversation.settings.neverDo, { key, repository: "preview", branches: [] }) : [];
          const held = proposed?.kind === "ask" || (key !== null && tarsActionDisposition({ key, level: conversation.settings.autonomy, matches }) === "confirm");
          if (proposed) conversation.receipts.push(scheduling && proposed.kind === "schedule" ? scheduling.receiptFor(proposed, message.id, 0, createdAt) : held
            // Held actions wait for a confirming click; a question waits for its answer.
            ? { messageId: message.id, actionIndex: 0, requestHash: "a".repeat(64), action: proposed, status: "proposed", responsibilityId: null, error: null, reason: null,
              ...(matches.length ? { matchedRules: matches } : {}), revision: 1, createdAt, updatedAt: createdAt }
            : { messageId: message.id, actionIndex: 0, requestHash: "a".repeat(64), action: proposed, status: "applied",
              responsibilityId: proposed.kind === "show" ? proposed.responsibilityId : "preview-responsibility", error: null, reason: null, revision: 2, createdAt, updatedAt: createdAt });
          if (held && (proposed?.kind === "control" || proposed?.kind === "ask")) {
            // The host lists a waiting decision in the snapshot and announces the change; publish it as that notification would.
            const target = proposed.kind === "control" ? proposed : proposed.options.flatMap((option) => option.effect.kind === "control" ? [option.effect] : [])[0]!;
            snapshot = { ...snapshot, pendingDecisions: [...(snapshot.pendingDecisions ?? []), proposed.kind === "control"
              ? { responsibilityId: proposed.responsibilityId, messageId: message.id, actionIndex: 0, operation: proposed.operation, expectedRevision: proposed.expectedRevision, proposedAt: createdAt }
              : { kind: "ask", responsibilityId: target.responsibilityId, messageId: message.id, actionIndex: 0, operation: null, expectedRevision: target.expectedRevision,
                proposedAt: createdAt, question: proposed.question, optionCount: proposed.options.length }] };
            publishTarsSnapshot(structuredClone(snapshot));
            publishAttention();
          }
          saveConversation();
        }
        if (params.get("sendFailure") === "once" && !sendFailed) { sendFailed = true; throw new Error("Preview message transport failed after admission."); }
        return tarsMessageView(structuredClone(message));
      },
      cancelMessage: async ({ messageId, expectedRevision }) => {
        const message = conversation.messages.find((item) => item.id === messageId);
        if (!message || message.revision !== expectedRevision) throw new Error("Preview stale message revision.");
        if (message.state !== "queued" && message.state !== "reasoning") throw new Error("Preview message is already settled.");
        Object.assign(message, { state: "cancelled", revision: message.revision + 1 }); saveConversation(); return tarsMessageView(structuredClone(message));
      },
    };
    window.api = { ...window.api, tars: insights ? { ...bridge, getUsage: insights.getUsage } : bridge, ...(insights ? { repositoryMemory: insights.repositoryMemory } : {}), ...(side ? { sourceControl: { ...window.api?.sourceControl,
      getReviewDiff: async () => structuredClone(side.diff), getReviewFileDiff: async ({ path }: { path: string }) => side.fileDiff(path) } } : {}) } as typeof window.api;
    // "Show in Fleet" leaves this preview's only surface; record where it would land.
    useFleetFocusStore.subscribe(({ request }) => { if (request) document.documentElement.dataset.previewFleetFocus = `${request.workspaceId}/${request.taskId}`; });
    // "Open Schedules" leaves this preview's only surface too; record the surface it asks for.
    useAppStore.subscribe((state) => { document.documentElement.dataset.previewSurface = state.activeAppSurface.kind; });
    const empty = params.get("noRepositories") === "true";
    // The view mounts on Tars; Close leaves it (the view unmounts) and the reopen button below brings it back, as returning from a workspace would.
    useAppStore.getState().openTars();
    useAppStore.setState({ providerAvailability: { ...useAppStore.getState().providerAvailability, codex: true, "claude-code": true }, repositoryPath: empty ? null : "/tmp/preview", activeWorkspaceId: params.get("workspace") ?? "preview-workspace",
      // Named so a confirmation card can say where the work runs.
      workspaces: empty ? [] : [{ id: "preview-workspace", name: "Release check", updatedAt: now },
        ...Object.entries(gallery?.workspaceNames ?? {}).map(([id, name]) => ({ id, name, updatedAt: now }))], workspacePathById: empty ? {} : { "preview-workspace": "/tmp/preview", ...side?.workspacePaths }, repositoryFiles: empty ? [] : ["src/example.ts"],
      // `insights=true` registers the repositories its views list; `start=true` registers more than the start screen lists.
      recentRepositories: insights?.repositories ?? (!empty && params.get("start") === "true" ? buildTarsStartRepositoryFixtures(now) : []), openFileFromTree: async ({ filePath }) => { document.documentElement.dataset.previewOpenedFile = filePath; } });
    setReady(true);
  }, []);
  // Only Close leaves the view here; "Show in Fleet" keeps it, recording where it would land instead.
  const closed = useAppStore((state) => state.activeAppSurface.kind === "workspace");
  if (!ready) return null;
  return closed ? <button type="button" data-preview-reopen-tars="" onClick={() => useAppStore.getState().openTars()}>Open Tars</button> : <TarsView />;
}
