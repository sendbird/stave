import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { CommandPaletteItem, CommandPaletteProviderNote } from "@/lib/commands";
import {
  filterCommandPaletteItems,
  getActiveSlashCommandTokenMatch,
} from "@/lib/commands";
import {
  filterSkillEntries,
  getActiveSkillTokenMatch,
} from "@/lib/skills/catalog";
import type { SkillCatalogEntry } from "@/lib/skills/types";
import {
  filterMacroEntries,
  getActiveMacroTokenMatch,
} from "@/lib/macros/token";
import type { Macro } from "@/lib/macros/types";
import { ASSIGN_PALETTE_ENTRY } from "@/components/session/assign-palette-entry";
import {
  getActiveWorkspaceInformationTokenMatch,
  type WorkspaceInformationReferenceOption,
} from "@/lib/workspace-information-references";
import type { DocumentMentionOption } from "@/lib/documents/attached-document-context";
import type { TaskMentionOption } from "@/lib/task-context/attached-task-context";
import { NO_COMMAND_SELECTION } from "./prompt-input.utils";
import { buildMentionPaletteItems } from "./prompt-input-mentions";
import type { ModelSelectorOption } from "./model-selector";

const PALETTE_ITEM_INDEX_ATTRIBUTE = "data-palette-index";

function getPaletteItemSelector(index: number) {
  return `[${PALETTE_ITEM_INDEX_ATTRIBUTE}="${index}"]`;
}

/**
 * State for the composer's four autocomplete palettes (`/` commands, `$`
 * skills, `!` macros and `@` mentions): which token is active at the caret,
 * the filtered and grouped items, which palette is open, the keyboard
 * selection in each, and the effects that reset, clamp and scroll that
 * selection.
 */
export function usePromptInputPaletteState(args: {
  value: string;
  caretIndex: number;
  selectedModel: ModelSelectorOption;
  commandPaletteItems?: readonly CommandPaletteItem[];
  commandPaletteProviderNote?: CommandPaletteProviderNote;
  skillsEnabled?: boolean;
  skillsAutoSuggest?: boolean;
  skillPaletteItems?: readonly SkillCatalogEntry[];
  macros?: readonly Macro[];
  workspaceInformationReferenceOptions?: readonly WorkspaceInformationReferenceOption[];
  taskMentionOptions?: readonly TaskMentionOption[];
  documentMentionOptions?: readonly DocumentMentionOption[];
}) {
  const {
    value,
    caretIndex,
    selectedModel,
    commandPaletteItems,
    commandPaletteProviderNote,
    skillsEnabled,
    skillsAutoSuggest,
    skillPaletteItems,
    macros,
    workspaceInformationReferenceOptions,
    taskMentionOptions,
    documentMentionOptions,
  } = args;
  const [dismissedCommandToken, setDismissedCommandToken] = useState<
    string | null
  >(null);
  const [suppressedAutocompleteValue, setSuppressedAutocompleteValue] =
    useState<{
      palette: "command" | "skill" | "info" | "macro";
      value: string;
    } | null>(null);
  const [selectedCommandIndex, setSelectedCommandIndex] =
    useState(NO_COMMAND_SELECTION);
  const [dismissedSkillToken, setDismissedSkillToken] = useState<string | null>(
    null,
  );
  const [selectedSkillIndex, setSelectedSkillIndex] =
    useState(NO_COMMAND_SELECTION);
  const [dismissedMacroToken, setDismissedMacroToken] = useState<string | null>(
    null,
  );
  const [selectedMacroIndex, setSelectedMacroIndex] =
    useState(NO_COMMAND_SELECTION);
  const [
    dismissedWorkspaceInformationToken,
    setDismissedWorkspaceInformationToken,
  ] = useState<string | null>(null);
  const [
    selectedWorkspaceInformationIndex,
    setSelectedWorkspaceInformationIndex,
  ] = useState(NO_COMMAND_SELECTION);
  const commandListRef = useRef<HTMLDivElement | null>(null);
  const activeCommandToken = useMemo(
    () =>
      getActiveSlashCommandTokenMatch({
        value,
        caretIndex,
      }),
    [caretIndex, value],
  );
  const deferredCommandQuery = useDeferredValue(
    activeCommandToken?.query ?? "",
  );
  const activeSkillToken = useMemo(
    () =>
      skillsEnabled
        ? getActiveSkillTokenMatch({
            value,
            caretIndex,
          })
        : null,
    [caretIndex, skillsEnabled, value],
  );
  const activeWorkspaceInformationToken = useMemo(
    () =>
      getActiveWorkspaceInformationTokenMatch({
        text: value,
        caretIndex,
      }),
    [caretIndex, value],
  );
  const deferredWorkspaceInformationQuery = useDeferredValue(
    activeWorkspaceInformationToken?.query ?? "",
  );
  const filteredCommandItems = useMemo(
    () =>
      filterCommandPaletteItems({
        items: commandPaletteItems ?? [],
        query: deferredCommandQuery,
      }),
    [commandPaletteItems, deferredCommandQuery],
  );
  const filteredSkillItems = useMemo(
    () =>
      filterSkillEntries({
        skills: skillPaletteItems ?? [],
        providerId: selectedModel.providerId,
        query: activeSkillToken?.query ?? "",
      }),
    [activeSkillToken?.query, selectedModel.providerId, skillPaletteItems],
  );
  const activeMacroToken = useMemo(
    () =>
      getActiveMacroTokenMatch({
        value,
        caretIndex,
      }),
    [caretIndex, value],
  );
  const paletteMacros = useMemo(() => [...(macros ?? []), ASSIGN_PALETTE_ENTRY], [macros]);
  const filteredMacroItems = useMemo(
    () =>
      filterMacroEntries({
        macros: paletteMacros,
        query: activeMacroToken?.query ?? "",
      }),
    [activeMacroToken?.query, paletteMacros],
  );
  const filteredWorkspaceInformationItems = useMemo(
    () =>
      buildMentionPaletteItems({
        query: deferredWorkspaceInformationQuery,
        informationOptions: workspaceInformationReferenceOptions ?? [],
        taskOptions: taskMentionOptions ?? [],
        documentOptions: documentMentionOptions ?? [],
      }),
    [
      deferredWorkspaceInformationQuery,
      documentMentionOptions,
      taskMentionOptions,
      workspaceInformationReferenceOptions,
    ],
  );
  const indexedCommandItems = useMemo(
    () => filteredCommandItems.map((item, index) => ({ item, index })),
    [filteredCommandItems],
  );
  const indexedSkillItems = useMemo(
    () => filteredSkillItems.map((item, index) => ({ item, index })),
    [filteredSkillItems],
  );
  const indexedMacroItems = useMemo(
    () => filteredMacroItems.map((item, index) => ({ item, index })),
    [filteredMacroItems],
  );
  const indexedWorkspaceInformationItems = useMemo(
    () =>
      filteredWorkspaceInformationItems.map((item, index) => ({
        item,
        index,
      })),
    [filteredWorkspaceInformationItems],
  );
  const providerCommandItems = useMemo(
    () =>
      indexedCommandItems.filter(
        ({ item }) => item.source === "provider_native",
      ),
    [indexedCommandItems],
  );
  const localSkillItems = useMemo(
    () => indexedSkillItems.filter(({ item }) => item.scope === "local"),
    [indexedSkillItems],
  );
  const userSkillItems = useMemo(
    () => indexedSkillItems.filter(({ item }) => item.scope === "user"),
    [indexedSkillItems],
  );
  const globalSkillItems = useMemo(
    () => indexedSkillItems.filter(({ item }) => item.scope === "global"),
    [indexedSkillItems],
  );
  const workspaceInformationSectionItems = useMemo(
    () =>
      indexedWorkspaceInformationItems.flatMap(({ item, index }) =>
        item.kind === "information" && item.option.kind === "section"
          ? [{ item: item.option, index }]
          : [],
      ),
    [indexedWorkspaceInformationItems],
  );
  const taskMentionItems = useMemo(
    () =>
      indexedWorkspaceInformationItems.flatMap(({ item, index }) =>
        item.kind === "task" ? [{ item: item.option, index }] : [],
      ),
    [indexedWorkspaceInformationItems],
  );
  const documentMentionItems = useMemo(
    () =>
      indexedWorkspaceInformationItems.flatMap(({ item, index }) =>
        item.kind === "document" ? [{ item: item.option, index }] : [],
      ),
    [indexedWorkspaceInformationItems],
  );
  const workspaceInformationEntryItems = useMemo(
    () =>
      indexedWorkspaceInformationItems.flatMap(({ item, index }) =>
        item.kind === "information" && item.option.kind === "item"
          ? [{ item: item.option, index }]
          : [],
      ),
    [indexedWorkspaceInformationItems],
  );
  const commandPaletteOpen = Boolean(
    activeCommandToken &&
    !(
      suppressedAutocompleteValue?.palette === "command" &&
      suppressedAutocompleteValue.value === value
    ) &&
    dismissedCommandToken !== activeCommandToken.token &&
    (filteredCommandItems.length > 0 || commandPaletteProviderNote),
  );
  const skillPaletteOpen = Boolean(
    skillsEnabled &&
    skillsAutoSuggest &&
    activeSkillToken &&
    !(
      suppressedAutocompleteValue?.palette === "skill" &&
      suppressedAutocompleteValue.value === value
    ) &&
    dismissedSkillToken !== activeSkillToken.token,
  );
  const workspaceInformationPaletteOpen = Boolean(
    activeWorkspaceInformationToken &&
    !(
      suppressedAutocompleteValue?.palette === "info" &&
      suppressedAutocompleteValue.value === value
    ) &&
    dismissedWorkspaceInformationToken !==
      activeWorkspaceInformationToken.token,
  );
  const macroPaletteOpen = Boolean(
    activeMacroToken &&
    !(
      suppressedAutocompleteValue?.palette === "macro" &&
      suppressedAutocompleteValue.value === value
    ) &&
    dismissedMacroToken !== activeMacroToken.token,
  );
  const activePalette = workspaceInformationPaletteOpen
    ? "info"
    : skillPaletteOpen
      ? "skill"
      : macroPaletteOpen
        ? "macro"
        : commandPaletteOpen
          ? "command"
          : null;
  const paletteValue = useMemo(() => {
    if (
      activePalette === "info" &&
      selectedWorkspaceInformationIndex !== NO_COMMAND_SELECTION
    ) {
      return (
        filteredWorkspaceInformationItems[selectedWorkspaceInformationIndex]
          ?.key ?? ""
      );
    }
    if (
      activePalette === "skill" &&
      selectedSkillIndex !== NO_COMMAND_SELECTION
    ) {
      return filteredSkillItems[selectedSkillIndex]?.slug ?? "";
    }
    if (
      activePalette === "macro" &&
      selectedMacroIndex !== NO_COMMAND_SELECTION
    ) {
      return filteredMacroItems[selectedMacroIndex]?.slug ?? "";
    }
    if (
      activePalette === "command" &&
      selectedCommandIndex !== NO_COMMAND_SELECTION
    ) {
      return filteredCommandItems[selectedCommandIndex]?.command ?? "";
    }
    return "";
  }, [
    activePalette,
    selectedWorkspaceInformationIndex,
    selectedSkillIndex,
    selectedMacroIndex,
    selectedCommandIndex,
    filteredWorkspaceInformationItems,
    filteredSkillItems,
    filteredMacroItems,
    filteredCommandItems,
  ]);

  useEffect(() => {
    if (
      suppressedAutocompleteValue &&
      suppressedAutocompleteValue.value !== value
    ) {
      setSuppressedAutocompleteValue(null);
    }
  }, [suppressedAutocompleteValue, value]);

  useEffect(() => {
    if (
      dismissedCommandToken &&
      activeCommandToken?.token !== dismissedCommandToken
    ) {
      setDismissedCommandToken(null);
    }
  }, [activeCommandToken?.token, dismissedCommandToken]);

  useEffect(() => {
    if (
      dismissedSkillToken &&
      activeSkillToken?.token !== dismissedSkillToken
    ) {
      setDismissedSkillToken(null);
    }
  }, [activeSkillToken?.token, dismissedSkillToken]);

  useEffect(() => {
    if (
      dismissedWorkspaceInformationToken &&
      activeWorkspaceInformationToken?.token !==
        dismissedWorkspaceInformationToken
    ) {
      setDismissedWorkspaceInformationToken(null);
    }
  }, [
    activeWorkspaceInformationToken?.token,
    dismissedWorkspaceInformationToken,
  ]);

  useEffect(() => {
    setSelectedCommandIndex(NO_COMMAND_SELECTION);
  }, [activeCommandToken?.token]);

  useEffect(() => {
    setSelectedSkillIndex(NO_COMMAND_SELECTION);
  }, [activeSkillToken?.token]);

  useEffect(() => {
    setSelectedWorkspaceInformationIndex(NO_COMMAND_SELECTION);
  }, [activeWorkspaceInformationToken?.token]);

  useEffect(() => {
    if (!commandPaletteOpen) {
      setSelectedCommandIndex(NO_COMMAND_SELECTION);
      return;
    }
    setSelectedCommandIndex((current) => {
      if (current === NO_COMMAND_SELECTION) {
        return NO_COMMAND_SELECTION;
      }
      return Math.min(current, Math.max(filteredCommandItems.length - 1, 0));
    });
  }, [commandPaletteOpen, filteredCommandItems.length]);

  useEffect(() => {
    if (!skillPaletteOpen) {
      setSelectedSkillIndex(NO_COMMAND_SELECTION);
      return;
    }
    setSelectedSkillIndex((current) => {
      if (current === NO_COMMAND_SELECTION) {
        return NO_COMMAND_SELECTION;
      }
      return Math.min(current, Math.max(filteredSkillItems.length - 1, 0));
    });
  }, [filteredSkillItems.length, skillPaletteOpen]);

  useEffect(() => {
    if (!macroPaletteOpen) {
      setSelectedMacroIndex(NO_COMMAND_SELECTION);
      return;
    }
    setSelectedMacroIndex((current) => {
      if (current === NO_COMMAND_SELECTION) {
        return NO_COMMAND_SELECTION;
      }
      return Math.min(current, Math.max(filteredMacroItems.length - 1, 0));
    });
  }, [filteredMacroItems.length, macroPaletteOpen]);

  useEffect(() => {
    if (!workspaceInformationPaletteOpen) {
      setSelectedWorkspaceInformationIndex(NO_COMMAND_SELECTION);
      return;
    }
    setSelectedWorkspaceInformationIndex((current) => {
      if (current === NO_COMMAND_SELECTION) {
        return NO_COMMAND_SELECTION;
      }
      return Math.min(
        current,
        Math.max(filteredWorkspaceInformationItems.length - 1, 0),
      );
    });
  }, [
    filteredWorkspaceInformationItems.length,
    workspaceInformationPaletteOpen,
  ]);

  useEffect(() => {
    const list = commandListRef.current;
    if (!list || activePalette === null) {
      return;
    }
    const selectedIndex =
      activePalette === "info"
        ? selectedWorkspaceInformationIndex
        : activePalette === "skill"
          ? selectedSkillIndex
          : activePalette === "macro"
            ? selectedMacroIndex
            : selectedCommandIndex;
    if (selectedIndex === NO_COMMAND_SELECTION) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      const selectedItem = list.querySelector<HTMLElement>(
        getPaletteItemSelector(selectedIndex),
      );
      selectedItem?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    activePalette,
    selectedCommandIndex,
    selectedSkillIndex,
    selectedMacroIndex,
    selectedWorkspaceInformationIndex,
  ]);

  return {
    commandListRef,
    suppressedAutocompleteValue,
    setSuppressedAutocompleteValue,
    setDismissedCommandToken,
    selectedCommandIndex,
    setSelectedCommandIndex,
    setDismissedSkillToken,
    selectedSkillIndex,
    setSelectedSkillIndex,
    setDismissedMacroToken,
    selectedMacroIndex,
    setSelectedMacroIndex,
    setDismissedWorkspaceInformationToken,
    selectedWorkspaceInformationIndex,
    setSelectedWorkspaceInformationIndex,
    activeCommandToken,
    activeSkillToken,
    activeMacroToken,
    activeWorkspaceInformationToken,
    filteredCommandItems,
    filteredSkillItems,
    paletteMacros,
    filteredMacroItems,
    filteredWorkspaceInformationItems,
    indexedMacroItems,
    providerCommandItems,
    localSkillItems,
    userSkillItems,
    globalSkillItems,
    workspaceInformationSectionItems,
    taskMentionItems,
    documentMentionItems,
    workspaceInformationEntryItems,
    activePalette,
    paletteValue,
  };
}

export type PromptInputPaletteState = ReturnType<
  typeof usePromptInputPaletteState
>;
