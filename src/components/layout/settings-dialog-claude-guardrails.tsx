import { I18N_NAMESPACES, useTranslation, type I18nKey } from "@/i18n";
import { useShallow } from "zustand/react/shallow";
import {
  agentModeClaudeGuardrails,
  normalizeClaudeGuardrails,
  type ClaudeGuardrailId,
} from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";
import { SwitchField } from "./settings-dialog.shared";

const GUARDRAIL_FIELDS = [
  {
    id: "G1",
    titleKey: "settingsProviders:claudeGuardrails.writesOutsideRepo.title",
    descriptionKey:
      "settingsProviders:claudeGuardrails.writesOutsideRepo.description",
  },
  {
    id: "G2",
    titleKey: "settingsProviders:claudeGuardrails.credentials.title",
    descriptionKey: "settingsProviders:claudeGuardrails.credentials.description",
  },
  {
    id: "G3",
    titleKey: "settingsProviders:claudeGuardrails.remoteActions.title",
    descriptionKey:
      "settingsProviders:claudeGuardrails.remoteActions.description",
  },
] as const satisfies ReadonlyArray<{
  id: ClaudeGuardrailId;
  titleKey: I18nKey;
  descriptionKey: I18nKey;
}>;

/**
 * Stave's guardrails for Claude turns in Agent mode (a task that runs as an
 * Agent, and the helpers it delegates). All on by default; each switch turns
 * one off. Chat turns never run them, whatever their permission mode.
 */
export function ClaudeGuardrailFields() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const enabled = useAppStore(
    useShallow((state) => agentModeClaudeGuardrails(state.settings.claudeGuardrails)),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  return (
    <>
      {GUARDRAIL_FIELDS.map((field) => (
        <SwitchField
          key={field.id}
          title={t(field.titleKey)}
          description={t(field.descriptionKey)}
          checked={enabled.includes(field.id)}
          onCheckedChange={(checked) =>
            updateSettings({
              patch: {
                claudeGuardrails: normalizeClaudeGuardrails(
                  checked
                    ? [...enabled, field.id]
                    : enabled.filter((id) => id !== field.id),
                ),
              },
            })
          }
        />
      ))}
    </>
  );
}
