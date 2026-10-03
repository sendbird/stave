import { useShallow } from "zustand/react/shallow";
import {
  agentModeClaudeGuardrails,
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
      "In Agent mode, stop before writing outside this repository's checkouts and worktrees. Temp folders and tool caches stay allowed. Chat turns never stop for this.",
  },
  {
    id: "G2",
    title: "Ask Before Touching Credentials",
    description:
      "In Agent mode, stop before reading or writing ~/.ssh, ~/.aws, ~/.npmrc and similar files, or the protected paths and variables below. Chat turns never stop for this.",
  },
  {
    id: "G3",
    title: "Ask Before Irreversible Remote Actions",
    description:
      "In Agent mode, stop before force-pushing a default or protected branch, deleting remote refs, publishing a package or release, or running sudo. Chat turns never stop for this.",
  },
];

/**
 * Stave's guardrails for Claude turns in Agent mode (a task that runs as an
 * Agent, and the helpers it delegates). All on by default; each switch turns
 * one off. Chat turns never run them, whatever their permission mode.
 */
export function ClaudeGuardrailFields() {
  const enabled = useAppStore(
    useShallow((state) => agentModeClaudeGuardrails(state.settings.claudeGuardrails)),
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
