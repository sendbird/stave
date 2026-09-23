import { Checkbox } from "@/components/ads/components/Checkbox";
import { Textarea as AdsTextarea } from "@/components/ui/textarea";
import { Input as AdsInput } from "@/components/ui/input";
import { NativeSelect } from "@/components/ads/components/NativeSelect";
import {
  CLAUDE_SDK_MODEL_OPTIONS,
  CODEX_MODEL_OPTIONS,
  getProviderLabel,
  getDefaultModelForProvider,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import {
  CLAUDE_EFFORT_OPTIONS,
  CODEX_EFFORT_OPTIONS,
  findOptionLabel,
} from "@/lib/providers/runtime-option-contract";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ActionButton } from "@/components/system/ActionButton";
import { AgentIdentity } from "@/components/delegation/AgentIdentity";
import type { DelegationIdentitySource } from "@/lib/delegation/exchange";
import { useAppStore } from "@/store/app.store";
import {
  resolveDelegateDefaults,
  type AutoRoutingProfile,
} from "@/lib/providers/auto-routing-profile";
import {
  createEmptyDelegationDraft,
  delegationDraftScopeKey,
  editDelegationDraft,
  prepareDelegationDraftRequest,
  type DelegationDraft,
} from "@/lib/collaboration/delegation-draft";
import {
  clearAcceptedDelegationDraft,
  loadDelegationDraft,
  saveDelegationDraft,
  subscribeToAcceptedDelegationClear,
} from "@/lib/collaboration/delegation-draft-client";
import * as stylex from "@stylexjs/stylex";
import { collaborationStyles as styles } from "./collaboration.styles";
import { delegateTaskFormStyles as form } from "./delegate-task-form.styles";

export interface CollaborationTarget {
  taskId: string;
  workspaceId: string;
  projectPath: string;
}

const CUSTOM_MODEL = "__custom__";

const PERMISSION_OPTIONS: ReadonlyArray<{
  value: DelegationDraft["permissionProfile"];
  label: string;
}> = [
  { value: "guided", label: "Guided · ask when needed" },
  { value: "manual", label: "Manual · approve every action" },
  { value: "auto", label: "Automatic · run without asking" },
];

function catalogFor(providerId: DelegationDraft["providerId"]) {
  return providerId === "codex"
    ? {
        models: CODEX_MODEL_OPTIONS as readonly string[],
        efforts: CODEX_EFFORT_OPTIONS as ReadonlyArray<{
          value: NonNullable<DelegationDraft["effort"]>;
          label: string;
        }>,
      }
    : {
        models: CLAUDE_SDK_MODEL_OPTIONS as readonly string[],
        efforts: CLAUDE_EFFORT_OPTIONS as ReadonlyArray<{
          value: NonNullable<DelegationDraft["effort"]>;
          label: string;
        }>,
      };
}

export interface RoutedDelegateDefaults {
  model: string;
  effort?: string;
  reason: string;
}

/** The Auto role table's answer for an empty model/effort on this provider. */
export function resolveRoutedDelegateDefaults(args: {
  profile: AutoRoutingProfile;
  providerId: DelegationDraft["providerId"];
}): RoutedDelegateDefaults {
  const routed = resolveDelegateDefaults(args.profile, {
    provider: args.providerId,
  });
  const efforts = catalogFor(args.providerId).efforts;
  const effort =
    routed.effort && efforts.some((option) => option.value === routed.effort)
      ? routed.effort
      : undefined;
  return {
    model: routed.model,
    ...(effort ? { effort } : {}),
    reason: routed.reason,
  };
}

/** Fill an empty model/effort from the routed defaults before sending. */
export function applyRoutedDelegateDefaults(
  draft: DelegationDraft,
  defaults: RoutedDelegateDefaults | null,
): DelegationDraft {
  if (!defaults) {
    return draft;
  }
  const model = draft.model.trim();
  if (model) {
    return draft;
  }
  return {
    ...draft,
    model: defaults.model,
    ...(draft.effort || !defaults.effort
      ? {}
      : { effort: defaults.effort as DelegationDraft["effort"] }),
  };
}

export interface DelegateAssignee {
  providerId: DelegationDraft["providerId"];
  /** Empty when neither the user nor the Auto table names a model. */
  model: string;
  effort?: string;
  source: DelegationIdentitySource;
  /** Why this model: the Auto table's sentence, or that the user chose it. */
  reason: string;
}

/**
 * Who will run the task as the form currently stands. A typed model wins and
 * reads as the user's choice; otherwise the Auto table's routed default is
 * shown with its own reason so the pick is never a mystery.
 */
export function describeDelegateAssignee(
  draft: DelegationDraft,
  defaults?: RoutedDelegateDefaults | null,
): DelegateAssignee {
  const model = draft.model.trim();
  if (model) {
    return {
      providerId: draft.providerId,
      model,
      ...(draft.effort ? { effort: draft.effort } : {}),
      source: "explicit",
      reason: "Chosen by you",
    };
  }
  if (defaults) {
    const effort = draft.effort ?? defaults.effort;
    return {
      providerId: draft.providerId,
      model: defaults.model,
      ...(effort ? { effort } : {}),
      source: "auto",
      reason: defaults.reason,
    };
  }
  return {
    providerId: draft.providerId,
    model: "",
    ...(draft.effort ? { effort: draft.effort } : {}),
    source: "provider-default",
    reason: `${getProviderLabel({ providerId: draft.providerId })} picks its default model.`,
  };
}

/**
 * One line the user can check before sending: what runs, with which gate,
 * where. The provider is named only when no model can be — a model name
 * already says which provider runs it.
 */
export function describeDelegationPlan(
  draft: DelegationDraft,
  defaults?: RoutedDelegateDefaults | null,
) {
  const { efforts } = catalogFor(draft.providerId);
  const model = draft.model.trim();
  const routedEffort =
    !draft.effort && !model && defaults?.effort
      ? findOptionLabel(
          efforts,
          defaults.effort as NonNullable<DelegationDraft["effort"]>,
        )
      : null;
  const modelSegment = model
    ? toHumanModelName({ model }) || model
    : defaults
      ? `Auto → ${toHumanModelName({ model: defaults.model }) || defaults.model}`
      : null;
  return [
    modelSegment ??
      `${getProviderLabel({ providerId: draft.providerId })} · Default model`,
    draft.effort
      ? `${findOptionLabel(efforts, draft.effort)} effort`
      : routedEffort
        ? `${routedEffort} effort (Auto)`
        : "Default effort",
    findOptionLabel(PERMISSION_OPTIONS, draft.permissionProfile).split(
      " · ",
    )[0],
    draft.isolated ? "Separate worktree" : "Shares your files",
  ].join(" · ");
}

/** The UI and agent tool use the same main-owned delegation coordinator. */
export function DelegateTaskForm({
  target,
  onCreated,
  defaultOpen = false,
}: {
  target: CollaborationTarget;
  onCreated: () => void;
  /** Start expanded. The panel mounts it collapsed so the rail stays short. */
  defaultOpen?: boolean;
}) {
  const formId = useId();
  const scope = useMemo(
    () => ({
      projectPath: target.projectPath,
      workspaceId: target.workspaceId,
      taskId: target.taskId,
    }),
    [target.projectPath, target.taskId, target.workspaceId],
  );
  const scopeKey = delegationDraftScopeKey(scope);
  const [open, setOpen] = useState(defaultOpen);
  const [choosingModel, setChoosingModel] = useState(false);
  const [draft, setDraft] = useState(createEmptyDelegationDraft);
  const draftRef = useRef(draft);
  const revisionRef = useRef(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [customModel, setCustomModel] = useState(false);
  const autoRoutingProfile = useAppStore(
    (state) => state.settings.autoRoutingProfile,
  );
  const routedDefaults = useMemo(
    () =>
      resolveRoutedDelegateDefaults({
        profile: autoRoutingProfile,
        providerId: draft.providerId,
      }),
    [autoRoutingProfile, draft.providerId],
  );
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setMessage("");
    const initial = createEmptyDelegationDraft();
    draftRef.current = initial;
    setDraft(initial);
    setCustomModel(false);
    setChoosingModel(false);
    void loadDelegationDraft(scope)
      .then((saved) => {
        if (cancelled) return;
        const next = saved ?? createEmptyDelegationDraft();
        draftRef.current = next;
        setDraft(next);
        // A saved model outside the picker catalog reopens as a custom id so
        // the value is visible instead of silently snapping to a default.
        setCustomModel(
          Boolean(next.model) &&
            !catalogFor(next.providerId).models.includes(next.model),
        );
        setLoaded(true);
        if (next.pendingRequest && next.deliveryUncertain) {
          setMessage(
            "Previous delivery was not confirmed. Retry without editing to check the same delegation safely.",
          );
        }
      })
      .catch(() => {
        if (cancelled) return;
        setMessage("The saved assignment could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [scope, scopeKey]);

  useEffect(
    () =>
      subscribeToAcceptedDelegationClear(scope, (delegationKey) => {
        if (draftRef.current.pendingRequest?.delegationKey !== delegationKey) {
          return;
        }
        const empty = createEmptyDelegationDraft();
        draftRef.current = empty;
        setDraft(empty);
        setCustomModel(false);
        setChoosingModel(false);
        revisionRef.current += 1;
        setMessage(
          "Task delegated. Open its conversation below to follow the work.",
        );
      }),
    [scope, scopeKey],
  );

  function change(patch: Parameters<typeof editDelegationDraft>[1]): void {
    const next = editDelegationDraft(draftRef.current, patch);
    draftRef.current = next;
    setDraft(next);
    const revision = ++revisionRef.current;
    setMessage("");
    void saveDelegationDraft(scope, next).catch(() => {
      if (revisionRef.current === revision) {
        setMessage(
          "The assignment could not be saved. It remains here so you can retry.",
        );
      }
    });
  }

  async function delegate() {
    if (busyRef.current || !loaded) return;
    const invoke = window.api?.runs?.delegateChildTask;
    if (!invoke) {
      setMessage("Delegation requires the desktop app.");
      return;
    }
    const prepared = prepareDelegationDraftRequest({
      scope,
      draft: applyRoutedDelegateDefaults(draftRef.current, routedDefaults),
      createDelegationKey: () => `delegate-${crypto.randomUUID()}`,
    });
    if (!prepared.ok) {
      setMessage(prepared.message);
      return;
    }
    draftRef.current = prepared.draft;
    setDraft(prepared.draft);
    const revision = ++revisionRef.current;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    let transportStarted = false;
    try {
      // The exact idempotent request must be durable before transport begins.
      await saveDelegationDraft(scope, prepared.draft);
      transportStarted = true;
      const response = await invoke(prepared.request);
      if (response.accepted) {
        let cleared = false;
        let clearFailed = false;
        try {
          cleared = await clearAcceptedDelegationDraft(
            scope,
            prepared.request.delegationKey,
          );
        } catch {
          clearFailed = true;
        }
        if (
          cleared &&
          revisionRef.current === revision &&
          draftRef.current.pendingRequest?.delegationKey ===
            prepared.request.delegationKey
        ) {
          const empty = createEmptyDelegationDraft();
          draftRef.current = empty;
          setDraft(empty);
          setCustomModel(false);
          setChoosingModel(false);
          revisionRef.current += 1;
        }
        setMessage(
          clearFailed
            ? "Task delegated, but its saved assignment could not be cleared. Retry unchanged to reopen the same task safely."
            : response.duplicate
              ? "This delegation already exists. Open its conversation below."
              : "Task delegated. Open its conversation below to follow the work.",
        );
        onCreated();
      } else {
        setMessage(response.message ?? "The delegation could not start.");
      }
    } catch {
      setMessage(
        transportStarted
          ? "Delivery could not be confirmed. Retry without editing to check the same delegation safely."
          : "The assignment could not be saved, so it was not sent. It remains here so you can retry.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const catalog = catalogFor(draft.providerId);
  const modelSelectValue = customModel
    ? CUSTOM_MODEL
    : catalog.models.includes(draft.model)
      ? draft.model
      : "";
  const disabled = busy || !loaded;
  const assignee = describeDelegateAssignee(draft, routedDefaults);
  const routedModelLabel =
    toHumanModelName({ model: routedDefaults.model }) || routedDefaults.model;
  const formPanelId = `${formId}-panel`;

  return (
    <section {...stylex.props(styles.contentStack)}>
      <div {...stylex.props(form.headerRow)}>
        <div {...stylex.props(form.headerText)}>
          <h3 {...stylex.props(styles.heading)}>Delegate a task</h3>
          <p {...stylex.props(form.caption)}>
            Hand a bounded assignment to another model
          </p>
        </div>
        <ActionButton
          type="button"
          size="xs"
          weight={open ? "quiet" : "secondary"}
          aria-expanded={open}
          aria-controls={formPanelId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close" : "New delegation"}
        </ActionButton>
      </div>
      {open ? (
        <form
          id={formPanelId}
          {...stylex.props(form.form)}
          onSubmit={(event) => {
            event.preventDefault();
            void delegate();
          }}
        >
          <fieldset
            disabled={disabled}
            {...stylex.props(styles.fieldsetReset, form.form)}
          >
            <div {...stylex.props(form.group)}>
              <label
                {...stylex.props(form.groupTitle)}
                htmlFor={`${formId}-prompt`}
              >
                Assignment
              </label>
              <AdsTextarea
                id={`${formId}-prompt`}
                autoFocus
                required
                maxLength={100000}
                rows={4}
                value={draft.prompt}
                onChange={(event) => change({ prompt: event.target.value })}
                placeholder={
                  "What to do: investigate why the nightly build fails.\n" +
                  "What to return: the cause, the evidence, and a proposed fix.\n" +
                  "How to verify: the failing job passes locally."
                }
              />
              <p {...stylex.props(form.caption)}>
                One bounded task. It gets its own conversation, permissions and
                result.
              </p>
            </div>

            <div {...stylex.props(form.group)}>
              <span {...stylex.props(form.groupTitle)}>Who runs it</span>
              <div {...stylex.props(form.assigneeRow)}>
                <div {...stylex.props(form.assigneeText)}>
                  <AgentIdentity
                    providerId={assignee.providerId}
                    model={assignee.model || null}
                    effort={assignee.effort ?? null}
                    source={assignee.source}
                    showSource
                  />
                  <span {...stylex.props(form.caption)}>{assignee.reason}</span>
                </div>
                <ActionButton
                  type="button"
                  size="xs"
                  weight="quiet"
                  aria-expanded={choosingModel}
                  aria-controls={`${formId}-model-controls`}
                  onClick={() => setChoosingModel((value) => !value)}
                >
                  {choosingModel ? "Done" : "Change"}
                </ActionButton>
              </div>
              {choosingModel ? (
                <div
                  id={`${formId}-model-controls`}
                  {...stylex.props(styles.compactStack)}
                >
                  <div {...stylex.props(form.controlsGrid)}>
                    <label
                      {...stylex.props(form.field)}
                      htmlFor={`${formId}-provider`}
                    >
                      <span {...stylex.props(form.fieldLabel)}>Provider</span>
                      <NativeSelect
                        controlOnly
                        id={`${formId}-provider`}
                        size="sm"
                        value={draft.providerId}
                        onChange={(event) => {
                          setCustomModel(false);
                          change({
                            providerId: event.target
                              .value as DelegationDraft["providerId"],
                            model: "",
                            effort: undefined,
                          });
                        }}
                      >
                        <option value="codex">Codex</option>
                        <option value="claude-code">Claude Code</option>
                      </NativeSelect>
                    </label>
                    <label
                      {...stylex.props(form.field)}
                      htmlFor={`${formId}-model`}
                    >
                      <span {...stylex.props(form.fieldLabel)}>Model</span>
                      <NativeSelect
                        controlOnly
                        id={`${formId}-model`}
                        size="sm"
                        value={modelSelectValue}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value === CUSTOM_MODEL) {
                            setCustomModel(true);
                            return;
                          }
                          setCustomModel(false);
                          change({ model: value });
                        }}
                      >
                        <option value="">Auto · {routedModelLabel}</option>
                        {catalog.models.map((value) => (
                          <option key={value} value={value}>
                            {toHumanModelName({ model: value }) || value}
                          </option>
                        ))}
                        <option value={CUSTOM_MODEL}>Custom model id…</option>
                      </NativeSelect>
                    </label>
                    <label
                      {...stylex.props(form.field)}
                      htmlFor={`${formId}-effort`}
                    >
                      <span {...stylex.props(form.fieldLabel)}>Effort</span>
                      <NativeSelect
                        controlOnly
                        id={`${formId}-effort`}
                        size="sm"
                        value={draft.effort ?? ""}
                        onChange={(event) =>
                          change({
                            effort: (event.target.value ||
                              undefined) as DelegationDraft["effort"],
                          })
                        }
                      >
                        <option value="">
                          {routedDefaults.effort
                            ? `Auto · ${findOptionLabel(catalog.efforts, routedDefaults.effort as NonNullable<DelegationDraft["effort"]>)}`
                            : "Provider default"}
                        </option>
                        {catalog.efforts.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </label>
                  </div>
                  {customModel ? (
                    <label
                      {...stylex.props(form.field)}
                      htmlFor={`${formId}-custom-model`}
                    >
                      <span {...stylex.props(form.fieldLabel)}>
                        Custom model id
                      </span>
                      <AdsInput
                        id={`${formId}-custom-model`}
                        maxLength={200}
                        value={draft.model}
                        autoFocus={!draft.model}
                        onChange={(event) =>
                          change({ model: event.target.value })
                        }
                        placeholder={
                          getDefaultModelForProvider({ providerId: draft.providerId })
                        }
                      />
                      <span {...stylex.props(form.caption)}>
                        Sent as typed. Leave empty to let Auto pick.
                      </span>
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div {...stylex.props(form.group)}>
              <span {...stylex.props(form.groupTitle)}>Guardrails</span>
              <label
                {...stylex.props(form.field)}
                htmlFor={`${formId}-permissions`}
              >
                <span {...stylex.props(form.fieldLabel)}>Permissions</span>
                <NativeSelect
                  controlOnly
                  id={`${formId}-permissions`}
                  size="sm"
                  value={draft.permissionProfile}
                  onChange={(event) =>
                    change({
                      permissionProfile: event.target
                        .value as DelegationDraft["permissionProfile"],
                    })
                  }
                >
                  {PERMISSION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label {...stylex.props(form.checkboxLabel)}>
                <Checkbox
                  controlOnly
                  checked={draft.isolated}
                  onCheckedChange={(checked) => change({ isolated: checked })}
                />
                <span>
                  Work in a separate Git worktree
                  {!draft.isolated ? (
                    <span {...stylex.props(form.checkboxNote, styles.warning)}>
                      Off: the task edits your files directly, and concurrent
                      edits can conflict.
                    </span>
                  ) : null}
                </span>
              </label>
              <label {...stylex.props(form.checkboxLabel)}>
                <Checkbox
                  controlOnly
                  checked={draft.keepOpen}
                  onCheckedChange={(checked) => change({ keepOpen: checked })}
                />
                <span>
                  Keep the task open for follow-ups after its first result
                  <span {...stylex.props(form.checkboxNote, styles.muted)}>
                    Release it once the assignment is finished.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
          <div {...stylex.props(styles.submitRow)}>
            <ActionButton
              type="submit"
              weight="primary"
              loading={busy}
              disabled={!loaded || !draft.prompt.trim()}
            >
              Delegate task
            </ActionButton>
            <span {...stylex.props(form.caption)}>
              {describeDelegationPlan(draft, routedDefaults)}
            </span>
          </div>
          <p role="status" {...stylex.props(styles.body, styles.muted)}>
            {!loaded && !message ? "Loading saved assignment…" : message}
          </p>
        </form>
      ) : null}
    </section>
  );
}
