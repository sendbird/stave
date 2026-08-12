import { Badge } from "@/components/ui";
import { SettingsCard } from "@/components/layout/settings-dialog.shared";
import {
  resolveLocalMcpReadiness,
  useLocalMcpReadiness,
} from "@/lib/local-mcp-readiness";
import {
  getProviderLabel,
  listProviderIds,
} from "@/lib/providers/model-catalog";
import { STAVE_OPEN_SETTINGS_EVENT } from "@/store/app.store";

/**
 * Each knob a delegation carries, and what it does when the agent leaves it
 * out. This is a *reference*, not a form: delegation parameters are per-call by
 * design — a child's authority must be declared by the delegation that creates
 * it, never inherited from the parent or from a global default that the agent
 * cannot see when it decides what to ask for.
 */
const DELEGATION_PARAMETERS: ReadonlyArray<{
  name: string;
  required: boolean;
  detail: string;
}> = [
  {
    name: "provider",
    required: true,
    detail:
      "Claude or Codex. Never inherited, so a delegation always states which model family it wants.",
  },
  {
    name: "permissionProfile",
    required: true,
    detail:
      "auto · guided · manual. Never inherited: a child cannot quietly gain the parent's authority.",
  },
  {
    name: "lifecycle",
    required: true,
    detail:
      "one-turn ends the delegation when the child's first turn ends; detached keeps the child open until stopped.",
  },
  {
    name: "workspace",
    required: true,
    detail:
      "Same workspace, or a new worktree on its own branch for work that must stay isolated.",
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
      "low → max (Codex also has ultra), clamped to what the child's model accepts. Defaults to medium. A bounded brief often does better on a cheaper model at high effort.",
  },
];

/**
 * Delegation is the one capability here with no arming control: the agent
 * decides to delegate, mid-turn, from the tools it was given. That makes it
 * invisible until it happens — a user who never hears the words "child task"
 * has no way to learn the feature exists, and no way to tell a broken Local MCP
 * link from an agent that simply chose not to delegate.
 *
 * So this card is deliberately read-only. It answers the two questions the
 * absent UI leaves open: what can be asked for, and would it work right now.
 */
export function SettingsDelegationSection() {
  const providerIds = listProviderIds();
  const { status } = useLocalMcpReadiness({
    // No task context here, so readiness is resolved per provider below rather
    // than for one "current" primary.
    primaryProviderId: "claude-code",
  });
  const readinessByProvider = providerIds.map((providerId) => ({
    providerId,
    readiness: resolveLocalMcpReadiness({ status, primaryProviderId: providerId }),
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
      title="Delegation (child tasks)"
      description="Let a task hand durable work to a child Stave task — its own workspace, conversation and permissions, recorded on the run ledger and able to survive a restart. Unlike Worker mode, a child outlives the turn that created it."
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
        className="rounded-lg border border-border/70 bg-muted/20 px-3.5 py-3 text-xs leading-5 text-muted-foreground"
      >
        <p className="font-medium text-foreground">Availability</p>
        <ul className="mt-1 space-y-1">
          {readinessByProvider.map((entry) => (
            <li key={entry.providerId}>
              <span className="text-foreground">
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
        <p className="mt-2">
          Delegation and Advisor consults both reach the model as Local MCP
          tools, so a task can only delegate while that server is running.
        </p>
        <button
          type="button"
          data-testid="delegation-open-developer-settings"
          className="mt-1 text-left underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
                detail: { section: "developer" },
              }),
            );
          }}
        >
          Open Settings → Developer → Local MCP.
        </button>
      </div>

      <div className="rounded-lg border border-border/70 bg-muted/20 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
        <p className="font-medium text-foreground">
          Asking for one, and what you can specify
        </p>
        <p className="mt-1">
          There is no button: delegation happens when an agent calls
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">
            stave_delegate_task
          </code>
          during its turn, so you steer it by asking — for example{" "}
          <span className="text-foreground">
            &ldquo;delegate the docs review to a Codex child task in a new
            worktree, guided permissions, one turn, at high effort&rdquo;
          </span>
          . Every parameter below is per delegation; Stave keeps no global
          default, because a child&apos;s provider and permissions must be
          declared by the request that creates it rather than inherited.
        </p>
        <ul className="mt-2 space-y-1">
          {DELEGATION_PARAMETERS.map((parameter) => (
            <li key={parameter.name}>
              <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">
                {parameter.name}
              </code>{" "}
              <span className="text-[10px] uppercase tracking-[0.08em]">
                {parameter.required ? "required" : "optional"}
              </span>{" "}
              — {parameter.detail}
            </li>
          ))}
        </ul>
        <p className="mt-2">
          Once a delegation starts, its child appears in the task&apos;s turn
          activity with Open, Follow-up, Stop, Detach and Retry controls.
        </p>
      </div>
    </SettingsCard>
  );
}
