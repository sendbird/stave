import { create } from "zustand";
import type { SectionId } from "@/components/layout/settings-dialog.schema";
import { STAVE_OPEN_SETTINGS_EVENT } from "@/store/app.store";
import type { AccountsSettingsFocus } from "./accounts-guide";
import { useProviderReadinessStore } from "./provider-readiness-store";

/**
 * A pending deep-link target inside Settings. The open-settings path writes
 * it; the section that owns the target scrolls to it once it renders and
 * clears it. `nonce` lets the same target be requested twice in a row.
 */
export const useSettingsFocusRequest = create<{ focus: string | null; nonce: number }>(() => ({
  focus: null,
  nonce: 0,
}));

export function requestSettingsFocus(focus: string | null) {
  useSettingsFocusRequest.setState((state) => ({ focus, nonce: state.nonce + 1 }));
}

/** Clears the request only if no newer one replaced it meanwhile. */
export function clearSettingsFocus(nonce: number) {
  if (useSettingsFocusRequest.getState().nonce === nonce) {
    useSettingsFocusRequest.setState({ focus: null });
  }
}

function openSettingsSection(section: SectionId, focus?: string) {
  window.dispatchEvent(
    new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
      detail: { section, ...(focus ? { focus } : {}) },
    }),
  );
}

/** Opens Settings > Accounts, at `focus` when given (see `AccountsSettingsFocus`). */
export function openAccountsSettings(focus?: AccountsSettingsFocus) {
  openSettingsSection("accounts", focus);
}

/** "Add an account" lands on Codex's form only when Codex is the CLI Stave found. */
export function preferredAddAccountFocus(): AccountsSettingsFocus {
  const providers = useProviderReadinessStore.getState().providers;
  return providers["claude-code"]?.tool.available === false && providers.codex?.tool.available === true
    ? "codex-add"
    : "claude-code-add";
}

/** Opens Settings > Tooling, where CLI paths and install state live. */
export function openToolingSettings() {
  openSettingsSection("tooling");
}

/**
 * Asks the active composer to open its model selector, on `providerId`'s tab
 * (and `group` there, such as an API connection's) when it has models. The
 * selector keeps the request while that provider is still being checked.
 * Settings closes first, so the selector is not behind it.
 */
export const STAVE_OPEN_MODEL_SELECTOR_EVENT = "stave:open-model-selector";

export function openComposerModelSelector(providerId?: string, group?: string) {
  window.dispatchEvent(
    new CustomEvent(STAVE_OPEN_MODEL_SELECTOR_EVENT, {
      detail: { ...(providerId ? { providerId } : {}), ...(group ? { group } : {}) },
    }),
  );
}
