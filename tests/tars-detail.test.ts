import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { i18n } from "@/i18n/runtime";
import { resources } from "@/i18n/resources";
import { AGENT_RUN_PAUSE_REASONS, AGENT_RUN_STOP_REASONS } from "@/lib/agent-runs/domain";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { describeTarsMessageFailure, describeTarsResponsibilityDetail, describeTarsResponsibilityDiagnostic, type TarsDetailFields } from "@/lib/tars/detail";
import { agentRunTurnStartFailureDetail, parseAgentRunTurnStartFailure } from "@/lib/agent-runs/turn-start-failure";
import { TARS_MESSAGE_FAILURE_TEXT, TarsMessageFailureCodeSchema } from "@/lib/tars/conversation";
import { TarsDetailCodeSchema } from "@/lib/tars/types";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { tarsObservation } from "../electron/host-service/tars-execution";
import { tarsDetailFromError, TarsDetailError, TarsOwnershipLostError } from "../electron/host-service/tars-ownership";
import { agentRunFixture } from "./fixtures/agent-run-fixtures";

const NOW = "2026-11-05T00:00:00.000Z";
const LATER = "2026-11-05T00:05:00.000Z";
const databases: Database[] = [];
afterEach(async () => {
  for (const database of databases.splice(0)) database.close();
  await i18n.changeLanguage("en");
});

const english = resources.en.shell.tars;
const korean = resources.ko.shell.tars;

async function inBoth(describe: () => string | null) {
  await i18n.changeLanguage("en");
  const en = describe();
  await i18n.changeLanguage("ko");
  const ko = describe();
  await i18n.changeLanguage("en");
  return { en, ko };
}

describe("Tars responsibility detail codes", () => {
  test.each(TarsDetailCodeSchema.options)("%s translates in English and Korean", async (detailCode) => {
    const { en, ko } = await inBoth(() => describeTarsResponsibilityDetail({ detail: "English host sentence.", detailCode }));
    expect(en).toBe(english.detail[detailCode]);
    expect(ko).toBe(korean.detail[detailCode]);
    expect(ko).not.toBe(en);
    expect(ko).toMatch(/[가-힣]/);
  });

  test.each(AGENT_RUN_PAUSE_REASONS)("a run paused for %s names its reason", async (reason) => {
    const { en, ko } = await inBoth(() => describeTarsResponsibilityDetail({ detail: reason, detailCode: "runPaused", detailParams: { reason } }));
    expect(en).toBeTruthy();
    expect(en).not.toBe(reason);
    expect(ko).toMatch(/[가-힣]/);
  });

  test.each(AGENT_RUN_STOP_REASONS)("a run stopped for %s names its reason", async (reason) => {
    const { en, ko } = await inBoth(() => describeTarsResponsibilityDetail({ detail: reason, detailCode: "runStopped", detailParams: { reason } }));
    expect(en).toBeTruthy();
    expect(en).not.toBe(reason);
    expect(ko).toMatch(/[가-힣]/);
  });

  test("free text and unknown codes or reasons fall back without inventing a sentence", () => {
    expect(describeTarsResponsibilityDetail({ detail: "The reviewer found a failing check." })).toBe("The reviewer found a failing check.");
    expect(describeTarsResponsibilityDetail({ detail: "Saved by a newer host.", detailCode: "fromTheFuture" as never })).toBe("Saved by a newer host.");
    expect(describeTarsResponsibilityDetail({ detail: null, detailCode: null })).toBeNull();
    // An unknown pause reason keeps the generic paused sentence.
    expect(describeTarsResponsibilityDetail({ detail: "new-reason", detailCode: "runPaused", detailParams: { reason: "new-reason" } }))
      .toBe(english.detail.runPaused);
    expect(describeTarsResponsibilityDetail({ detail: "The run stopped.", detailCode: "runStopped", detailParams: null }))
      .toBe(english.detail.runStopped);
  });
});

describe("Tars message failure codes", () => {
  test.each(TarsMessageFailureCodeSchema.options)("%s translates in English and Korean, also for rows saved before codes", async (code) => {
    const coded = await inBoth(() => describeTarsMessageFailure({ error: TARS_MESSAGE_FAILURE_TEXT[code], errorCode: code }));
    expect(coded.en).toBe(english.messageFailure[code]);
    expect(coded.ko).toBe(korean.messageFailure[code]);
    const legacy = await inBoth(() => describeTarsMessageFailure({ error: TARS_MESSAGE_FAILURE_TEXT[code] }));
    expect(legacy).toEqual(coded);
  });

  test("a message that did not fail has no failure text, and other text passes through", () => {
    expect(describeTarsMessageFailure({ error: null })).toBeNull();
    expect(describeTarsMessageFailure({ error: "A diagnostic from elsewhere." })).toBe("A diagnostic from elsewhere.");
  });

  test("the store saves the code with the failure, and recovery names an interruption", () => {
    const database = new Database(":memory:"); databases.push(database);
    const conversations = new TarsConversationStore(database);
    conversations.configure({ providerId: "codex", model: "test-model", maxTurns: 6 });
    const first = conversations.create({ requestId: "first", text: "Status?" }, NOW);
    const failed = conversations.fail(first.id, first.revision, TARS_MESSAGE_FAILURE_TEXT.reasoningFailed, LATER, "reasoningFailed");
    expect(failed).toMatchObject({ state: "failed", errorCode: "reasoningFailed" });
    const second = conversations.create({ requestId: "second", text: "Status again?" }, NOW);
    conversations.claim(second.id, second.revision, NOW);
    expect(conversations.recover(LATER)).toEqual([expect.objectContaining({ id: second.id, errorCode: "interrupted",
      error: TARS_MESSAGE_FAILURE_TEXT.interrupted })]);
    // A plain diagnostic keeps no code.
    const third = conversations.create({ requestId: "third", text: "Again" }, NOW);
    expect(conversations.fail(third.id, third.revision, "Provider said no.", LATER).errorCode).toBeNull();
  });
});

describe("Tars detail producers", () => {
  const base = agentRunFixture();
  const run = (overrides: Partial<AgentRunDetail["agentRun"]>, stages = base.stages) =>
    ({ ...base, agentRun: { ...base.agentRun, ...overrides }, stages, events: [], report: null }) as AgentRunDetail;

  test("observations code the sentences Tars writes and keep a run's own words as free text", () => {
    expect(tarsObservation(run({ state: "stopped", stopReason: "turn-cap-reached", reasonDetail: null })))
      .toEqual({ state: "blocked", detail: "turn-cap-reached", detailCode: "runStopped", detailParams: { reason: "turn-cap-reached" } });
    // A run's own stop or cancel reason is a diagnostic: the code says what happened, the words stay in detail.
    expect(tarsObservation(run({ state: "stopped", stopReason: null, reasonDetail: "The reviewer stopped it." })))
      .toEqual({ state: "blocked", detail: "The reviewer stopped it.", detailCode: "runStopped", detailParams: null });
    expect(tarsObservation(run({ state: "cancelled", reasonDetail: "Provider process exited." })))
      .toEqual({ state: "cancelled", detail: "Provider process exited.", detailCode: "runCancelled", detailParams: null });
    expect(tarsObservation(run({ state: "cancelled", reasonDetail: null }))).toEqual({ state: "cancelled", detail: null });
    expect(tarsObservation(run({ state: "completed" }))).toMatchObject({ state: "blocked", detailCode: "incompleteReport" });
    expect(tarsObservation(run({ state: "paused", pauseReason: "usage-limit", reasonDetail: null }, [])))
      .toEqual({ state: "waiting", detail: "usage-limit", detailCode: "runPaused", detailParams: { reason: "usage-limit" }, runTurns: base.agentRun.turnCount });
    expect(tarsObservation(run({ state: "paused", pauseReason: "paused-by-user", reasonDetail: "Paused from Fleet." }, [])))
      .toEqual({ state: "waiting", detail: "Paused from Fleet.", runTurns: base.agentRun.turnCount });
  });

  test("a stage turn that could not start is said by code, with the provider's words as an expandable diagnostic", () => {
    const stuck = { ...base.stages[0]!, status: "stuck" as const, blockReason: null, detail: agentRunTurnStartFailureDetail("spawn ENOENT: codex") };
    const observed = tarsObservation(run({ state: "running", currentStageIndex: 0 }, [stuck]));
    expect(observed).toMatchObject({ state: "waiting", detailCode: "turnStartFailed", detailParams: null, stageAsksUser: true,
      stageWait: { kind: "gate", gate: "stuck" } });
    // The model keeps the whole English sentence; people read the translated line and can expand the provider's words.
    expect(observed.detail).toBe("The stage's turn could not start: spawn ENOENT: codex");
    expect(describeTarsResponsibilityDetail(observed as TarsDetailFields)).toBe(i18n.t("shell:tars.detail.turnStartFailed"));
    expect(describeTarsResponsibilityDiagnostic(observed as TarsDetailFields)).toBe("spawn ENOENT: codex");
    // Any other stuck sentence stays free text.
    const other = tarsObservation(run({ state: "running", currentStageIndex: 0 }, [{ ...stuck, detail: "No progress for 20 minutes." }]));
    expect(other.detailCode).toBeUndefined();
    expect(parseAgentRunTurnStartFailure("No progress for 20 minutes.")).toBeNull();
  });

  test("the diagnostic shows a run's own words, never a repeat of the translated code", () => {
    expect(describeTarsResponsibilityDiagnostic({ detail: "The reviewer stopped it.", detailCode: "runStopped", detailParams: null }))
      .toBe("The reviewer stopped it.");
    expect(describeTarsResponsibilityDiagnostic({ detail: "turn-cap-reached", detailCode: "runStopped", detailParams: { reason: "turn-cap-reached" } })).toBeNull();
    expect(describeTarsResponsibilityDiagnostic({ detail: "The run stopped.", detailCode: "runStopped", detailParams: null })).toBeNull();
    expect(describeTarsResponsibilityDiagnostic({ detail: "Provider process exited.", detailCode: "runCancelled", detailParams: null })).toBe("Provider process exited.");
    // Tars's own fixed sentences and free text have no diagnostic.
    expect(describeTarsResponsibilityDiagnostic({ detail: "The run is paused.", detailCode: "runPaused", detailParams: null })).toBeNull();
    expect(describeTarsResponsibilityDiagnostic({ detail: "Free text.", detailCode: null, detailParams: null })).toBeNull();
    // The translated line for a coded stop with the run's words is the localized sentence, not the English words.
    expect(describeTarsResponsibilityDetail({ detail: "The reviewer stopped it.", detailCode: "runStopped", detailParams: null }))
      .toBe(i18n.t("shell:tars.detail.runStopped"));
  });

  test("errors keep their English message and carry a code only when Tars wrote it", () => {
    expect(tarsDetailFromError(new TarsDetailError("executionExists", "This task already has an execution.")))
      .toEqual({ detail: "This task already has an execution.", detailCode: "executionExists", detailParams: null });
    expect(tarsDetailFromError(new TarsOwnershipLostError("The owned run identity changed."))).toMatchObject({ detailCode: "ownershipChanged" });
    expect(tarsDetailFromError(new TarsOwnershipLostError("Taken over.", "takenOverInTask"))).toMatchObject({ detailCode: "takenOverInTask" });
    expect(tarsDetailFromError(new Error("git: branch exists"))).toEqual({ detail: "git: branch exists", detailCode: null, detailParams: null });
    expect(tarsDetailFromError("thrown text")).toMatchObject({ detailCode: "observationFailed" });
  });

  test("a coded detail reaches the row and its activity, and later free text clears the code", () => {
    const database = new Database(":memory:"); databases.push(database);
    const store = new TarsStore(database);
    const created = store.create({ requestId: "detail", title: "Fix search", instruction: "Fix and verify search.",
      acceptanceCriteria: ["Search works"], workspaceId: "source", repositoryPath: "/tmp/repository", providerId: "codex" }, NOW);
    const waiting = store.patch(created.id, created.revision, { state: "waiting",
      detail: "The execution task is waiting for your input or approval.", detailCode: "waitingForUser" }, NOW);
    expect(waiting).toMatchObject({ detailCode: "waitingForUser" });
    expect(store.listActivity().at(-1)).toMatchObject({ state: "waiting", detailCode: "waitingForUser" });
    const free = store.patch(waiting.id, waiting.revision, { detail: "The reviewer asked a question." }, LATER);
    expect(free.detailCode).toBeUndefined();
    expect(free.detailParams).toBeUndefined();
    expect(store.listActivity().at(-1)).toMatchObject({ detail: "The reviewer asked a question." });
    expect(store.listActivity().at(-1)?.detailCode).toBeUndefined();
    // A patch that leaves the detail alone keeps its code.
    const coded = store.patch(free.id, free.revision, { detail: "paused", detailCode: "runPaused", detailParams: { reason: "paused-by-user" } }, LATER);
    expect(store.patch(coded.id, coded.revision, { priority: 70 }, LATER)).toMatchObject({ detailCode: "runPaused", detailParams: { reason: "paused-by-user" } });
  });
});
