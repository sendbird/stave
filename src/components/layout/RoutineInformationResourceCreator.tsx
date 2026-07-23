import {
  ArrowLeft,
  BookOpen,
  CheckSquare2,
  Cloud,
  GitPullRequest,
  ListPlus,
  MessageSquare,
  Paperclip,
  PenTool,
  SlidersHorizontal,
  StickyNote,
  TicketCheck,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  RoutineInformationResourceCreateInputSchema,
  type RoutineInformationResourceCreateInput,
  type RoutineInformationResourceKind,
} from "@/lib/routines";
import type { WorkspaceInformationReferenceOption } from "@/lib/workspace-information-references";

interface ResourceTypeDefinition {
  kind: RoutineInformationResourceKind;
  label: string;
  description: string;
  icon: LucideIcon;
}

const RESOURCE_TYPES: ResourceTypeDefinition[] = [
  {
    kind: "notes",
    label: "Notes",
    description: "Append reusable instructions or context.",
    icon: StickyNote,
  },
  {
    kind: "todo",
    label: "Todo",
    description: "Add one actionable Information item.",
    icon: CheckSquare2,
  },
  {
    kind: "pull_request",
    label: "Pull request",
    description: "Add a GitHub pull request URL.",
    icon: GitPullRequest,
  },
  {
    kind: "jira",
    label: "Jira issue",
    description: "Add an issue URL and optional status.",
    icon: TicketCheck,
  },
  {
    kind: "confluence",
    label: "Confluence page",
    description: "Add a page URL and space key.",
    icon: BookOpen,
  },
  {
    kind: "storybook",
    label: "Storybook",
    description: "Add a story or documentation URL.",
    icon: ListPlus,
  },
  {
    kind: "amplify",
    label: "Amplify",
    description: "Add a deployed preview URL.",
    icon: Cloud,
  },
  {
    kind: "slack",
    label: "Slack thread",
    description: "Add a Slack message permalink.",
    icon: MessageSquare,
  },
  {
    kind: "figma",
    label: "Figma",
    description: "Add a design, board, or node URL.",
    icon: PenTool,
  },
  {
    kind: "custom",
    label: "Custom field",
    description: "Add typed repository-specific context.",
    icon: SlidersHorizontal,
  },
];

interface ResourceDraft {
  text: string;
  url: string;
  title: string;
  note: string;
  issueKey: string;
  status: string;
  spaceKey: string;
  channelName: string;
  nodeId: string;
  label: string;
  fieldType:
    | "text"
    | "textarea"
    | "number"
    | "boolean"
    | "date"
    | "url"
    | "single_select";
  customValue: string;
  customBoolean: boolean;
  customOptions: string;
}

const EMPTY_RESOURCE_DRAFT: ResourceDraft = {
  text: "",
  url: "",
  title: "",
  note: "",
  issueKey: "",
  status: "",
  spaceKey: "",
  channelName: "",
  nodeId: "",
  label: "",
  fieldType: "text",
  customValue: "",
  customBoolean: false,
  customOptions: "",
};

const URL_PLACEHOLDERS: Partial<Record<RoutineInformationResourceKind, string>> =
  {
    pull_request: "https://github.com/org/repo/pull/123",
    jira: "https://example.atlassian.net/browse/PROJ-123",
    confluence: "https://example.atlassian.net/wiki/spaces/...",
    storybook: "https://storybook.example.com/?path=/docs/...",
    amplify: "https://branch.appid.amplifyapp.com",
    slack: "https://team.slack.com/archives/C.../p...",
    figma: "https://www.figma.com/design/...",
  };

const CUSTOM_FIELD_TYPES = [
  ["text", "Text"],
  ["textarea", "Textarea"],
  ["number", "Number"],
  ["boolean", "Boolean"],
  ["date", "Date"],
  ["url", "URL"],
  ["single_select", "Single select"],
] as const;

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseOptions(value: string) {
  return value
    .split(",")
    .map((option) => option.trim())
    .filter(
      (option, index, options) =>
        option.length > 0 && options.indexOf(option) === index,
    );
}

function buildCustomFieldValue(draft: ResourceDraft) {
  if (draft.fieldType === "boolean") {
    return draft.customBoolean;
  }
  if (draft.fieldType === "number") {
    const normalized = draft.customValue.trim();
    return normalized ? Number(normalized) : null;
  }
  return draft.customValue;
}

function buildRoutineInformationResourceCreateInput(args: {
  workspaceId: string;
  kind: RoutineInformationResourceKind;
  draft: ResourceDraft;
}): RoutineInformationResourceCreateInput | null {
  const { workspaceId, kind, draft } = args;
  let candidate: unknown;

  if (kind === "notes" || kind === "todo") {
    candidate = { kind, workspaceId, text: draft.text };
  } else if (kind === "custom") {
    candidate = {
      kind,
      workspaceId,
      label: draft.label,
      fieldType: draft.fieldType,
      value: buildCustomFieldValue(draft),
      options:
        draft.fieldType === "single_select"
          ? parseOptions(draft.customOptions)
          : undefined,
    };
  } else {
    candidate = {
      kind,
      workspaceId,
      url: draft.url,
      title: optional(draft.title),
      note: optional(draft.note),
      ...(kind === "pull_request"
        ? { status: optional(draft.status) }
        : {}),
      ...(kind === "jira"
        ? {
            issueKey: optional(draft.issueKey),
            status: optional(draft.status),
          }
        : {}),
      ...(kind === "confluence"
        ? { spaceKey: optional(draft.spaceKey) }
        : {}),
      ...(kind === "slack"
        ? { channelName: optional(draft.channelName) }
        : {}),
      ...(kind === "figma" ? { nodeId: optional(draft.nodeId) } : {}),
    };
  }

  const parsed = RoutineInformationResourceCreateInputSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function Field(props: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-xs text-foreground">
      <span className="font-medium">{props.label}</span>
      {props.children}
      {props.description ? (
        <span className="text-[10px] leading-4 text-muted-foreground">
          {props.description}
        </span>
      ) : null}
    </label>
  );
}

function ExternalResourceFields(props: {
  kind: Exclude<
    RoutineInformationResourceKind,
    "notes" | "todo" | "custom"
  >;
  draft: ResourceDraft;
  onChange: (patch: Partial<ResourceDraft>) => void;
}) {
  return (
    <>
      <Field label="URL">
        <Input
          autoFocus
          type="url"
          value={props.draft.url}
          onChange={(event) => props.onChange({ url: event.target.value })}
          placeholder={URL_PLACEHOLDERS[props.kind]}
        />
      </Field>
      <Field
        label={props.kind === "amplify" ? "Label (optional)" : "Title (optional)"}
      >
        <Input
          value={props.draft.title}
          onChange={(event) => props.onChange({ title: event.target.value })}
          placeholder={
            props.kind === "amplify"
              ? "Preview environment"
              : "Display name for this resource"
          }
        />
      </Field>
      {props.kind === "pull_request" ? (
        <Field label="Status">
          <Select
            value={props.draft.status || "planned"}
            onValueChange={(status) => props.onChange({ status })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["planned", "open", "review", "merged", "closed"].map(
                (status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {props.kind === "jira" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Issue key (optional)">
            <Input
              value={props.draft.issueKey}
              onChange={(event) =>
                props.onChange({ issueKey: event.target.value })
              }
              placeholder="PROJ-123"
            />
          </Field>
          <Field label="Status (optional)">
            <Input
              value={props.draft.status}
              onChange={(event) =>
                props.onChange({ status: event.target.value })
              }
              placeholder="In Progress"
            />
          </Field>
        </div>
      ) : null}
      {props.kind === "confluence" ? (
        <Field label="Space key (optional)">
          <Input
            value={props.draft.spaceKey}
            onChange={(event) => props.onChange({ spaceKey: event.target.value })}
            placeholder="ENG"
          />
        </Field>
      ) : null}
      {props.kind === "slack" ? (
        <Field label="Channel name (optional)">
          <Input
            value={props.draft.channelName}
            onChange={(event) =>
              props.onChange({ channelName: event.target.value })
            }
            placeholder="#project-channel"
          />
        </Field>
      ) : null}
      {props.kind === "figma" ? (
        <Field
          label="Node ID (optional)"
          description="A node ID in the URL is detected automatically."
        >
          <Input
            value={props.draft.nodeId}
            onChange={(event) => props.onChange({ nodeId: event.target.value })}
            placeholder="123:456"
          />
        </Field>
      ) : null}
      <Field label="Note (optional)">
        <Textarea
          value={props.draft.note}
          onChange={(event) => props.onChange({ note: event.target.value })}
          placeholder="How this resource should guide the routine"
          className="min-h-20 resize-y"
        />
      </Field>
    </>
  );
}

function CustomFieldValue(props: {
  draft: ResourceDraft;
  onChange: (patch: Partial<ResourceDraft>) => void;
}) {
  if (props.draft.fieldType === "boolean") {
    return (
      <div className="flex h-9 items-center justify-between rounded-md border border-border px-3">
        <span className="text-xs text-muted-foreground">
          {props.draft.customBoolean ? "True" : "False"}
        </span>
        <Switch
          checked={props.draft.customBoolean}
          onCheckedChange={(customBoolean) =>
            props.onChange({ customBoolean })
          }
        />
      </div>
    );
  }
  if (props.draft.fieldType === "textarea") {
    return (
      <Textarea
        value={props.draft.customValue}
        onChange={(event) =>
          props.onChange({ customValue: event.target.value })
        }
        className="min-h-24 resize-y"
      />
    );
  }
  return (
    <Input
      type={
        props.draft.fieldType === "number"
          ? "number"
          : props.draft.fieldType === "date"
            ? "date"
            : props.draft.fieldType === "url"
              ? "url"
              : "text"
      }
      value={props.draft.customValue}
      onChange={(event) =>
        props.onChange({ customValue: event.target.value })
      }
      placeholder={
        props.draft.fieldType === "single_select"
          ? "Choose an option value"
          : undefined
      }
    />
  );
}

export function RoutineInformationResourceCreator(props: {
  workspaceId: string;
  repositoryLabel: string;
  disabled?: boolean;
  onCreated: (option: WorkspaceInformationReferenceOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RoutineInformationResourceKind | null>(null);
  const [draft, setDraft] = useState<ResourceDraft>(EMPTY_RESOURCE_DRAFT);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const definition = RESOURCE_TYPES.find((item) => item.kind === kind) ?? null;
  const input =
    kind == null
      ? null
      : buildRoutineInformationResourceCreateInput({
          workspaceId: props.workspaceId,
          kind,
          draft,
        });

  function reset() {
    setKind(null);
    setDraft(EMPTY_RESOURCE_DRAFT);
    setCreating(false);
    setError("");
  }

  function selectKind(nextKind: RoutineInformationResourceKind) {
    setKind(nextKind);
    setDraft(EMPTY_RESOURCE_DRAFT);
    setError("");
  }

  function clearKind() {
    setKind(null);
    setDraft(EMPTY_RESOURCE_DRAFT);
    setError("");
  }

  async function createAndAttach() {
    if (!input) {
      setError("Complete the required fields before attaching.");
      return;
    }
    const createInformationResource =
      window.api?.routines?.createInformationResource;
    if (!createInformationResource) {
      setError("Information resource creation is unavailable.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const result = await createInformationResource(input);
      if (!result.ok || !result.option) {
        setError(result.message ?? "Failed to create Information resource.");
        return;
      }
      props.onCreated(result.option);
      toast.success(
        result.deduplicated
          ? "Existing Information resource attached."
          : "Information resource created and attached.",
      );
      setOpen(false);
      reset();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Failed to create Information resource.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen && !creating) {
          reset();
        }
      }}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
      className="h-8 justify-start gap-2 text-xs"
      disabled={props.disabled}
      onClick={() => {
        reset();
        setOpen(true);
      }}
      >
        <Paperclip className="size-3.5" />
        Add Information resource
      </Button>
      <DialogContent className="max-h-[84vh] overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border/70 px-5 pt-5 pb-4 pr-12">
          <div className="flex items-start gap-3">
            {kind ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="-ml-2 size-8 shrink-0"
                onClick={clearKind}
                aria-label="Choose another resource type"
                disabled={creating}
              >
                <ArrowLeft className="size-4" />
              </Button>
            ) : null}
            <div className="min-w-0">
              <DialogTitle>
                {definition
                  ? `Add ${definition.label}`
                  : "Add Information resource"}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {definition
                  ? `Create it in ${props.repositoryLabel} Default Workspace and attach it to this routine.`
                  : "Choose the resource type you want to create for this routine."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {kind && definition ? (
          <>
            <div className="grid max-h-[60vh] gap-4 overflow-y-auto px-5 py-4">
              {kind === "notes" || kind === "todo" ? (
                <Field label={kind === "notes" ? "Notes" : "Todo"}>
                  <Textarea
                    autoFocus
                    value={draft.text}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        text: event.target.value,
                      }))
                    }
                    placeholder={
                      kind === "notes"
                        ? "Context or instructions for every run"
                        : "An item the routine should keep in context"
                    }
                    className="min-h-32 resize-y"
                  />
                </Field>
              ) : kind === "custom" ? (
                <>
                  <Field label="Label">
                    <Input
                      autoFocus
                      value={draft.label}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          label: event.target.value,
                        }))
                      }
                      placeholder="Environment"
                    />
                  </Field>
                  <Field label="Field type">
                    <Select
                      value={draft.fieldType}
                      onValueChange={(fieldType) =>
                        setDraft((current) => ({
                          ...current,
                          fieldType:
                            fieldType as ResourceDraft["fieldType"],
                          customValue: "",
                          customBoolean: false,
                          customOptions: "",
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CUSTOM_FIELD_TYPES.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {draft.fieldType === "single_select" ? (
                    <Field
                      label="Options"
                      description="Separate options with commas."
                    >
                      <Input
                        value={draft.customOptions}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            customOptions: event.target.value,
                          }))
                        }
                        placeholder="Development, Staging, Production"
                      />
                    </Field>
                  ) : null}
                  <Field label="Value">
                    <CustomFieldValue
                      draft={draft}
                      onChange={(patch) =>
                        setDraft((current) => ({ ...current, ...patch }))
                      }
                    />
                  </Field>
                </>
              ) : (
                <ExternalResourceFields
                  kind={kind}
                  draft={draft}
                  onChange={(patch) =>
                    setDraft((current) => ({ ...current, ...patch }))
                  }
                />
              )}
              {error ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
            <DialogFooter className="border-t border-border/70 bg-muted/20 px-5 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void createAndAttach()}
                disabled={!input || creating}
              >
                {creating ? "Creating…" : "Create & attach"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="grid max-h-[65vh] grid-cols-2 gap-2 overflow-y-auto p-5">
            {RESOURCE_TYPES.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.kind}
                  type="button"
                  className="flex min-h-24 items-start gap-3 rounded-lg border border-border/70 bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/50"
                  onClick={() => selectKind(item.kind)}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-foreground">
                      {item.label}
                    </span>
                    <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
