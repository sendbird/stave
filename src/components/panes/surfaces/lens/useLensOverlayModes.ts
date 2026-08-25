import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui";
import { formatElementForChat } from "@/lib/lens/lens-element-message";
import { matchesSession } from "@/lib/lens/lens-log-format";
import {
  type ElementPickerResult,
  type LensSourceMappingConfig,
} from "@/lib/lens/lens.types";
import {
  DEFAULT_VISUAL_COMMENT_SHORTCUT,
  isVisualCommentShortcut,
  type VisualCommentShortcut,
} from "@/lib/visual-comment-shortcuts";
import { useAppStore } from "@/store/app.store";

/** The three overlay modes a Lens panel can drive inside the guest document. */
export type LensOverlayModesHandle = {
  isAnnotationModeActive: boolean;
  isBoxInspectActive: boolean;
  isPickerActive: boolean;
  toggleAnnotationMode: () => Promise<void>;
  toggleBoxInspect: () => Promise<void>;
  startElementPicker: () => Promise<void>;
  /** Adopt the mode flags main reports for an already-live session. */
  setIsAnnotationModeActive: (active: boolean) => void;
  setIsBoxInspectActive: (active: boolean) => void;
};

/**
 * Drives the overlay modes Lens injects into the guest document: visual
 * comments, box-model inspect, and the one-shot element picker.
 *
 * The three live in one module because their exclusion rule is real coupling,
 * not layering: visual comments and inspect each install a pointer-capturing
 * overlay in the page, so arming one has to disarm the other or they fight
 * over the same hover and click. That constraint belongs to the in-page
 * implementation — when the interactive chrome moves into React over the guest
 * rect, the modes can coexist and this module splits along the seam for free.
 */
export function useLensOverlayModes(args: {
  workspaceId: string;
  lensSessionId: string;
  hasLensApi: boolean;
  activeTaskId: string | null;
  sourceMappingConfig: LensSourceMappingConfig;
  visualCommentShortcut: VisualCommentShortcut;
}): LensOverlayModesHandle {
  const {
    workspaceId,
    lensSessionId,
    hasLensApi,
    activeTaskId,
    sourceMappingConfig,
    visualCommentShortcut,
  } = args;

  const [isAnnotationModeActive, setIsAnnotationModeActive] = useState(false);
  const [isBoxInspectActive, setIsBoxInspectActive] = useState(false);
  const [isPickerActive, setIsPickerActive] = useState(false);

  const startAnnotationMode = useCallback(async () => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    if (isAnnotationModeActive) {
      return;
    }

    // Annotation and inspect overlays both capture pointer events - keep them
    // mutually exclusive so they never fight over the same hover/click.
    if (isBoxInspectActive) {
      await window.api?.lens?.stopBoxInspect?.({ workspaceId, lensSessionId });
      setIsBoxInspectActive(false);
    }

    const result = await window.api?.lens?.startAnnotationMode?.({
      workspaceId,
      lensSessionId,
      options: {
        extractDebugSource: sourceMappingConfig.reactDebugSource,
      },
    });
    if (!result?.ok) {
      toast.error("Annotation mode failed", {
        description: result?.message ?? "Lens could not start annotation mode.",
      });
      return;
    }
    setIsAnnotationModeActive(true);
  }, [
    hasLensApi,
    isAnnotationModeActive,
    isBoxInspectActive,
    lensSessionId,
    sourceMappingConfig.reactDebugSource,
    workspaceId,
  ]);

  const stopAnnotationMode = useCallback(async () => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    const result = await window.api?.lens?.stopAnnotationMode?.({
      workspaceId,
      lensSessionId,
    });
    if (!result?.ok) {
      toast.error("Annotation mode failed", {
        description: result?.message ?? "Lens could not stop annotation mode.",
      });
      return;
    }
    setIsAnnotationModeActive(false);
  }, [hasLensApi, lensSessionId, workspaceId]);

  const toggleAnnotationMode = useCallback(async () => {
    if (isAnnotationModeActive) {
      await stopAnnotationMode();
      return;
    }
    await startAnnotationMode();
  }, [isAnnotationModeActive, startAnnotationMode, stopAnnotationMode]);

  const toggleBoxInspect = useCallback(async () => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    if (isBoxInspectActive) {
      const result = await window.api?.lens?.stopBoxInspect?.({
        workspaceId,
        lensSessionId,
      });
      if (!result?.ok) {
        toast.error("Inspect mode failed", {
          description: result?.message ?? "Lens could not stop inspect mode.",
        });
        return;
      }
      setIsBoxInspectActive(false);
      return;
    }

    // Inspect and annotation overlays are mutually exclusive (see above).
    if (isAnnotationModeActive) {
      await stopAnnotationMode();
    }

    const result = await window.api?.lens?.startBoxInspect?.({
      workspaceId,
      lensSessionId,
    });
    if (!result?.ok) {
      toast.error("Inspect mode failed", {
        description: result?.message ?? "Lens could not start inspect mode.",
      });
      return;
    }
    setIsBoxInspectActive(true);
  }, [
    hasLensApi,
    isAnnotationModeActive,
    isBoxInspectActive,
    lensSessionId,
    stopAnnotationMode,
    workspaceId,
  ]);

  const startElementPicker = useCallback(async () => {
    if (isPickerActive) {
      return;
    }
    if (!workspaceId) {
      return;
    }
    if (!hasLensApi) {
      toast.error("Lens is unavailable", {
        description:
          "The embedded browser only works in the Electron desktop runtime.",
      });
      return;
    }
    if (!activeTaskId) {
      toast.warning("Select a task first", {
        description: "Lens sends element context into the active task draft.",
      });
      return;
    }

    setIsPickerActive(true);
    try {
      const result = await window.api?.lens?.startElementPicker?.({
        workspaceId,
        lensSessionId,
        options: {
          extractDebugSource: sourceMappingConfig.reactDebugSource,
        },
      });

      if (!result?.ok) {
        toast.error("Element picker failed", {
          description:
            result?.message ?? "Lens could not start the element picker.",
        });
        return;
      }

      if (!result.result) {
        return;
      }

      const selectionText = formatElementForChat(
        result.result as ElementPickerResult,
        sourceMappingConfig,
      );

      // updatePromptDraft + promptFocusNonce both call zustand set(). In
      // React 18, event-handler updates are auto-batched so this is one
      // render, but we call through the store action to preserve its equality
      // guards and field merging logic.
      const currentText =
        useAppStore.getState().promptDraftByTask[activeTaskId]?.text?.trim() ??
        "";
      useAppStore.getState().updatePromptDraft({
        taskId: activeTaskId,
        patch: {
          text: currentText
            ? `${currentText}\n\n${selectionText}`
            : selectionText,
        },
      });
      useAppStore.setState((state) => ({
        promptFocusNonce: state.promptFocusNonce + 1,
      }));

      toast.success("Lens selection added", {
        description: "Element details were appended to the active task draft.",
      });
    } finally {
      setIsPickerActive(false);
    }
  }, [
    activeTaskId,
    hasLensApi,
    isPickerActive,
    lensSessionId,
    sourceMappingConfig,
    workspaceId,
  ]);

  useEffect(() => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    const unsubscribe =
      window.api?.lens?.subscribeVisualCommentShortcutEvents?.((payload) => {
        if (!matchesSession(payload, workspaceId, lensSessionId)) {
          return;
        }
        if (
          !isVisualCommentShortcut({
            shortcut: visualCommentShortcut ?? DEFAULT_VISUAL_COMMENT_SHORTCUT,
            key: payload.key,
            code: payload.code,
            shiftKey: payload.shiftKey,
            altKey: payload.altKey,
            ctrlKey: payload.ctrlKey,
            metaKey: payload.metaKey,
            isComposing: payload.isComposing,
          })
        ) {
          return;
        }
        void toggleAnnotationMode();
      });

    return () => {
      unsubscribe?.();
    };
  }, [
    hasLensApi,
    lensSessionId,
    toggleAnnotationMode,
    visualCommentShortcut,
    workspaceId,
  ]);

  return {
    isAnnotationModeActive,
    isBoxInspectActive,
    isPickerActive,
    setIsAnnotationModeActive,
    setIsBoxInspectActive,
    startElementPicker,
    toggleAnnotationMode,
    toggleBoxInspect,
  };
}
