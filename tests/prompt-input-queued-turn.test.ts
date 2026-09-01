import { describe, expect, test } from "bun:test";
import {
  describeQueuedTurnDispatch,
  formatQueuedTurnTargetLabel,
} from "@/components/ai-elements/prompt-input-queued-turn";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector";

const cursorAuto: ModelSelectorOption = {
  key: "cursor:auto",
  providerId: "cursor",
  model: "auto",
  label: "Auto",
  available: true,
};

const claudeOpus: ModelSelectorOption = {
  key: "claude-code:claude-opus-4-6",
  providerId: "claude-code",
  model: "claude-opus-4-6",
  label: "Opus 4.6",
  available: true,
};

const staveAuto: ModelSelectorOption = {
  key: "auto",
  providerId: "claude-code",
  model: "",
  label: "Auto",
  isAuto: true,
  available: true,
};

describe("queued turn dispatch labels", () => {
  test("names the pinned provider and model", () => {
    expect(
      formatQueuedTurnTargetLabel({
        queuedTurn: { providerId: "cursor", model: "auto" },
        modelOptions: [cursorAuto, claudeOpus],
      }),
    ).toBe("Cursor Auto");
  });

  test("warns when the composer selection no longer matches the queue", () => {
    expect(
      describeQueuedTurnDispatch({
        queuedTurn: { providerId: "cursor", model: "auto" },
        selection: claudeOpus,
        modelOptions: [cursorAuto, claudeOpus],
      }),
    ).toEqual({
      targetLabel: "Cursor Auto",
      composerLabel: "Claude Opus 4.6",
      mismatchesComposer: true,
      caption: "Sends as Cursor Auto, not Claude Opus 4.6",
    });
  });

  test("stays quiet when the composer still matches the queued target", () => {
    expect(
      describeQueuedTurnDispatch({
        queuedTurn: { providerId: "cursor", model: "auto" },
        selection: cursorAuto,
        modelOptions: [cursorAuto],
      }).caption,
    ).toBe("Sends as Cursor Auto");
  });

  test("treats Stave Auto as a different selection than a pinned provider", () => {
    expect(
      describeQueuedTurnDispatch({
        queuedTurn: { providerId: "cursor", model: "auto" },
        selection: staveAuto,
        modelOptions: [cursorAuto],
      }).mismatchesComposer,
    ).toBe(true);
  });

  test("keeps legacy queue items on the task model", () => {
    expect(
      describeQueuedTurnDispatch({
        queuedTurn: {},
        selection: claudeOpus,
        modelOptions: [claudeOpus],
      }),
    ).toMatchObject({
      targetLabel: null,
      mismatchesComposer: false,
      caption: "Sends with the task's current model",
    });
  });
});
