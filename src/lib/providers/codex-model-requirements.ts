import { i18n } from "@/i18n/runtime";
// i18n-ignore: canonical English guidance retained for compatibility; UI/runtime use locale-aware getters
export const CODEX_MODEL_UPDATE_GUIDANCE = "Update Codex using its original installation method, then retry. For npm installs, run `npm install -g @openai/codex@latest`; for Homebrew, run `brew upgrade --cask codex`.";
// i18n-ignore: diagnostic guidance compatibility; UI uses the locale-aware helper below
export const CODEX_MODEL_AVAILABILITY_GUIDANCE = "Model availability depends on your Codex version and account. A catalog entry does not confirm runtime support. " + CODEX_MODEL_UPDATE_GUIDANCE;

export function getCodexModelUpdateGuidance() { return i18n.t("providers:messages.codexUpdate"); }
export function getCodexModelAvailabilityGuidance() { return i18n.t("providers:messages.codexAvailability"); }
