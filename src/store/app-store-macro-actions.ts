import type { StoreApi } from "zustand";
import { applyMacroInsert } from "@/lib/macros/token";
import { buildMacroRuntimeOverrides } from "@/lib/macros/apply";
import { MAX_MACROS, type Macro } from "@/lib/macros/types";
import { normalizeMacro } from "@/lib/macros/normalize";
import type { AppState } from "@/store/app-store.types";

type MacroActionKey =
  | "upsertMacro"
  | "removeMacro"
  | "reorderMacros"
  | "applyMacroToDraft";

type MacroActions = Pick<AppState, MacroActionKey>;
type StoreSet = StoreApi<AppState>["setState"];
type StoreGet = StoreApi<AppState>["getState"];

export function createMacroActions(args: {
  set: StoreSet;
  get: StoreGet;
}): MacroActions {
  const { set, get } = args;

  return {
    upsertMacro: ({ macro }) => {
      const normalized = normalizeMacro(macro);
      if (!normalized) {
        return { ok: false, error: "Macro needs a label and a valid slug." };
      }

      const existing = get().settings.macros;
      const slugOwner = existing.find(
        (candidate) =>
          candidate.slug === normalized.slug && candidate.id !== normalized.id,
      );
      if (slugOwner) {
        return {
          ok: false,
          error: `Slug "${normalized.slug}" is already in use.`,
        };
      }

      const existingIndex = existing.findIndex(
        (candidate) => candidate.id === normalized.id,
      );
      if (existingIndex < 0 && existing.length >= MAX_MACROS) {
        return {
          ok: false,
          error: `Maximum of ${MAX_MACROS} macros reached.`,
        };
      }

      const now = new Date().toISOString();
      const nextMacro: Macro = {
        ...normalized,
        createdAt:
          existingIndex >= 0
            ? (existing[existingIndex]?.createdAt ?? now)
            : (normalized.createdAt || now),
        updatedAt: now,
      };

      set((state) => {
        const macros = state.settings.macros;
        const index = macros.findIndex(
          (candidate) => candidate.id === nextMacro.id,
        );
        const nextMacros =
          index >= 0
            ? macros.map((candidate, candidateIndex) =>
                candidateIndex === index ? nextMacro : candidate,
              )
            : [...macros, nextMacro];
        return {
          settings: {
            ...state.settings,
            macros: nextMacros,
          },
        };
      });
      return { ok: true };
    },
    removeMacro: ({ macroId }) => {
      set((state) => {
        const nextMacros = state.settings.macros.filter(
          (candidate) => candidate.id !== macroId,
        );
        if (nextMacros.length === state.settings.macros.length) {
          return state;
        }
        return {
          settings: {
            ...state.settings,
            macros: nextMacros,
          },
        };
      });
    },
    reorderMacros: ({ orderedIds }) => {
      set((state) => {
        const macros = state.settings.macros;
        const byId = new Map(macros.map((macro) => [macro.id, macro]));
        const nextMacros: Macro[] = [];
        const seen = new Set<string>();
        for (const id of orderedIds) {
          const macro = byId.get(id);
          if (!macro || seen.has(id)) {
            continue;
          }
          seen.add(id);
          nextMacros.push(macro);
        }
        for (const macro of macros) {
          if (!seen.has(macro.id)) {
            nextMacros.push(macro);
          }
        }
        if (
          nextMacros.length === macros.length &&
          nextMacros.every((macro, index) => macro.id === macros[index]?.id)
        ) {
          return state;
        }
        return {
          settings: {
            ...state.settings,
            macros: nextMacros,
          },
        };
      });
    },
    applyMacroToDraft: ({ taskId, macroId, draftText, tokenMatch }) => {
      const state = get();
      const macro = state.settings.macros.find(
        (candidate) => candidate.id === macroId,
      );
      if (!macro) {
        return { ok: false, error: "Macro not found." };
      }

      const currentDraft = state.promptDraftByTask[taskId];
      const sourceText = draftText ?? currentDraft?.text ?? "";
      const expanded = applyMacroInsert({
        draftText: sourceText,
        body: macro.body,
        insertMode: macro.insertMode,
        tokenMatch,
      });

      get().updatePromptDraft({
        taskId,
        patch: {
          text: expanded.text,
          ...(macro.runtime
            ? {
                runtimeOverrides: buildMacroRuntimeOverrides({
                  current: currentDraft?.runtimeOverrides,
                  runtime: macro.runtime,
                }),
              }
            : {}),
        },
      });

      if (macro.runtime) {
        const currentProvider =
          state.tasks.find((task) => task.id === taskId)?.provider ??
          state.draftProvider;
        if (currentProvider !== macro.runtime.providerId) {
          get().setTaskProvider({
            taskId,
            provider: macro.runtime.providerId,
          });
        }
      }

      return {
        ok: true,
        text: expanded.text,
        caretIndex: expanded.caretIndex,
      };
    },
  };
}
