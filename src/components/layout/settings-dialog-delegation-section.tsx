import { Badge } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { SettingsCard } from "@/components/layout/settings-dialog.shared";
import { delegationStyles } from "./settings-dialog-delegation-section.styles";
import {
  resolveLocalMcpReadiness,
  useLocalMcpReadiness,
} from "@/lib/local-mcp-readiness";
import {
  getProviderLabel,
  listProviderIdsForCapability,
} from "@/lib/providers/model-catalog";
import { STAVE_OPEN_SETTINGS_EVENT } from "@/store/app.store";

/**
 * Each knob a delegation carries, and what it does when the agent leaves it
 * out. This is a *reference*, not a form: delegation parameters are per call,
 * and what a call leaves out follows the delegating task — its provider,
 * effort and permissions, which the agent can see — never a global default
 * hidden from the agent when it decides what to ask for.
 */
const DELEGATION_PARAMETERS: ReadonlyArray<{
  name: string;
  required: boolean;
  detail: string;
}> = [
  {
    name: "prompt",
    required: true,
    detail: "What the child should do.",
  },
  {
    name: "access",
    required: false,
    detail:
      "read-only for second opinions, reviews and research: the child cannot change files, needs no approvals, and runs beside other work in the same workspace. Defaults to inherit: this task's permissions on the same provider, otherwise that provider's user settings.",
  },
  {
    name: "provider",
    required: false,
    detail: "Claude or Codex. Defaults to this task's provider.",
  },
  {
    name: "lifecycle",
    required: false,
    detail:
      "Defaults to one-turn, which ends the delegation when the child's first turn ends; detached keeps the child open until stopped.",
  },
  {
    name: "workspace",
    required: false,
    detail:
      "Defaults to the same workspace. A new worktree on its own branch keeps edits isolated.",
  },
  {
    name: "model",
    required: false,
    detail: "Defaults to the child provider's default model.",
  },
  {
    name: "effort",
    required: false,
    detail:
      "low → max (Codex also has ultra), clamped to what the child's model accepts. Defaults to this task's effort on the same provider, otherwise medium. A bounded brief often does better on a cheaper model at high effort.",
  },
];

/**
 * Delegation is the one capability here with no arming control: the agent
 * decides to delegate, mid-turn, from the tools it was given. That makes it
 * invisible until it happens — a user who never hears the words "delegated task"
 * has no way to learn the feature exists, and no way to tell a broken Local MCP
 * link from an agent that simply chose not to delegate.
 *
 * So this card is deliberately read-only. It answers the two questions the
 * absent UI leaves open: what can be asked for, and would it work right now.
 */
export function SettingsDelegationSection() {
  const providerIds = listProviderIdsForCapability({
    capability: "unattendedRuns",
  });
  const { status } = useLocalMcpReadiness({
    // No task context here, so readiness is resolved per provider below rather
    // than for one "current" primary.
    primaryProviderId: "claude-code",
  });
  const readinessByProvider = providerIds.map((providerId) => ({
    providerId,
    readiness: resolveLocalMcpReadiness({
      status,
      primaryProviderId: providerId,
    }),
  }));
  const blocked = readinessByProvider.filter(
    (entry) => entry.readiness.state === "unavailable",
  );
  const unknown = readinessByProvider.some(
    (entry) => entry.readiness.state === "unknown",
  );

  return (
    <SettingsCard
      id="settings-field-delegation"
      tabIndex={-1}
      title="Delegated tasks"
      description="An agent can hand work to a new Stave task with its own conversation and permissions, recorded on the run ledger and kept across restarts. There is no switch to turn on: ask the agent to delegate, and this card shows whether it can."
      titleAccessory={
        <Badge
          variant={
            unknown
              ? "outline"
              : blocked.length === providerIds.length
                ? "destructive"
                : blocked.length > 0
                  ? "warning"
                  : "secondary"
          }
        >
          {unknown
            ? "Checking"
            : blocked.length === providerIds.length
              ? "Unavailable"
              : blocked.length > 0
                ? "Partly available"
                : "Available"}
        </Badge>
      }
    >
      <div
        data-testid="delegation-readiness"
        className={sx(delegationStyles.panel)}
      >
        <p className={sx(delegationStyles.panelHeading)}>Availability</p>
        <ul className={sx(delegationStyles.list)}>
          {readinessByProvider.map((entry) => (
            <li key={entry.providerId}>
              <span className={sx(delegationStyles.emphasis)}>
                {getProviderLabel({ providerId: entry.providerId })} tasks:
              </span>{" "}
              {entry.readiness.state === "ready"
                ? "can delegate."
                : entry.readiness.state === "unknown"
                  ? "checking the Local MCP server…"
                  : entry.readiness.detail}
            </li>
          ))}
        </ul>
        <p className={sx(delegationStyles.paragraphSpaced)}>
          Delegation reaches the model as Local MCP tools, so a task can only
          start subagents while that server is running.
        </p>
        <Button
          type="button"
          variant="link"
          flushInline
          data-testid="delegation-open-developer-settings"
          xstyle={delegationStyles.openSettingsLink}
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
                detail: { section: "developer" },
              }),
            );
          }}
        >
          Open Settings → Developer → Local MCP.
        </Button>
      </div>

      <div className={sx(delegationStyles.panel)}>
        <p className={sx(delegationStyles.panelHeading)}>
          Asking for one, and what you can specify
        </p>
        <p className={sx(delegationStyles.paragraphTight)}>
          There is no button: delegation happens when an agent calls
          <code className={sx(delegationStyles.code)}>stave_delegate_task</code>
          during its turn, so you steer it by asking — for example{" "}
          <span className={sx(delegationStyles.emphasis)}>
            &ldquo;get a read-only second opinion on this plan from Codex at
            high effort&rdquo;
          </span>
          . Only the prompt is required: anything a delegation leaves out
          follows this task&apos;s provider, effort and permissions, and the
          child runs one turn in this workspace. Settings holds no global
          default for any of it.
        </p>
        <ul className={sx(delegationStyles.detailList)}>
          {DELEGATION_PARAMETERS.map((parameter) => (
            <li key={parameter.name}>
              <code className={sx(delegationStyles.codeInline)}>
                {parameter.name}
              </code>{" "}
              <span className={sx(delegationStyles.requiredTag)}>
                {parameter.required ? "required" : "optional"}
              </span>{" "}
              — {parameter.detail}
            </li>
          ))}
        </ul>
        <p className={sx(delegationStyles.paragraphSpaced)}>
          Once a delegation starts, its child appears in the task&apos;s turn
          activity with Open, Follow-up, Stop, Detach and Retry controls.
        </p>
      </div>
    </SettingsCard>
  );
}
