import { TarsUndoActionInputSchema } from "../../../src/lib/tars/action-undo";
import { ipcMain } from "electron";
import { z } from "zod";
import {
  TARS_IPC, CreateTarsResponsibilityInputSchema,
  UpdateTarsIdentityInputSchema,
} from "../../../src/lib/tars/types";
import { invokeHostService } from "../host-service-client";
import { getTarsConversationService } from "../tars-conversation-instance";
import { ensureTarsEventBridge } from "../tars-events";
import {
  TarsActInputSchema, TarsAnswerInputSchema, TarsDismissInputSchema, TarsConversationSettingsSchema, CancelTarsMessageInputSchema, GetTarsConversationInputSchema,
  TarsMessageInputSchema, TarsReprioritizeInputSchema, tarsMessageView,
} from "../../../src/lib/tars/conversation";
import { TarsPublishInputSchema, TarsPublishPreviewInputSchema } from "../../../src/lib/tars/publication";
import { TarsBriefInputSchema } from "../../../src/lib/tars/brief";
import { TarsUsageInputSchema, TarsUsageReportSchema } from "../../../src/lib/tars/usage";
import { SaveTarsComposerDraftInputSchema } from "../../../src/lib/tars/composer-draft";
import { TarsClearInputSchema, TarsUndoClearInputSchema, TarsViewSettingsSchema } from "../../../src/lib/tars/clearing";
import { TarsAwayStateSchema } from "../../../src/lib/tars/away-state";
import { TarsScheduleConfirmInputSchema, TarsSchedulePreviewInputSchema, TarsScheduleToggleInputSchema } from "../../../src/lib/tars/schedules";

/** Only the interactive application can enroll responsibilities; no task MCP grant exposes this API. */
export function registerTarsHandlers() {
  ensureTarsEventBridge();
  ipcMain.handle(TARS_IPC.configureConversation, async (_event, rawInput: unknown) => {
    const input = TarsConversationSettingsSchema.parse(rawInput);
    return (await getTarsConversationService()).configureConversation(input);
  });
  ipcMain.handle(TARS_IPC.sendMessage, async (_event, rawInput: unknown) => {
    const input = TarsMessageInputSchema.parse(rawInput);
    // The window gets the saved message back with attachment summaries; the content stays here for the planner.
    return tarsMessageView((await getTarsConversationService()).sendMessage(input));
  });
  ipcMain.handle(TARS_IPC.getConversation, async (_event, rawInput: unknown) => {
    const input = GetTarsConversationInputSchema.parse(rawInput === undefined ? {} : rawInput);
    return (await getTarsConversationService()).getConversation(input);
  });
  ipcMain.handle(TARS_IPC.getDraft, async (_event, rawInput: unknown) => {
    z.undefined().parse(rawInput);
    return (await getTarsConversationService()).getDraft();
  });
  ipcMain.handle(TARS_IPC.saveDraft, async (_event, rawInput: unknown) => {
    const input = SaveTarsComposerDraftInputSchema.parse(rawInput);
    (await getTarsConversationService()).saveDraft(input);
  });
  ipcMain.handle(TARS_IPC.cancelMessage, async (_event, rawInput: unknown) => {
    const input = CancelTarsMessageInputSchema.parse(rawInput);
    return tarsMessageView(await (await getTarsConversationService()).cancelMessage(input));
  });
  // Clearing hides views only; main checks a confirmed proposal against the saved one and settles both together.
  ipcMain.handle(TARS_IPC.clear, async (_event, rawInput: unknown) =>
    (await getTarsConversationService()).clear(TarsClearInputSchema.parse(rawInput)));
  ipcMain.handle(TARS_IPC.undoClear, async (_event, rawInput: unknown) =>
    (await getTarsConversationService()).undoClear(TarsUndoClearInputSchema.parse(rawInput)));
  ipcMain.handle(TARS_IPC.configureView, async (_event, rawInput: unknown) =>
    (await getTarsConversationService()).configureView(TarsViewSettingsSchema.parse(rawInput)));
  // When the user last saw the conversation, and the summary on screen. View state only: it changes no work and is never announced.
  ipcMain.handle(TARS_IPC.getAway, async (_event, rawInput: unknown) => {
    z.undefined().parse(rawInput);
    return (await getTarsConversationService()).getAway();
  });
  ipcMain.handle(TARS_IPC.saveAway, async (_event, rawInput: unknown) =>
    (await getTarsConversationService()).saveAway(TarsAwayStateSchema.parse(rawInput)));
  // An answer names a saved decision and an option index; main reads the option and controls go to the host's act path.
  ipcMain.handle(TARS_IPC.answer, async (_event, rawInput: unknown) => {
    const input = TarsAnswerInputSchema.parse(rawInput);
    return (await getTarsConversationService()).answerDecision(input);
  });
  // A dismissal names a saved decision only; main checks that it waits and records it. Nothing reaches the host.
  ipcMain.handle(TARS_IPC.dismissDecision, async (_event, rawInput: unknown) =>
    (await getTarsConversationService()).dismissDecision(TarsDismissInputSchema.parse(rawInput)));
  ipcMain.handle(TARS_IPC.get, (_event, input: unknown) => {
    z.undefined().parse(input);
    return invokeHostService("tars.invoke", { action: "get", args: undefined });
  });
  ipcMain.handle(TARS_IPC.create, (_event, input: unknown) =>
    invokeHostService("tars.invoke", { action: "create", args: CreateTarsResponsibilityInputSchema.parse(input) }));
  // Clicks enter the host's admitted control path; there is no direct state write.
  ipcMain.handle(TARS_IPC.act, (_event, input: unknown) =>
    invokeHostService("tars.act", TarsActInputSchema.parse(input)));
  // A publish card's confirmation names the work and the user's words only; the host derives and checks everything else.
  ipcMain.handle(TARS_IPC.publish, (_event, input: unknown) =>
    invokeHostService("tars.publish", TarsPublishInputSchema.parse(input)));
  ipcMain.handle(TARS_IPC.publishPreview, (_event, input: unknown) =>
    invokeHostService("tars.publish-preview", TarsPublishPreviewInputSchema.parse(input)));
  // A schedule card's confirmation names its proposal only; the host reads the saved proposal and checks everything again.
  ipcMain.handle(TARS_IPC.schedule, (_event, input: unknown) =>
    invokeHostService("tars.schedule", TarsScheduleConfirmInputSchema.parse(input)));
  ipcMain.handle(TARS_IPC.schedulePreview, (_event, input: unknown) =>
    invokeHostService("tars.schedule-preview", TarsSchedulePreviewInputSchema.parse(input)));
  ipcMain.handle(TARS_IPC.scheduleToggle, (_event, input: unknown) =>
    invokeHostService("tars.schedule-toggle", TarsScheduleToggleInputSchema.parse(input)));
  ipcMain.handle(TARS_IPC.schedules, (_event, input: unknown) => {
    z.undefined().parse(input);
    return invokeHostService("tars.schedules", undefined);
  });
  ipcMain.handle(TARS_IPC.undoAction, (_event, input: unknown) =>
    invokeHostService("tars.undo-action", TarsUndoActionInputSchema.parse(input)));
  // A queue move from the tray takes the host's reprioritize admission; there is no direct priority write.
  ipcMain.handle(TARS_IPC.reprioritize, (_event, input: unknown) =>
    invokeHostService("tars.reprioritize", TarsReprioritizeInputSchema.parse(input)));
  // A brief names one responsibility; its saved message can be long, so it is read on demand instead of riding on every snapshot.
  ipcMain.handle(TARS_IPC.getBrief, (_event, input: unknown) =>
    invokeHostService("tars.brief", TarsBriefInputSchema.parse(input)));
  // Usage is read on demand from saved turn rows; nothing is written and nothing is estimated.
  ipcMain.handle(TARS_IPC.getUsage, async (_event, rawInput: unknown) => {
    const input = TarsUsageInputSchema.parse(rawInput);
    // Loaded on first use, so registering these handlers does not load main's persistence module.
    const { getTarsUsageReport } = await import("../tars-usage-instance");
    return TarsUsageReportSchema.parse(await getTarsUsageReport(input));
  });
  ipcMain.handle(TARS_IPC.updateIdentity, (_event, input: unknown) =>
    invokeHostService("tars.invoke", { action: "updateIdentity", args: UpdateTarsIdentityInputSchema.parse(input) }));
}
