import { AlertCircle, Plus, X } from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
} from "@/components/ui";
import { getHookBlocking, isHookLinked } from "./scripts-manager-state";
import {
  SCRIPT_TRIGGER_METADATA,
  SCRIPT_TRIGGER_IDS,
} from "@/lib/workspace-scripts/constants";
import type {
  ScriptEditorCandidate,
  ScriptEditorHookLink,
  ScriptEditorState,
} from "@/lib/workspace-scripts/editor";
import type { ScriptTrigger } from "@/lib/workspace-scripts/types";

function HookTriggerCard(props: {
  trigger: ScriptTrigger;
  candidates: ScriptEditorCandidate[];
  links: ScriptEditorHookLink[] | undefined;
  onToggleLink: (trigger: ScriptTrigger, candidate: ScriptEditorCandidate, enabled: boolean) => void;
  onToggleBlocking: (trigger: ScriptTrigger, candidate: ScriptEditorCandidate, blocking: boolean) => void;
}) {
  const meta = SCRIPT_TRIGGER_METADATA[props.trigger];
  const linkedCandidates = props.candidates.filter((candidate) => isHookLinked(props.links, candidate));
  const unlinkedCandidates = props.candidates.filter((candidate) => !isHookLinked(props.links, candidate));

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border/70 bg-card/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium text-foreground">{meta.label}</p>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </div>
        <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">
          {linkedCandidates.length}
        </Badge>
      </div>

      {linkedCandidates.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 bg-muted/15 px-3 py-2.5 text-xs text-muted-foreground">
          No scripts assigned yet.
        </p>
      ) : (
        <div className="space-y-1.5">
          {linkedCandidates.map((candidate) => {
            const blocking = getHookBlocking(props.links, candidate);
            return (
              <div
                key={`${candidate.scriptKind}:${candidate.scriptId}`}
                className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/15 px-2.5 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-xs font-medium text-foreground">
                      {candidate.label}
                    </span>
                    <Badge variant="outline" className="rounded-sm px-1.5 py-0 text-[10px]">
                      {candidate.scriptKind}
                    </Badge>
                    <Badge variant="secondary" className="rounded-sm px-1.5 py-0 font-mono text-[10px]">
                      {candidate.scriptId}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={blocking}
                    onCheckedChange={(checked) => props.onToggleBlocking(props.trigger, candidate, checked)}
                  />
                  <span className="text-[10px] text-muted-foreground">Blocking</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => props.onToggleLink(props.trigger, candidate, false)}
                  aria-label="Remove assignment"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-full justify-center gap-1.5"
            disabled={unlinkedCandidates.length === 0}
          >
            <Plus className="size-3.5" />
            {props.candidates.length === 0 ? "Nothing to assign" : "Assign script"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-2">
          {unlinkedCandidates.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              All candidates already assigned.
            </p>
          ) : (
            <div className="space-y-1">
              <p className="px-2 pt-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Available scripts
              </p>
              {unlinkedCandidates.map((candidate) => (
                <button
                  key={`${candidate.scriptKind}:${candidate.scriptId}`}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/40"
                  onClick={() => props.onToggleLink(props.trigger, candidate, true)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-foreground">
                        {candidate.label}
                      </span>
                      <Badge variant="outline" className="rounded-sm px-1.5 py-0 text-[10px]">
                        {candidate.scriptKind}
                      </Badge>
                    </div>
                    {candidate.description ? (
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {candidate.description}
                      </p>
                    ) : null}
                  </div>
                  <Plus className="size-3.5 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ScriptHooksTab(props: {
  hooks: ScriptEditorState["hooks"];
  candidates: ScriptEditorCandidate[];
  unresolvedHookRefs: Array<{ trigger: ScriptTrigger; link: ScriptEditorHookLink }>;
  onToggleLink: (trigger: ScriptTrigger, candidate: ScriptEditorCandidate, enabled: boolean) => void;
  onToggleBlocking: (trigger: ScriptTrigger, candidate: ScriptEditorCandidate, blocking: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-foreground">Hooks</p>
        <p className="text-xs text-muted-foreground">
          Wire actions and services into task, turn, and PR lifecycle triggers.
        </p>
      </div>

      {props.candidates.length === 0 ? (
        <Empty className="border border-dashed border-border/70 bg-muted/15">
          <EmptyHeader>
            <EmptyMedia>
              <AlertCircle className="size-4" />
            </EmptyMedia>
            <EmptyTitle>No actions or services yet</EmptyTitle>
            <EmptyDescription>
              Create an action or service first, then return here to wire it to a trigger.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {SCRIPT_TRIGGER_IDS.map((trigger) => (
            <HookTriggerCard
              key={trigger}
              trigger={trigger}
              candidates={props.candidates}
              links={props.hooks[trigger]}
              onToggleLink={props.onToggleLink}
              onToggleBlocking={props.onToggleBlocking}
            />
          ))}
        </div>
      )}

      {props.unresolvedHookRefs.length > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 text-xs text-amber-950 dark:text-amber-100">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="size-4" />
            Preserved unresolved hook refs
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {props.unresolvedHookRefs.map(({ trigger, link }, index) => (
              <Badge
                key={`${trigger}:${link.scriptKind ?? "unknown"}:${link.scriptId}:${index}`}
                variant="secondary"
                className="rounded-sm px-2 py-0"
              >
                {SCRIPT_TRIGGER_METADATA[trigger].label} → {link.scriptKind ?? "unknown"}:{link.scriptId}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
