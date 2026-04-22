import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FilePenLine,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from "@/components/ui";
import {
  SCRIPT_TRIGGER_METADATA,
  SCRIPT_TRIGGER_IDS,
  SCRIPTS_CONFIG_FILENAME,
  DEFAULT_SCRIPT_TARGET_IDS,
  STAVE_CONFIG_DIR,
} from "@/lib/workspace-scripts/constants";
import {
  buildScriptConfigFromEditorState,
  buildScriptEditorCandidates,
  buildScriptEditorState,
  createEmptyScriptEditorEntry,
  createEmptyScriptEditorState,
  formatScriptConfigFile,
  mergeScriptConfigIntoRaw,
  validateScriptEditorState,
  type ScriptEditorCandidate,
  type ScriptEditorEntry,
  type ScriptEditorHookLink,
  type ScriptEditorState,
} from "@/lib/workspace-scripts/editor";
import { ScriptsConfigSchema } from "@/lib/workspace-scripts/schemas";
import type {
  ScriptKind,
  ScriptTrigger,
  ResolvedWorkspaceScriptsConfig,
  WorkspaceScriptsConfig,
} from "@/lib/workspace-scripts/types";
import { cn } from "@/lib/utils";

type ScriptEditorScopeId = "project" | "workspace";
type ScriptsTabValue = "actions" | "services" | "hooks";

interface ScriptEditorScope {
  id: ScriptEditorScopeId;
  label: string;
  description: string;
  rootPath: string;
  filePath: string;
}

interface EditorFileState {
  status: "idle" | "loading" | "ready" | "error";
  exists: boolean;
  revision: string | null;
  rawConfig: Record<string, unknown> | null;
  parsedConfig: WorkspaceScriptsConfig | null;
  error: string;
}

function snapshotScriptEditorState(state: ScriptEditorState) {
  return JSON.stringify(state);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildEditorScopes(args: {
  projectPath: string;
  workspacePath: string;
}) {
  const scopes: ScriptEditorScope[] = [
    {
      id: "project",
      label: "Project Config",
      description: "Shared scripts config stored in `.stave/scripts.json` for the repository.",
      rootPath: args.projectPath,
      filePath: `${STAVE_CONFIG_DIR}/${SCRIPTS_CONFIG_FILENAME}`,
    },
  ];

  if (args.workspacePath && args.workspacePath !== args.projectPath) {
    scopes.unshift({
      id: "workspace",
      label: "Workspace Config",
      description: "Highest-priority shared scripts config stored in `.stave/scripts.json` for the active workspace.",
      rootPath: args.workspacePath,
      filePath: `${STAVE_CONFIG_DIR}/${SCRIPTS_CONFIG_FILENAME}`,
    });
  }

  return scopes;
}

function targetLabel(
  targetId: string,
  knownTargets: Array<{ id: string; label: string }>,
) {
  return knownTargets.find((target) => target.id === targetId)?.label ?? targetId;
}

function isHookLinked(
  links: ScriptEditorHookLink[] | undefined,
  candidate: ScriptEditorCandidate,
) {
  return (links ?? []).some((link) => (
    link.scriptId === candidate.scriptId
    && (link.scriptKind === candidate.scriptKind || link.scriptKind === null)
  ));
}

function getHookBlocking(
  links: ScriptEditorHookLink[] | undefined,
  candidate: ScriptEditorCandidate,
) {
  return (links ?? []).find((link) => (
    link.scriptId === candidate.scriptId
    && (link.scriptKind === candidate.scriptKind || link.scriptKind === null)
  ))?.blocking ?? true;
}

function removeMatchingHookLinks(
  links: ScriptEditorHookLink[] | undefined,
  args: { scriptId: string; scriptKind: ScriptKind },
) {
  return (links ?? []).filter((link) => !(
    link.scriptId === args.scriptId
    && link.scriptKind === args.scriptKind
  ));
}

function collectEntryTriggers(args: {
  entryId: string;
  kind: ScriptKind;
  hooks: ScriptEditorState["hooks"];
}): ScriptTrigger[] {
  const entryId = args.entryId.trim();
  if (!entryId) {
    return [];
  }
  return SCRIPT_TRIGGER_IDS.filter((trigger) => (
    (args.hooks[trigger] ?? []).some((link) => (
      link.scriptId === entryId
      && (link.scriptKind === args.kind || link.scriptKind === null)
    ))
  ));
}

function ScriptEntryForm(props: {
  entry: ScriptEditorEntry;
  kind: ScriptKind;
  targetOptions: Array<{ id: string; label: string }>;
  onFieldChange: (field: keyof ScriptEditorEntry, value: string | boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">ID</span>
          <Input
            value={props.entry.id}
            onChange={(event) => props.onFieldChange("id", event.target.value)}
            placeholder={props.kind === "service" ? "dev-server" : "bootstrap"}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">Label</span>
          <Input
            value={props.entry.label}
            onChange={(event) => props.onFieldChange("label", event.target.value)}
            placeholder="Shown in the GUI"
          />
        </label>
      </div>

      <label className="space-y-1.5">
        <span className="text-xs font-medium text-foreground">Description</span>
        <Input
          value={props.entry.description}
          onChange={(event) => props.onFieldChange("description", event.target.value)}
          placeholder="Short summary of what this script does"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">Target</span>
          <Select
            value={props.entry.target}
            onValueChange={(value) => props.onFieldChange("target", value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a target" />
            </SelectTrigger>
            <SelectContent>
              {props.targetOptions.map((target) => (
                <SelectItem key={target.id} value={target.id}>
                  {target.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">Timeout (ms)</span>
          <Input
            value={props.entry.timeoutMs}
            onChange={(event) => props.onFieldChange("timeoutMs", event.target.value)}
            inputMode="numeric"
            placeholder="Optional"
          />
        </label>
      </div>

      <label className="space-y-1.5">
        <span className="text-xs font-medium text-foreground">Commands</span>
        <Textarea
          value={props.entry.commandsText}
          onChange={(event) => props.onFieldChange("commandsText", event.target.value)}
          className="min-h-28"
          placeholder={"bun install\nbun run dev"}
        />
        <span className="block text-[11px] text-muted-foreground">
          One shell command per line.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Switch
            checked={props.entry.enabled}
            onCheckedChange={(checked) => props.onFieldChange("enabled", checked)}
          />
          <span className="text-xs text-foreground">Enabled</span>
        </div>
        {props.kind === "service" ? (
          <>
            <div className="flex items-center gap-2">
              <Switch
                checked={props.entry.restartOnRun}
                onCheckedChange={(checked) => props.onFieldChange("restartOnRun", checked)}
              />
              <span className="text-xs text-foreground">Restart on run</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={props.entry.orbitEnabled}
                onCheckedChange={(checked) => props.onFieldChange("orbitEnabled", checked)}
              />
              <span className="text-xs text-foreground">Use Orbit</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={props.entry.orbitNoTls}
                disabled={!props.entry.orbitEnabled}
                onCheckedChange={(checked) => props.onFieldChange("orbitNoTls", checked)}
              />
              <span className="text-xs text-foreground">Plain HTTP</span>
            </div>
          </>
        ) : null}
      </div>

      {props.kind === "service" && props.entry.orbitEnabled ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">Orbit Name</span>
            <Input
              value={props.entry.orbitName}
              onChange={(event) => props.onFieldChange("orbitName", event.target.value)}
              placeholder="Optional base host name override"
            />
            <span className="block text-[11px] text-muted-foreground">
              Optional `portless --name` override. Orbit services must target the workspace.
            </span>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">Orbit Proxy Port</span>
            <Input
              value={props.entry.orbitProxyPort}
              onChange={(event) => props.onFieldChange("orbitProxyPort", event.target.value)}
              inputMode="numeric"
              placeholder="Optional"
            />
            <span className="block text-[11px] text-muted-foreground">
              Optional portless proxy port override.
            </span>
          </label>
        </div>
      ) : null}
    </div>
  );
}

function ScriptEntryCard(props: {
  entry: ScriptEditorEntry;
  kind: ScriptKind;
  index: number;
  totalCount: number;
  triggers: ScriptTrigger[];
  targetOptions: Array<{ id: string; label: string }>;
  isEditing: boolean;
  onEditingChange: (open: boolean) => void;
  onFieldChange: (field: keyof ScriptEditorEntry, value: string | boolean) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const title = props.entry.label.trim()
    || props.entry.id.trim()
    || `${props.kind === "service" ? "Service" : "Action"} ${props.index + 1}`;
  const moveUpDisabled = props.index === 0;
  const moveDownDisabled = props.index === props.totalCount - 1;

  return (
    <Popover open={props.isEditing} onOpenChange={props.onEditingChange}>
      <div className="rounded-lg border border-border/70 bg-card/60 p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">{title}</span>
              {props.entry.id.trim() ? (
                <Badge variant="outline" className="rounded-sm px-2 py-0 font-mono text-[10px]">
                  {props.entry.id.trim()}
                </Badge>
              ) : (
                <Badge variant="secondary" className="rounded-sm px-2 py-0 text-[10px]">
                  draft id
                </Badge>
              )}
              <Badge variant="secondary" className="rounded-sm px-2 py-0 font-normal">
                {targetLabel(props.entry.target, props.targetOptions)}
              </Badge>
              {props.kind === "service" && props.entry.orbitEnabled ? (
                <Badge variant="secondary" className="rounded-sm px-2 py-0">
                  Orbit
                </Badge>
              ) : null}
              {!props.entry.enabled ? (
                <Badge variant="secondary" className="rounded-sm px-2 py-0">
                  Disabled
                </Badge>
              ) : null}
            </div>
            {props.entry.description.trim() ? (
              <p className="text-xs text-muted-foreground">{props.entry.description.trim()}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                One command per line. JSON stays normalized behind the form.
              </p>
            )}
            {props.triggers.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Hooks
                </span>
                {props.triggers.map((trigger) => (
                  <Badge
                    key={trigger}
                    variant="outline"
                    className="rounded-full px-2 py-0 text-[10px]"
                  >
                    {SCRIPT_TRIGGER_METADATA[trigger].label}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={moveUpDisabled}
              onClick={() => props.onMove(-1)}
            >
              <ChevronUp className="size-3.5" />
              Move up
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={moveDownDisabled}
              onClick={() => props.onMove(1)}
            >
              <ChevronDown className="size-3.5" />
              Move down
            </Button>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => props.onEditingChange(true)}
              >
                Edit
              </Button>
            </PopoverTrigger>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={props.onRemove}
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </div>
        </div>
      </div>
      <PopoverContent align="end" className="w-[28rem] max-w-[calc(100vw-2rem)]">
        <ScriptEntryForm
          entry={props.entry}
          kind={props.kind}
          targetOptions={props.targetOptions}
          onFieldChange={props.onFieldChange}
        />
      </PopoverContent>
    </Popover>
  );
}

function ScriptsEntriesTab(props: {
  kind: ScriptKind;
  entries: ScriptEditorEntry[];
  hooks: ScriptEditorState["hooks"];
  targetOptions: Array<{ id: string; label: string }>;
  editingEntryId: string | null;
  onEditingChange: (entryId: string | null) => void;
  onFieldChange: (index: number, field: keyof ScriptEditorEntry, value: string | boolean) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  addNewEntryKey: string | null;
  onAddNewEntryKeyConsumed: () => void;
}) {
  const kindLabel = props.kind === "service" ? "Services" : "Actions";
  const kindDescription = props.kind === "service"
    ? "Long-running processes that stay available until you stop them."
    : "Short-lived commands you run on demand or from hooks.";
  const addLabel = props.kind === "service" ? "Add service" : "Add action";

  const { addNewEntryKey, onAddNewEntryKeyConsumed, onEditingChange } = props;

  // Auto-open the editor for a freshly-added entry.
  useEffect(() => {
    if (!addNewEntryKey) {
      return;
    }
    onEditingChange(addNewEntryKey);
    onAddNewEntryKeyConsumed();
  }, [addNewEntryKey, onEditingChange, onAddNewEntryKeyConsumed]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-foreground">{kindLabel}</p>
          <p className="text-xs text-muted-foreground">{kindDescription}</p>
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          onClick={props.onAdd}
        >
          <Plus className="size-3.5" />
          {addLabel}
        </Button>
      </div>

      {props.entries.length === 0 ? (
        <Empty className="border border-dashed border-border/70 bg-muted/15">
          <EmptyHeader>
            <EmptyMedia>
              <FilePenLine className="size-4" />
            </EmptyMedia>
            <EmptyTitle>No {props.kind}s yet</EmptyTitle>
            <EmptyDescription>
              Click "{addLabel}" to create the first entry.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2.5">
          {props.entries.map((entry, index) => {
            const stableId = `${props.kind}:${index}`;
            const triggers = collectEntryTriggers({
              entryId: entry.id,
              kind: props.kind,
              hooks: props.hooks,
            });
            return (
              <ScriptEntryCard
                key={stableId}
                entry={entry}
                kind={props.kind}
                index={index}
                totalCount={props.entries.length}
                triggers={triggers}
                targetOptions={props.targetOptions}
                isEditing={props.editingEntryId === stableId}
                onEditingChange={(open) => props.onEditingChange(open ? stableId : null)}
                onFieldChange={(field, value) => props.onFieldChange(index, field, value)}
                onRemove={() => props.onRemove(index)}
                onMove={(direction) => props.onMove(index, direction)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

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

function ScriptsHooksTab(props: {
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

export function WorkspaceScriptsManager(props: {
  projectPath: string;
  workspacePath: string;
  resolvedConfig: ResolvedWorkspaceScriptsConfig | null;
  onSaved?: () => Promise<void> | void;
}) {
  const scopes = useMemo(
    () => buildEditorScopes({
      projectPath: props.projectPath,
      workspacePath: props.workspacePath,
    }),
    [props.projectPath, props.workspacePath],
  );
  const [selectedScopeId, setSelectedScopeId] = useState<ScriptEditorScopeId | null>(null);
  const [initialScopeResolved, setInitialScopeResolved] = useState(false);
  const selectedScope = useMemo(
    () => initialScopeResolved
      ? (scopes.find((scope) => scope.id === selectedScopeId) ?? scopes[0] ?? null)
      : null,
    [initialScopeResolved, scopes, selectedScopeId],
  );

  const [fileState, setFileState] = useState<EditorFileState>({
    status: "idle",
    exists: false,
    revision: null,
    rawConfig: null,
    parsedConfig: null,
    error: "",
  });
  const [editorState, setEditorState] = useState<ScriptEditorState>(createEmptyScriptEditorState());
  const [savedContentSnapshot, setSavedContentSnapshot] = useState("");
  const [savedEditorStateSnapshot, setSavedEditorStateSnapshot] = useState(
    snapshotScriptEditorState(createEmptyScriptEditorState()),
  );
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<ScriptsTabValue>("actions");
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [pendingOpenEntryKey, setPendingOpenEntryKey] = useState<string | null>(null);
  const resolvedConfigRef = useRef(props.resolvedConfig);

  useEffect(() => {
    resolvedConfigRef.current = props.resolvedConfig;
  }, [props.resolvedConfig]);

  useEffect(() => {
    setInitialScopeResolved(false);
    setSelectedScopeId(null);
  }, [props.projectPath]);

  useEffect(() => {
    if (!initialScopeResolved) {
      return;
    }
    if (!selectedScopeId || !scopes.some((scope) => scope.id === selectedScopeId)) {
      setSelectedScopeId(scopes[0]?.id ?? null);
    }
  }, [initialScopeResolved, scopes, selectedScopeId]);

  useEffect(() => {
    let cancelled = false;

    async function chooseDefaultScope() {
      if (scopes.length === 0) {
        if (!cancelled) {
          setInitialScopeResolved(true);
        }
        return;
      }

      const workspaceScope = scopes.find((scope) => scope.id === "workspace");
      const readFile = window.api?.fs?.readFile;
      if (!workspaceScope || !readFile) {
        if (!cancelled) {
          setSelectedScopeId(scopes[0]?.id ?? "project");
          setInitialScopeResolved(true);
        }
        return;
      }

      const workspaceFile = await readFile({
        rootPath: workspaceScope.rootPath,
        filePath: workspaceScope.filePath,
      });
      if (!cancelled) {
        setSelectedScopeId(workspaceFile.ok ? "workspace" : "project");
        setInitialScopeResolved(true);
      }
    }

    if (!initialScopeResolved) {
      void chooseDefaultScope();
    }

    return () => {
      cancelled = true;
    };
  }, [initialScopeResolved, scopes]);

  const loadSelectedScope = useCallback(async (scope: ScriptEditorScope) => {
    const readFile = window.api?.fs?.readFile;
    if (!readFile) {
      setFileState({
        status: "error",
        exists: false,
        revision: null,
        rawConfig: null,
        parsedConfig: null,
        error: "Filesystem bridge unavailable.",
      });
      return;
    }

    setFileState((current) => ({
      ...current,
      status: "loading",
      error: "",
    }));

    const result = await readFile({
      rootPath: scope.rootPath,
      filePath: scope.filePath,
    });

    if (!result.ok) {
      if (result.stderr?.includes("ENOENT")) {
        const emptyState = createEmptyScriptEditorState();
        const initialContent = formatScriptConfigFile(
          mergeScriptConfigIntoRaw({
            rawConfig: null,
            config: buildScriptConfigFromEditorState(emptyState),
          }),
        );
        setEditorState(emptyState);
        setEditingActionId(null);
        setEditingServiceId(null);
        setSavedContentSnapshot(initialContent);
        setSavedEditorStateSnapshot(snapshotScriptEditorState(emptyState));
        setFileState({
          status: "ready",
          exists: false,
          revision: null,
          rawConfig: null,
          parsedConfig: null,
          error: "",
        });
        return;
      }

      setFileState({
        status: "error",
        exists: false,
        revision: null,
        rawConfig: null,
        parsedConfig: null,
        error: result.stderr ?? "Failed to read scripts config.",
      });
      return;
    }

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(result.content);
    } catch (error) {
      setFileState({
        status: "error",
        exists: true,
        revision: result.revision,
        rawConfig: null,
        parsedConfig: null,
        error: `Invalid JSON in ${scope.filePath}: ${String(error)}`,
      });
      return;
    }

    if (!isPlainRecord(rawJson)) {
      setFileState({
        status: "error",
        exists: true,
        revision: result.revision,
        rawConfig: null,
        parsedConfig: null,
        error: `Expected an object in ${scope.filePath}.`,
      });
      return;
    }

    const parsed = ScriptsConfigSchema.safeParse(rawJson);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFileState({
        status: "error",
        exists: true,
        revision: result.revision,
        rawConfig: rawJson,
        parsedConfig: null,
        error: `${scope.filePath} is not a valid shared scripts config: ${issue?.message ?? "Unknown error."}`,
      });
      return;
    }

    const nextEditorState = buildScriptEditorState({
      config: parsed.data,
      resolvedConfig: resolvedConfigRef.current,
    });
    const initialContent = formatScriptConfigFile(
      mergeScriptConfigIntoRaw({
        rawConfig: rawJson,
        config: buildScriptConfigFromEditorState(nextEditorState),
      }),
    );

    setEditorState(nextEditorState);
    setEditingActionId(null);
    setEditingServiceId(null);
    setSavedContentSnapshot(initialContent);
    setSavedEditorStateSnapshot(snapshotScriptEditorState(nextEditorState));
    setFileState({
      status: "ready",
      exists: true,
      revision: result.revision,
      rawConfig: rawJson,
      parsedConfig: parsed.data,
      error: "",
    });
  }, []);

  useEffect(() => {
    if (!selectedScope) {
      return;
    }
    void loadSelectedScope(selectedScope);
  }, [loadSelectedScope, selectedScope]);

  const currentConfig = useMemo(
    () => buildScriptConfigFromEditorState(editorState),
    [editorState],
  );
  const currentSaveContent = useMemo(
    () => formatScriptConfigFile(
      mergeScriptConfigIntoRaw({
        rawConfig: fileState.rawConfig,
        config: currentConfig,
      }),
    ),
    [currentConfig, fileState.rawConfig],
  );
  const currentEditorStateSnapshot = useMemo(
    () => snapshotScriptEditorState(editorState),
    [editorState],
  );
  const isDirty = fileState.status === "ready" && (
    currentSaveContent !== savedContentSnapshot
    || currentEditorStateSnapshot !== savedEditorStateSnapshot
  );

  const targetOptions = useMemo(() => {
    const next = new Map<string, string>([
      [DEFAULT_SCRIPT_TARGET_IDS.WORKSPACE, "Workspace"],
      [DEFAULT_SCRIPT_TARGET_IDS.PROJECT, "Project"],
    ]);

    for (const target of Object.values(props.resolvedConfig?.targets ?? {})) {
      next.set(target.id, target.label);
    }

    for (const [targetId, target] of Object.entries(fileState.parsedConfig?.targets ?? {})) {
      next.set(targetId, target.label?.trim() || targetId);
    }

    for (const entry of [...editorState.actions, ...editorState.services]) {
      const targetId = entry.target.trim();
      if (targetId) {
        next.set(targetId, next.get(targetId) ?? targetId);
      }
    }

    return [...next.entries()].map(([id, label]) => ({ id, label }));
  }, [editorState.actions, editorState.services, fileState.parsedConfig?.targets, props.resolvedConfig?.targets]);

  const hookCandidates = useMemo(
    () => buildScriptEditorCandidates({
      state: editorState,
      resolvedConfig: props.resolvedConfig,
    }),
    [editorState, props.resolvedConfig],
  );

  const unresolvedHookRefs = useMemo(() => {
    return SCRIPT_TRIGGER_IDS.flatMap((trigger) => (
      editorState.hooks[trigger] ?? []
    ).filter((link) => {
      if (link.scriptKind) {
        return !hookCandidates.some((candidate) => (
          candidate.scriptId === link.scriptId
          && candidate.scriptKind === link.scriptKind
        ));
      }
      return !hookCandidates.some((candidate) => candidate.scriptId === link.scriptId);
    }).map((link) => ({
      trigger,
      link,
    })));
  }, [editorState.hooks, hookCandidates]);

  const actionsCount = editorState.actions.length;
  const servicesCount = editorState.services.length;
  const hookLinkCount = SCRIPT_TRIGGER_IDS.reduce(
    (sum, trigger) => sum + (editorState.hooks[trigger]?.length ?? 0),
    0,
  );

  const updateEntryField = useCallback((
    kind: ScriptKind,
    index: number,
    field: keyof ScriptEditorEntry,
    value: string | boolean,
  ) => {
    setEditorState((current) => {
      const collectionKey = kind === "service" ? "services" : "actions";
      const nextEntries = current[collectionKey].map((entry, entryIndex) => (
        entryIndex === index
          ? { ...entry, [field]: value }
          : entry
      ));

      let nextHooks = current.hooks;
      if (field === "id") {
        const previousId = current[collectionKey][index]?.id.trim();
        const nextId = String(value).trim();
        if (previousId && previousId !== nextId) {
          nextHooks = Object.fromEntries(
            Object.entries(current.hooks).map(([trigger, links]) => [
              trigger,
              (links ?? []).map((link) => (
                link.scriptId === previousId && link.scriptKind === kind
                  ? { ...link, scriptId: nextId }
                  : link
              )),
            ]),
          ) as ScriptEditorState["hooks"];
        }
      }

      return {
        ...current,
        [collectionKey]: nextEntries,
        hooks: nextHooks,
      };
    });
  }, []);

  const addEntry = useCallback((kind: ScriptKind) => {
    const collectionKey = kind === "service" ? "services" : "actions";
    const newIndex = editorState[collectionKey].length;
    setEditorState((current) => ({
      ...current,
      [collectionKey]: [...current[collectionKey], createEmptyScriptEditorEntry(kind)],
    }));
    setPendingOpenEntryKey(`${kind}:${newIndex}`);
    setActiveTab(kind === "service" ? "services" : "actions");
  }, [editorState]);

  const removeEntry = useCallback((kind: ScriptKind, index: number) => {
    setEditorState((current) => {
      const collectionKey = kind === "service" ? "services" : "actions";
      const removedEntry = current[collectionKey][index];
      const nextEntries = current[collectionKey].filter((_, entryIndex) => entryIndex !== index);
      const nextHooks = Object.fromEntries(
        Object.entries(current.hooks).map(([trigger, links]) => [
          trigger,
          removeMatchingHookLinks(links, {
            scriptId: removedEntry?.id.trim() ?? "",
            scriptKind: kind,
          }),
        ]).filter(([, links]) => (links as ScriptEditorHookLink[]).length > 0),
      ) as ScriptEditorState["hooks"];

      return {
        ...current,
        [collectionKey]: nextEntries,
        hooks: nextHooks,
      };
    });
    if (kind === "service") {
      setEditingServiceId(null);
    } else {
      setEditingActionId(null);
    }
  }, []);

  const moveEntry = useCallback((kind: ScriptKind, index: number, direction: -1 | 1) => {
    setEditorState((current) => {
      const collectionKey = kind === "service" ? "services" : "actions";
      const entries = current[collectionKey];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= entries.length) {
        return current;
      }
      const nextEntries = [...entries];
      const [moved] = nextEntries.splice(index, 1);
      if (!moved) {
        return current;
      }
      nextEntries.splice(targetIndex, 0, moved);
      return {
        ...current,
        [collectionKey]: nextEntries,
      };
    });
    if (kind === "service") {
      setEditingServiceId(null);
    } else {
      setEditingActionId(null);
    }
  }, []);

  const updateHookLinks = useCallback((
    trigger: ScriptTrigger,
    nextLinks: ScriptEditorHookLink[],
  ) => {
    setEditorState((current) => ({
      ...current,
      hooks: {
        ...current.hooks,
        ...(nextLinks.length > 0 ? { [trigger]: nextLinks } : { [trigger]: undefined }),
      },
    }));
  }, []);

  const toggleHookLink = useCallback((
    trigger: ScriptTrigger,
    candidate: ScriptEditorCandidate,
    enabled: boolean,
  ) => {
    const currentLinks = editorState.hooks[trigger] ?? [];
    if (!enabled) {
      updateHookLinks(
        trigger,
        currentLinks.filter((link) => !(
          link.scriptId === candidate.scriptId
          && (link.scriptKind === candidate.scriptKind || link.scriptKind === null)
        )),
      );
      return;
    }

    if (isHookLinked(currentLinks, candidate)) {
      updateHookLinks(
        trigger,
        currentLinks.map((link) => (
          link.scriptId === candidate.scriptId && link.scriptKind === null
            ? { ...link, scriptKind: candidate.scriptKind }
            : link
        )),
      );
      return;
    }

    updateHookLinks(trigger, [
      ...currentLinks,
      {
        scriptId: candidate.scriptId,
        scriptKind: candidate.scriptKind,
        blocking: true,
      },
    ]);
  }, [editorState.hooks, updateHookLinks]);

  const toggleHookBlocking = useCallback((
    trigger: ScriptTrigger,
    candidate: ScriptEditorCandidate,
    blocking: boolean,
  ) => {
    updateHookLinks(
      trigger,
      (editorState.hooks[trigger] ?? []).map((link) => (
        link.scriptId === candidate.scriptId
        && (link.scriptKind === candidate.scriptKind || link.scriptKind === null)
          ? { ...link, scriptKind: link.scriptKind ?? candidate.scriptKind, blocking }
          : link
      )),
    );
  }, [editorState.hooks, updateHookLinks]);

  const reloadSelectedScope = useCallback(async () => {
    if (!selectedScope) {
      return;
    }
    if (isDirty) {
      toast.message("Discard or save changes before reloading this config.");
      return;
    }
    await loadSelectedScope(selectedScope);
  }, [isDirty, loadSelectedScope, selectedScope]);

  const discardChanges = useCallback(async () => {
    if (!selectedScope) {
      return;
    }
    await loadSelectedScope(selectedScope);
  }, [loadSelectedScope, selectedScope]);

  const saveChanges = useCallback(async () => {
    const writeFile = window.api?.fs?.writeFile;
    const createDirectory = window.api?.fs?.createDirectory;
    if (!selectedScope || !writeFile || !createDirectory) {
      toast.error("Filesystem bridge unavailable");
      return;
    }

    const issues = validateScriptEditorState(editorState);
    if (issues.length > 0) {
      toast.error("Scripts config is incomplete", {
        description: issues[0],
      });
      return;
    }

    setSaving(true);
    try {
      const mkdirResult = await createDirectory({
        rootPath: selectedScope.rootPath,
        directoryPath: STAVE_CONFIG_DIR,
      });
      if (!mkdirResult.ok && !mkdirResult.alreadyExists) {
        toast.error("Failed to prepare .stave directory", {
          description: mkdirResult.stderr ?? "Unknown error",
        });
        return;
      }

      const result = await writeFile({
        rootPath: selectedScope.rootPath,
        filePath: selectedScope.filePath,
        content: currentSaveContent,
        expectedRevision: fileState.revision,
      });
      if (!result.ok) {
        toast.error(result.conflict ? "Scripts config changed on disk" : "Failed to save scripts config", {
          description: result.stderr ?? (result.conflict
            ? "Reload the file and re-apply your changes."
            : "Unknown error"),
        });
        return;
      }

      await loadSelectedScope(selectedScope);
      await props.onSaved?.();
      toast.success("Scripts config saved", {
        description: selectedScope.filePath,
      });
    } finally {
      setSaving(false);
    }
  }, [currentSaveContent, editorState, fileState.revision, loadSelectedScope, props.onSaved, selectedScope]);

  const handleScopeChange = useCallback((value: string) => {
    if (isDirty) {
      toast.message("Save or discard changes before switching configs.");
      return;
    }
    if (value === "project" || value === "workspace") {
      setSelectedScopeId(value);
    }
  }, [isDirty]);

  if (!selectedScope) {
    if (!initialScopeResolved) {
      return (
        <div className="px-1 py-4 text-xs text-muted-foreground">
          Loading scripts manager…
        </div>
      );
    }

    return (
      <Empty className="border border-dashed border-border/70 bg-muted/15">
        <EmptyHeader>
          <EmptyMedia>
            <FilePenLine className="size-4" />
          </EmptyMedia>
          <EmptyTitle>Scripts manager unavailable</EmptyTitle>
          <EmptyDescription>Select a workspace to edit its scripts config.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">Scripts Manager</p>
            <Badge
              variant={isDirty ? "secondary" : "outline"}
              className="rounded-full px-2 py-0 text-[10px]"
            >
              {isDirty ? "Unsaved" : fileState.exists ? "In sync" : "New file"}
            </Badge>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Edit actions, services, and hooks. Targets and local overrides are preserved but not editable here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 rounded-md px-2"
            onClick={() => void reloadSelectedScope()}
            disabled={fileState.status === "loading" || saving}
          >
            <RefreshCcw className={cn("mr-1 size-3.5", fileState.status === "loading" && "animate-spin")} />
            Reload
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 rounded-md px-2"
            onClick={() => void discardChanges()}
            disabled={!isDirty || saving}
          >
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 rounded-md px-2"
            onClick={() => void saveChanges()}
            disabled={fileState.status !== "ready" || saving}
          >
            {saving ? <RefreshCcw className="mr-1 size-3.5 animate-spin" /> : <Save className="mr-1 size-3.5" />}
            Save
          </Button>
        </div>
      </div>

      {/* ── Scope selector ── */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,280px)_1fr]">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">Config Scope</span>
          <Select value={selectedScope.id} onValueChange={handleScopeChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scopes.map((scope) => (
                <SelectItem key={scope.id} value={scope.id}>
                  {scope.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2.5">
          <p className="text-xs font-medium text-foreground">{selectedScope.description}</p>
          <p className="mt-1 break-all text-[11px] leading-5 text-muted-foreground">
            {selectedScope.rootPath}/{selectedScope.filePath}
          </p>
        </div>
      </div>

      <p className="text-[11px] leading-5 text-muted-foreground">
        {selectedScope.id === "workspace"
          ? "Workspace config overrides the project shared config for this workspace."
          : "Project config is the shared fallback. If a workspace-level config exists, it wins for the active workspace."}
        {" "}
        For custom targets or `.stave/scripts.local.json`, edit JSON directly.
      </p>

      {fileState.error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
          {fileState.error}
        </div>
      ) : null}

      {fileState.status === "loading" ? (
        <div className="px-1 py-4 text-xs text-muted-foreground">
          Loading…
        </div>
      ) : null}

      {fileState.status === "ready" ? (
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ScriptsTabValue)}
          className="space-y-3"
        >
          <TabsList>
            <TabsTrigger value="actions" className="gap-1.5">
              Actions
              <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[10px]">
                {actionsCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="services" className="gap-1.5">
              Services
              <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[10px]">
                {servicesCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="hooks" className="gap-1.5">
              Hooks
              <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[10px]">
                {hookLinkCount}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="actions" className="mt-0">
            <ScriptsEntriesTab
              kind="action"
              entries={editorState.actions}
              hooks={editorState.hooks}
              targetOptions={targetOptions}
              editingEntryId={editingActionId}
              onEditingChange={setEditingActionId}
              onFieldChange={(index, field, value) => updateEntryField("action", index, field, value)}
              onAdd={() => addEntry("action")}
              onRemove={(index) => removeEntry("action", index)}
              onMove={(index, direction) => moveEntry("action", index, direction)}
              addNewEntryKey={pendingOpenEntryKey?.startsWith("action:") ? pendingOpenEntryKey : null}
              onAddNewEntryKeyConsumed={() => setPendingOpenEntryKey(null)}
            />
          </TabsContent>

          <TabsContent value="services" className="mt-0">
            <ScriptsEntriesTab
              kind="service"
              entries={editorState.services}
              hooks={editorState.hooks}
              targetOptions={targetOptions}
              editingEntryId={editingServiceId}
              onEditingChange={setEditingServiceId}
              onFieldChange={(index, field, value) => updateEntryField("service", index, field, value)}
              onAdd={() => addEntry("service")}
              onRemove={(index) => removeEntry("service", index)}
              onMove={(index, direction) => moveEntry("service", index, direction)}
              addNewEntryKey={pendingOpenEntryKey?.startsWith("service:") ? pendingOpenEntryKey : null}
              onAddNewEntryKeyConsumed={() => setPendingOpenEntryKey(null)}
            />
          </TabsContent>

          <TabsContent value="hooks" className="mt-0">
            <ScriptsHooksTab
              hooks={editorState.hooks}
              candidates={hookCandidates}
              unresolvedHookRefs={unresolvedHookRefs}
              onToggleLink={toggleHookLink}
              onToggleBlocking={toggleHookBlocking}
            />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}
