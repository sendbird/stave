import { useState } from "react";
import { useSettingsFocusRequest } from "@/lib/providers/accounts-navigation";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useSettingsFocusTarget } from "./settings-focus";

/**
 * Deep-link targets inside Settings > Providers, passed as `focus` with
 * `openSettings({ section: "providers", focus })`. Each is also the element id
 * a Settings search result lands on.
 */
export const PROVIDER_PERMISSIONS_FIELD_ID = {
  "claude-code": "settings-field-claude-permissions",
  codex: "settings-field-codex-permissions",
} as const satisfies Partial<Record<ProviderId, string>>;
export const ACCOUNT_USAGE_LIMIT_FIELD_ID = "settings-field-account-usage-limit";
export const DELEGATION_FIELD_ID = "settings-field-delegation";

const PERMISSIONS_TAB_BY_FIELD_ID = new Map<string, ProviderId>(
  Object.entries(PROVIDER_PERMISSIONS_FIELD_ID).map(([providerId, fieldId]) => [
    fieldId,
    providerId as ProviderId,
  ]),
);
const PROVIDERS_FIELD_IDS: ReadonlySet<string> = new Set([
  ...PERMISSIONS_TAB_BY_FIELD_ID.keys(),
  ACCOUNT_USAGE_LIMIT_FIELD_ID,
  DELEGATION_FIELD_ID,
]);

/**
 * Lands a deep link inside Providers. A provider's permissions live on its
 * tab, so a request for them switches to that tab first; the disclosure there
 * opens itself for the same request (`useCustomizePermissionsOpen`).
 */
export function useProvidersFocusTarget(tab: {
  value: ProviderId;
  providerIds: readonly ProviderId[];
  onValueChange: (next: unknown) => void;
}) {
  const focusTab = useSettingsFocusRequest((state) =>
    state.focus ? (PERMISSIONS_TAB_BY_FIELD_ID.get(state.focus) ?? null) : null,
  );
  // Adjusting state while rendering: React re-renders before committing.
  if (focusTab && focusTab !== tab.value && tab.providerIds.includes(focusTab)) {
    tab.onValueChange(focusTab);
  }
  useSettingsFocusTarget((focus) => (PROVIDERS_FIELD_IDS.has(focus) ? focus : null));
}

/**
 * Open state of a collapsed group of fields that must show itself when it
 * matters: `expand` turning true opens it (the user can still close it
 * afterwards), and so does a pending deep link to `fieldId`.
 */
export function useCustomizePermissionsOpen(args: {
  fieldId: string;
  expand: boolean;
}) {
  const focused = useSettingsFocusRequest(
    (state) => state.focus === args.fieldId,
  );
  const [open, setOpen] = useState(args.expand || focused);
  const [expandedFor, setExpandedFor] = useState(args.expand);
  // Adjusting state while rendering: React re-renders before committing.
  if (args.expand !== expandedFor) {
    setExpandedFor(args.expand);
    if (args.expand && !open) setOpen(true);
  }
  if (focused && !open) setOpen(true);
  return { open, onOpenChange: setOpen };
}
