import { useTranslation } from "@/i18n";
import { i18n } from "@/i18n";
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
  useTranslation();
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
      toast.error(i18n.t("lens:useLensOverlayModes.annotationModeFailed"), {
        description: result?.message ?? i18n.t("lens:useLensOverlayModes.lensCouldNotStartAnnotationMode"),
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
      toast.error(i18n.t("lens:useLensOverlayModes.annotationModeFailed"), {
        description: result?.message ?? i18n.t("lens:useLensOverlayModes.lensCouldNotStopAnnotationMode"),
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
        toast.error(i18n.t("lens:useLensOverlayModes.inspectModeFailed"), {
          description: result?.message ?? i18n.t("lens:useLensOverlayModes.lensCouldNotStopInspectMode"),
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
      toast.error(i18n.t("lens:useLensOverlayModes.inspectModeFailed"), {
        description: result?.message ?? i18n.t("lens:useLensOverlayModes.lensCouldNotStartInspectMode"),
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
      toast.error(i18n.t("lens:useLensOverlayModes.lensIsUnavailable"), {
        description:
          i18n.t("lens:useLensOverlayModes.theEmbeddedBrowserOnlyWorksInThe"),
      });
      return;
    }
    if (!activeTaskId) {
      toast.warning(i18n.t("lens:useLensOverlayModes.selectATaskFirst"), {
        description: i18n.t("lens:useLensOverlayModes.lensSendsElementContextIntoTheActive"),
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
        toast.error(i18n.t("lens:useLensOverlayModes.elementPickerFailed"), {
          description:
            result?.message ?? i18n.t("lens:useLensOverlayModes.lensCouldNotStartTheElementPicker"),
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

      toast.success(i18n.t("lens:useLensOverlayModes.lensSelectionAdded"), {
        description: i18n.t("lens:useLensOverlayModes.elementDetailsWereAppendedToTheActive"),
      });
      // Text is available immediately. A refused or failed optional capture
      // must not discard it or retry a permission request automatically.
      const selected = result.result as ElementPickerResult;
      if (selected.page?.documentId) {
        const rect = selected.boundingBox;
        try {
          const screenshot = await window.api?.lens?.screenshot?.({
            workspaceId,
            lensSessionId,
            options: {
              clip: {
                x: Math.max(0, Math.round(rect.x)),
                y: Math.max(0, Math.round(rect.y)),
                width: Math.max(1, Math.round(rect.width)),
                height: Math.max(1, Math.round(rect.height)),
              },
              documentId: selected.page.documentId,
            },
          });
          if (
            screenshot?.ok &&
            screenshot.dataUrl &&
            screenshot.documentId === selected.page.documentId
          ) {
            const store = useAppStore.getState();
            const draft = store.promptDraftByTask[activeTaskId];
            // Do not resurrect a selection the user already sent or removed.
            if (draft?.text.includes(selectionText)) {
              store.updatePromptDraft({
                taskId: activeTaskId,
                patch: {
                  attachments: [
                    ...draft.attachments,
                    {
                      kind: "image",
                      id: `lens-selection:${crypto.randomUUID()}`,
                      dataUrl: screenshot.dataUrl,
                      label: `Lens: ${selected.tagName}`,
                    },
                  ],
                },
              });
            }
          }
        } catch {
          /* The selection remains usable without an image. */
        }
      }
    } catch (error) {
      toast.error(i18n.t("lens:useLensOverlayModes.elementPickerFailed"), {
        description:
          error instanceof Error
            ? error.message
            : i18n.t("lens:useLensOverlayModes.thePageIsNoLongerAvailable"),
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
