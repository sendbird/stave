import { STAVE_OPEN_SETTINGS_EVENT } from "@/store/app.store";

export function openDailyLimitSettings() {
  window.dispatchEvent(new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, { detail: { section: "providers", focus: "daily-limits" } }));
}
