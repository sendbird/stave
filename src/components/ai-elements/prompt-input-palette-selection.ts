import { type RefObject, useRef } from "react";
import type { CommandPaletteItem, SlashCommandTokenMatch } from "@/lib/commands";
import {
  getActiveSlashCommandTokenMatch,
  replaceSlashCommandToken,
} from "@/lib/commands";
import {
  getActiveSkillTokenMatch,
  replaceSkillToken,
} from "@/lib/skills/catalog";
import type { SkillCatalogEntry, SkillTokenMatch } from "@/lib/skills/types";
import { getActiveMacroTokenMatch } from "@/lib/macros/token";
import type { Macro, MacroTokenMatch } from "@/lib/macros/types";
import { isAssignPaletteEntry } from "@/components/session/assign-palette-entry";
import { useAgentsUiStore } from "@/store/agents-ui-store";
import {
  getActiveWorkspaceInformationTokenMatch,
  replaceWorkspaceInformationToken,
  type WorkspaceInformationReferenceOption,
} from "@/lib/workspace-information-references";
import { NO_COMMAND_SELECTION } from "./prompt-input.utils";
import type { MentionPaletteItem } from "./prompt-input-mentions";
import type { PromptInputPaletteState } from "./prompt-input-palette-state";
import type { PromptInputProps } from "./prompt-input.types";

type WorkspaceInformationTokenMatch = NonNullable<
  ReturnType<typeof getActiveWorkspaceInformationTokenMatch>
>;

/**
 * Applies a palette pick to the draft: resolves the token the pick replaces
 * (the one remembered on mouse down, the live one at the caret, or the active
 * one), rewrites the draft, dismisses the palette and restores the caret.
 */
export function usePromptInputPaletteSelection(args: {
  palette: PromptInputPaletteState;
  valueRef: RefObject<string>;
  onValueChange: (value: string) => void;
  onMacroSelect: PromptInputProps["onMacroSelect"];
  onAttachTask: PromptInputProps["onAttachTask"];
  onAttachDocument: PromptInputProps["onAttachDocument"];
  getLiveCaretIndex: (currentValue: string) => number;
  restoreComposerSelection: (nextCaretIndex: number) => void;
}) {
  const {
    valueRef,
    onValueChange,
    onMacroSelect,
    onAttachTask,
    onAttachDocument,
    getLiveCaretIndex,
    restoreComposerSelection,
  } = args;
  const {
    activePalette,
    activeCommandToken,
    activeSkillToken,
    activeMacroToken,
    activeWorkspaceInformationToken,
    setSuppressedAutocompleteValue,
    setDismissedCommandToken,
    setSelectedCommandIndex,
    setDismissedSkillToken,
    setSelectedSkillIndex,
    setDismissedMacroToken,
    setSelectedMacroIndex,
    setDismissedWorkspaceInformationToken,
    setSelectedWorkspaceInformationIndex,
  } = args.palette;
  const pendingCommandTokenRef = useRef<SlashCommandTokenMatch | null>(null);
  const pendingSkillTokenRef = useRef<SkillTokenMatch | null>(null);
  const pendingMacroTokenRef = useRef<MacroTokenMatch | null>(null);
  const pendingWorkspaceInformationTokenRef =
    useRef<WorkspaceInformationTokenMatch | null>(null);

  function isCurrentTokenMatch(
    currentValue: string,
    match:
      | SlashCommandTokenMatch
      | SkillTokenMatch
      | WorkspaceInformationTokenMatch
      | null,
  ) {
    return Boolean(
      match &&
      match.start >= 0 &&
      match.end <= currentValue.length &&
      currentValue.slice(match.start, match.end) === match.token,
    );
  }

  function resolveCommandTokenSelection() {
    const currentValue = valueRef.current;
    const pendingToken = pendingCommandTokenRef.current;
    if (isCurrentTokenMatch(currentValue, pendingToken)) {
      return pendingToken;
    }
    const liveToken = getActiveSlashCommandTokenMatch({
      value: currentValue,
      caretIndex: getLiveCaretIndex(currentValue),
    });
    if (liveToken) {
      return liveToken;
    }
    if (isCurrentTokenMatch(currentValue, activeCommandToken)) {
      return activeCommandToken;
    }
    return getActiveSlashCommandTokenMatch({
      value: currentValue,
      caretIndex: currentValue.length,
    });
  }

  function resolveSkillTokenSelection() {
    const currentValue = valueRef.current;
    const pendingToken = pendingSkillTokenRef.current;
    if (isCurrentTokenMatch(currentValue, pendingToken)) {
      return pendingToken;
    }
    const liveToken = getActiveSkillTokenMatch({
      value: currentValue,
      caretIndex: getLiveCaretIndex(currentValue),
    });
    if (liveToken) {
      return liveToken;
    }
    if (isCurrentTokenMatch(currentValue, activeSkillToken)) {
      return activeSkillToken;
    }
    return getActiveSkillTokenMatch({
      value: currentValue,
      caretIndex: currentValue.length,
    });
  }

  function resolveMacroTokenSelection() {
    const currentValue = valueRef.current;
    const pendingToken = pendingMacroTokenRef.current;
    if (isCurrentTokenMatch(currentValue, pendingToken)) {
      return pendingToken;
    }
    const liveToken = getActiveMacroTokenMatch({
      value: currentValue,
      caretIndex: getLiveCaretIndex(currentValue),
    });
    if (liveToken) {
      return liveToken;
    }
    if (isCurrentTokenMatch(currentValue, activeMacroToken)) {
      return activeMacroToken;
    }
    return getActiveMacroTokenMatch({
      value: currentValue,
      caretIndex: currentValue.length,
    });
  }

  function resolveWorkspaceInformationTokenSelection() {
    const currentValue = valueRef.current;
    const pendingToken = pendingWorkspaceInformationTokenRef.current;
    if (isCurrentTokenMatch(currentValue, pendingToken)) {
      return pendingToken;
    }
    const liveToken = getActiveWorkspaceInformationTokenMatch({
      text: currentValue,
      caretIndex: getLiveCaretIndex(currentValue),
    });
    if (liveToken) {
      return liveToken;
    }
    if (isCurrentTokenMatch(currentValue, activeWorkspaceInformationToken)) {
      return activeWorkspaceInformationToken;
    }
    return getActiveWorkspaceInformationTokenMatch({
      text: currentValue,
      caretIndex: currentValue.length,
    });
  }

  function rememberActivePaletteTokenSelection() {
    const currentValue = valueRef.current;
    const caretPosition = getLiveCaretIndex(currentValue);
    pendingCommandTokenRef.current =
      activePalette === "command"
        ? (getActiveSlashCommandTokenMatch({
            value: currentValue,
            caretIndex: caretPosition,
          }) ?? activeCommandToken)
        : null;
    pendingSkillTokenRef.current =
      activePalette === "skill"
        ? (getActiveSkillTokenMatch({
            value: currentValue,
            caretIndex: caretPosition,
          }) ?? activeSkillToken)
        : null;
    pendingMacroTokenRef.current =
      activePalette === "macro"
        ? (getActiveMacroTokenMatch({
            value: currentValue,
            caretIndex: caretPosition,
          }) ?? activeMacroToken)
        : null;
    pendingWorkspaceInformationTokenRef.current =
      activePalette === "info"
        ? (getActiveWorkspaceInformationTokenMatch({
            text: currentValue,
            caretIndex: caretPosition,
          }) ?? activeWorkspaceInformationToken)
        : null;
  }

  function applyCommandSelection(item: CommandPaletteItem) {
    const match = resolveCommandTokenSelection();
    pendingCommandTokenRef.current = null;
    if (!match) {
      return;
    }
    const currentValue = valueRef.current;
    const nextValue = replaceSlashCommandToken({
      value: currentValue,
      match,
      command: item,
    });
    const nextCaretIndex = match.start + item.command.length + 1;
    valueRef.current = nextValue;
    onValueChange(nextValue);
    setSuppressedAutocompleteValue({ palette: "command", value: nextValue });
    setDismissedCommandToken(item.command);
    setSelectedCommandIndex(NO_COMMAND_SELECTION);
    restoreComposerSelection(nextCaretIndex);
  }

  function applySkillSelection(item: SkillCatalogEntry) {
    const match = resolveSkillTokenSelection();
    pendingSkillTokenRef.current = null;
    if (!match) {
      return;
    }
    const currentValue = valueRef.current;
    const nextValue = replaceSkillToken({
      value: currentValue,
      match,
      skill: item,
    });
    const nextCaretIndex = match.start + item.slug.length + 2;
    valueRef.current = nextValue;
    onValueChange(nextValue);
    setSuppressedAutocompleteValue({ palette: "skill", value: nextValue });
    setDismissedSkillToken(`$${item.slug}`);
    setSelectedSkillIndex(NO_COMMAND_SELECTION);
    restoreComposerSelection(nextCaretIndex);
  }

  function applyMacroSelection(item: Macro) {
    const match = resolveMacroTokenSelection();
    pendingMacroTokenRef.current = null;
    if (isAssignPaletteEntry(item)) {
      // The rest of the draft becomes the assignment; the token goes away.
      const currentValue = valueRef.current;
      const nextValue = match
        ? `${currentValue.slice(0, match.start)}${currentValue.slice(match.end)}`.trim()
        : currentValue;
      valueRef.current = nextValue;
      onValueChange(nextValue);
      setSuppressedAutocompleteValue({ palette: "macro", value: nextValue });
      setDismissedMacroToken(match?.token ?? `!${item.slug}`);
      setSelectedMacroIndex(NO_COMMAND_SELECTION);
      useAgentsUiStore.getState().openKickoffWithAgent({ text: nextValue });
      return;
    }
    if (!onMacroSelect) {
      return;
    }
    const currentValue = valueRef.current;
    const result = onMacroSelect({
      macro: item,
      match,
      draftText: currentValue,
    });
    if (!result) {
      return;
    }
    valueRef.current = result.text;
    setSuppressedAutocompleteValue({ palette: "macro", value: result.text });
    setDismissedMacroToken(match?.token ?? `!${item.slug}`);
    setSelectedMacroIndex(NO_COMMAND_SELECTION);
    if (result.instantRun) {
      // The host already adopted the expanded draft and started the send.
      // Skip onValueChange so a pending draft save cannot restore the text.
      return;
    }
    onValueChange(result.text);
    restoreComposerSelection(result.caretIndex);
  }

  function applyMentionSelection(item: MentionPaletteItem) {
    if (item.kind === "information") {
      applyWorkspaceInformationSelection(item.option);
      return;
    }
    const match = resolveWorkspaceInformationTokenSelection();
    pendingWorkspaceInformationTokenRef.current = null;
    if (!match) {
      return;
    }
    // The task or document becomes a chip under the prompt, so the typed `@query` goes.
    const currentValue = valueRef.current;
    const nextValue = `${currentValue.slice(0, match.start)}${currentValue
      .slice(match.end)
      .replace(/^ /, "")}`;
    valueRef.current = nextValue;
    onValueChange(nextValue);
    setSuppressedAutocompleteValue({ palette: "info", value: nextValue });
    setDismissedWorkspaceInformationToken(null);
    setSelectedWorkspaceInformationIndex(NO_COMMAND_SELECTION);
    if (item.kind === "document") {
      onAttachDocument?.(item.option);
    } else {
      onAttachTask?.(item.option);
    }
    restoreComposerSelection(match.start);
  }

  function applyWorkspaceInformationSelection(
    item: WorkspaceInformationReferenceOption,
  ) {
    const match = resolveWorkspaceInformationTokenSelection();
    pendingWorkspaceInformationTokenRef.current = null;
    if (!match) {
      return;
    }
    const currentValue = valueRef.current;
    const nextValue = replaceWorkspaceInformationToken({
      text: currentValue,
      match,
      reference: item.reference,
    });
    const nextCaretIndex = match.start + item.reference.token.length + 1;
    valueRef.current = nextValue;
    onValueChange(nextValue);
    setSuppressedAutocompleteValue({ palette: "info", value: nextValue });
    setDismissedWorkspaceInformationToken(item.reference.token);
    setSelectedWorkspaceInformationIndex(NO_COMMAND_SELECTION);
    restoreComposerSelection(nextCaretIndex);
  }

  return {
    rememberActivePaletteTokenSelection,
    applyCommandSelection,
    applySkillSelection,
    applyMacroSelection,
    applyMentionSelection,
    applyWorkspaceInformationSelection,
  };
}

export type PromptInputPaletteSelection = ReturnType<
  typeof usePromptInputPaletteSelection
>;
