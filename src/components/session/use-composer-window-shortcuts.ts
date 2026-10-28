import { useEffect, useLayoutEffect, useRef } from "react";
import {
  readCursorComposerSettings,
  resolveCursorComposerControls,
} from "@/components/ai-elements/cursor-model-runtime";
import {
  persistModelPickerPreferences,
  stepModelEffort,
  type ModelEffortStepDirection,
} from "@/components/ai-elements/model-effort-step";
import type { ModelSelectArgs } from "@/components/ai-elements/agent-choice-actions";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector.utils";
import {
  COMPOSER_EFFORT_STEP_EVENT,
  isComposerOwnedByPendingInteraction,
  type ComposerEffortStepDetail,
} from "@/components/session/composer-effort-step";
import {
  EMPTY_MESSAGES,
  shouldHandleApprovalEnterShortcut,
  shouldHandleApprovalTabShortcut,
} from "@/components/session/chat-input.utils";
import { useAppStore } from "@/store/app.store";
import type { AppState } from "@/store/app-store.types";
import type { ApprovalPart } from "@/types/chat";

/**
 * The composer's window-level keys: Enter and Tab on a pending approval, and
 * the "Increase effort" / "Decrease effort" commands. Each answers only for
 * the composer of the active task (`windowShortcutsEnabled`), so split panels
 * and a task hidden behind Review never act on a key meant for another.
 */

function approvalShortcutEvent(event: KeyboardEvent) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  return {
    key: event.key,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    isComposing: event.isComposing,
    targetTagName: target?.tagName,
    targetRole: target?.getAttribute("role"),
    targetIsContentEditable: target?.isContentEditable,
  };
}

/** Enter allows the pending approval once; Tab moves to its guidance field. */
export function useComposerApprovalShortcuts(args: {
  activeTaskId: string;
  windowShortcutsEnabled: boolean;
  pendingApproval: { messageId: string; part: ApprovalPart } | null;
  resolveApproval: AppState["resolveApproval"];
  onFocusGuidance: () => void;
}) {
  const { activeTaskId, windowShortcutsEnabled, pendingApproval, resolveApproval } = args;
  const onFocusGuidanceRef = useRef(args.onFocusGuidance);
  useLayoutEffect(() => {
    onFocusGuidanceRef.current = args.onFocusGuidance;
  });
  useEffect(() => {
    // Off with the composer's other window keys: another task is active, or Review hides this one.
    if (!pendingApproval || !windowShortcutsEnabled) {
      return;
    }

    const handleApprovalShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      // Window-level Enter/Tab approval shortcuts act on the GLOBAL active
      // task; other visible split panels with their own pending approvals
      // must not also resolve them.
      if (useAppStore.getState().activeTaskId !== activeTaskId) {
        return;
      }
      const details = approvalShortcutEvent(event);
      if (shouldHandleApprovalTabShortcut(details)) {
        event.preventDefault();
        onFocusGuidanceRef.current();
        return;
      }
      if (!shouldHandleApprovalEnterShortcut(details)) {
        return;
      }
      event.preventDefault();
      resolveApproval({
        taskId: activeTaskId,
        messageId: pendingApproval.messageId,
        requestId: pendingApproval.part.requestId,
        approved: true,
      });
    };

    window.addEventListener("keydown", handleApprovalShortcut);
    return () => window.removeEventListener("keydown", handleApprovalShortcut);
  }, [activeTaskId, windowShortcutsEnabled, pendingApproval, resolveApproval]);
}

/**
 * "Increase effort" / "Decrease effort": one level through the same levels,
 * from the same starting effort and through the same choice path as the
 * model picker. Nothing happens while the picker is closed to the user (the
 * composer is disabled, or an approval or question owns it), or while an
 * agent runs the task, which keeps the agent's own model and effort.
 */
export function useComposerEffortShortcut(args: {
  activeTaskId: string;
  windowShortcutsEnabled: boolean;
  disabled: boolean;
  selectedModelOption: ModelSelectorOption;
  modelOptions: readonly ModelSelectorOption[];
  effortValue?: string;
  effortLabel?: string;
  fastMode?: boolean;
  agentChoice: {
    current: unknown;
    selectModel: (selection: ModelSelectArgs) => void;
  };
}) {
  const stepEffortRef = useRef<(direction: ModelEffortStepDirection) => void>(() => {});
  useLayoutEffect(() => {
    stepEffortRef.current = (direction) => {
      const store = useAppStore.getState();
      const messages = store.messagesByTask[args.activeTaskId] ?? EMPTY_MESSAGES;
      if (
        args.disabled ||
        isComposerOwnedByPendingInteraction(messages) ||
        args.agentChoice.current
      ) {
        return;
      }
      const value = args.selectedModelOption;
      const cursorSettings =
        value.providerId === "cursor" && !value.isAuto
          ? readCursorComposerSettings({ settings: store.settings, model: value.model })
          : { effort: "medium", fastMode: false };
      const { effortValue } = resolveCursorComposerControls({
        selectedModel: value,
        effortValue: args.effortValue,
        effortLabel: args.effortLabel,
        fastMode: args.fastMode,
        storeEffort: cursorSettings.effort,
        storeFastMode: cursorSettings.fastMode,
      });
      const step = stepModelEffort({
        value,
        options: args.modelOptions,
        effortValue,
        direction,
      });
      if (!step) {
        return;
      }
      persistModelPickerPreferences({
        option: step.selection,
        effort: step.effort,
        updateModelRuntimePreference: store.updateModelRuntimePreference,
      });
      args.agentChoice.selectModel(step);
    };
  });
  const { activeTaskId, windowShortcutsEnabled } = args;
  useEffect(() => {
    if (!windowShortcutsEnabled) {
      return;
    }
    const handleEffortStep = (event: Event) => {
      const detail = (event as CustomEvent<ComposerEffortStepDetail>).detail;
      if (
        !detail ||
        detail.handled ||
        useAppStore.getState().activeTaskId !== activeTaskId
      ) {
        return;
      }
      detail.handled = true;
      stepEffortRef.current(detail.direction);
    };
    window.addEventListener(COMPOSER_EFFORT_STEP_EVENT, handleEffortStep);
    return () =>
      window.removeEventListener(COMPOSER_EFFORT_STEP_EVENT, handleEffortStep);
  }, [activeTaskId, windowShortcutsEnabled]);
}
