import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAgentsUiStore } from "@/store/agents-ui-store";
import {
  findModelShortcutEffort,
  findModelShortcutOption,
  resolveModelShortcutSlot,
} from "@/lib/providers/model-shortcuts";
import { listProviderIds } from "@/lib/providers/model-catalog";
import { STAVE_OPEN_MODEL_SELECTOR_EVENT, registerComposerModelSelectorReceiver } from "@/lib/providers/accounts-navigation";
import type { ModelSelectorOpenRequest } from "./model-selector-open-request";
import type { PromptLexicalEditorHandle } from "./prompt-lexical-editor";
import type { PromptInputProps } from "./prompt-input.types";

/**
 * How long a claimed keyboard chord keeps rejecting a stray one-character
 * insertion. Long enough to cover the input method echo that follows the
 * `keydown`, short enough that the next real keystroke is never swallowed.
 */
const SHORTCUT_ECHO_GUARD_WINDOW_MS = 120;

/**
 * Window-level composer shortcuts: model shortcut slots, Cmd/Ctrl+L or J to
 * focus the composer, Alt+P to open the model selector, plus the requests
 * from Settings and "Assign to an agent…" that open the selector.
 */
export function usePromptInputWindowShortcuts(args: {
  interactionsDisabled: boolean;
  windowShortcutsEnabled: boolean;
  modelOptions: PromptInputProps["modelOptions"];
  modelShortcutKeys: PromptInputProps["modelShortcutKeys"];
  modelShortcutEfforts: PromptInputProps["modelShortcutEfforts"];
  onModelSelect: PromptInputProps["onModelSelect"];
  focusComposer: () => void;
  valueRef: RefObject<string>;
  promptEditorRef: RefObject<PromptLexicalEditorHandle | null>;
}) {
  const {
    interactionsDisabled,
    windowShortcutsEnabled,
    modelOptions,
    modelShortcutKeys,
    modelShortcutEfforts,
    onModelSelect,
    focusComposer,
    valueRef,
    promptEditorRef,
  } = args;
  const [modelSelectorOpenNonce, setModelSelectorOpenNonce] = useState(0);
  const [modelSelectorOpenRequest, setModelSelectorOpenRequest] = useState<ModelSelectorOpenRequest | undefined>(undefined);
  // "Assign to an agent…" opens the selector on its Agents section.
  const agentSelectorNonce = useAgentsUiStore((state) => state.agentSelectorNonce);
  const handledAgentSelectorNonce = useRef(agentSelectorNonce);
  const [agentsOpenToken, setAgentsOpenToken] = useState<number | undefined>(undefined);
  // See `isShortcutEchoInsertion`: a claimed Option chord can still leak one
  // composed character into the editor, so claiming one arms a brief guard that
  // rejects exactly that insertion and re-syncs the editor from `value`.
  const shortcutEchoGuardRef = useRef<{
    value: string;
    expiresAt: number;
  } | null>(null);

  const armShortcutEchoGuard = useCallback(() => {
    shortcutEchoGuardRef.current = {
      value: valueRef.current,
      expiresAt: Date.now() + SHORTCUT_ECHO_GUARD_WINDOW_MS,
    };
  }, []);

  const handleModelShortcut = useCallback(
    (event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>) => {
      if (
        event.defaultPrevented ||
        interactionsDisabled ||
        !windowShortcutsEnabled
      ) {
        return false;
      }

      const modelShortcutSlot = resolveModelShortcutSlot({
        key: event.key,
        code: event.code,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      });
      if (modelShortcutSlot === null) {
        return false;
      }

      const shortcutOption = findModelShortcutOption({
        slotIndex: modelShortcutSlot,
        shortcutKeys: modelShortcutKeys,
        options: modelOptions,
      });
      if (!shortcutOption) {
        return false;
      }

      event.preventDefault();
      armShortcutEchoGuard();
      onModelSelect({
        selection: shortcutOption,
        effort: findModelShortcutEffort({
          slotIndex: modelShortcutSlot,
          shortcutKeys: modelShortcutKeys,
          shortcutEfforts: modelShortcutEfforts,
        }),
      });
      window.requestAnimationFrame(() => focusComposer());
      return true;
    },
    [
      armShortcutEchoGuard,
      focusComposer,
      interactionsDisabled,
      modelOptions,
      modelShortcutEfforts,
      modelShortcutKeys,
      onModelSelect,
      windowShortcutsEnabled,
    ],
  );

  // Settings > Accounts ("Pick a model", "Use in Codex") opens this selector.
  // The frame delay lets Settings close first, so the popover is not behind it.
  useEffect(() => {
    if (interactionsDisabled || !windowShortcutsEnabled) return;
    let frame = 0;
    const onOpenModelSelector = (event: Event) => {
      const detail = (event as CustomEvent<{ providerId?: string; group?: string }>).detail;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const known = listProviderIds().find((candidate) => candidate === detail?.providerId);
        setModelSelectorOpenRequest(known ? { providerId: known, ...(detail?.group ? { group: detail.group } : {}) } : undefined);
        setModelSelectorOpenNonce((current) => current + 1);
      });
    };
    window.addEventListener(STAVE_OPEN_MODEL_SELECTOR_EVENT, onOpenModelSelector);
    // Settings asks whether a composer can take the request before sending it.
    const unregister = registerComposerModelSelectorReceiver();
    return () => {
      unregister();
      window.cancelAnimationFrame(frame);
      window.removeEventListener(STAVE_OPEN_MODEL_SELECTOR_EVENT, onOpenModelSelector);
    };
  }, [interactionsDisabled, windowShortcutsEnabled]);

  useEffect(() => {
    if (agentSelectorNonce === handledAgentSelectorNonce.current) return;
    handledAgentSelectorNonce.current = agentSelectorNonce;
    if (interactionsDisabled || !windowShortcutsEnabled) return;
    setAgentsOpenToken(agentSelectorNonce);
  }, [agentSelectorNonce, interactionsDisabled, windowShortcutsEnabled]);

  useEffect(() => {
    if (interactionsDisabled || !windowShortcutsEnabled) {
      return;
    }

    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const hasMod = event.ctrlKey || event.metaKey;
      if (
        hasMod &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key.toLowerCase() === "l" || event.key.toLowerCase() === "j")
      ) {
        const rootElement = promptEditorRef.current?.getRootElement();
        if (
          !rootElement ||
          (document.activeElement &&
            rootElement.contains(document.activeElement))
        ) {
          return;
        }
        event.preventDefault();
        focusComposer();
        return;
      }

      const isAltP =
        !event.ctrlKey &&
        !event.metaKey &&
        event.altKey &&
        !event.shiftKey &&
        (event.code === "KeyP" || event.key.toLowerCase() === "p");
      if (isAltP) {
        event.preventDefault();
        armShortcutEchoGuard();
        setModelSelectorOpenRequest(undefined);
        setModelSelectorOpenNonce((current) => current + 1);
        return;
      }

      handleModelShortcut(event);
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [
    armShortcutEchoGuard,
    focusComposer,
    handleModelShortcut,
    interactionsDisabled,
    windowShortcutsEnabled,
  ]);

  return {
    modelSelectorOpenNonce,
    modelSelectorOpenRequest,
    agentsOpenToken,
    shortcutEchoGuardRef,
    handleModelShortcut,
  };
}
