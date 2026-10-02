import { useShallow } from "zustand/react/shallow";
import {
  normalizeClaudeGuardrails,
  type ClaudeGuardrailId,
} from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";
import { SwitchField } from "./settings-dialog.shared";

const GUARDRAIL_FIELDS: ReadonlyArray<{
  id: ClaudeGuardrailId;
  title: string;
  description: string;
}> = [
  {
    id: "G1",
    title: "Ask Before Writes Outside the Repository",
    description:
      "Auto and Bypass turns stop before writing outside this repository's checkouts and worktrees. Temp folders and tool caches stay allowed.",
  },
  {
    id: "G2",
    title: "Ask Before Touching Credentials",
    description:
      "Auto and Bypass turns stop before reading or writing ~/.ssh, ~/.aws, ~/.npmrc and similar files, or the protected paths and variables below.",
  },
  {
    id: "G3",
    title: "Ask Before Irreversible Remote Actions",
    description:
      "Auto and Bypass turns stop before force-pushing a default or protected branch, deleting remote refs, publishing a package or release, or running sudo.",
  },
];

/**
 * Stave's opt-in guardrails for autonomous Claude turns (Auto, Bypass, and
 * tasks that run as an Agent). All off by default; each switch adds one.
 */
export function ClaudeGuardrailFields() {
  const enabled = useAppStore(
    useShallow((state) => normalizeClaudeGuardrails(state.settings.claudeGuardrails)),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  return (
    <>
      {GUARDRAIL_FIELDS.map((field) => (
        <SwitchField
          key={field.id}
          title={field.title}
          description={field.description}
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
