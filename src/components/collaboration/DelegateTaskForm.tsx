import { Checkbox } from "@/components/ads/components/Checkbox";
import { Textarea as AdsTextarea } from "@/components/ui/textarea";
import { Input as AdsInput } from "@/components/ui/input";
import { NativeSelect } from "@/components/ads/components/NativeSelect";
import {
  CLAUDE_SDK_MODEL_OPTIONS,
  CODEX_MODEL_OPTIONS,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import {
  CLAUDE_EFFORT_OPTIONS,
  CODEX_EFFORT_OPTIONS,
  findOptionLabel,
} from "@/lib/providers/runtime-option-contract";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ActionButton } from "@/components/system/ActionButton";
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
import { focusRing } from "../ads/recipes/focus-ring";

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

/** One line the user can check before sending: what runs, where, with which gate. */
export function describeDelegationPlan(draft: DelegationDraft) {
  const { efforts } = catalogFor(draft.providerId);
  const model = draft.model.trim();
  return [
    draft.providerId === "codex" ? "Codex" : "Claude Code",
    model ? toHumanModelName({ model }) || model : "Default model",
    draft.effort
      ? `${findOptionLabel(efforts, draft.effort)} effort`
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
}: {
  target: CollaborationTarget;
  onCreated: () => void;
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
  const [draft, setDraft] = useState(createEmptyDelegationDraft);
  const draftRef = useRef(draft);
  const revisionRef = useRef(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [customModel, setCustomModel] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setMessage("");
    const initial = createEmptyDelegationDraft();
    draftRef.current = initial;
    setDraft(initial);
    setCustomModel(false);
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
      draft: draftRef.current,
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

  return (
    <details {...stylex.props(styles.card)}>
      <summary {...stylex.props(styles.cursor, styles.heading, focusRing.ring)}>
        Delegate a task to another model
      </summary>
      <form
        {...stylex.props(styles.contentStack, styles.marginTop3)}
        onSubmit={(event) => {
          event.preventDefault();
          void delegate();
        }}
      >
        <p {...stylex.props(styles.body, styles.muted)}>
          Give one bounded assignment, its expected result, and a completion
          check. The new task has its own conversation and permissions.
        </p>
        <fieldset disabled={disabled} {...stylex.props(styles.fieldsetReset)}>
          <label {...stylex.props(styles.label)} htmlFor={`${formId}-prompt`}>
            <span {...stylex.props(styles.labelText)}>Assignment</span>
            <AdsTextarea
              id={`${formId}-prompt`}
              required
              maxLength={100000}
              rows={4}
              value={draft.prompt}
              onChange={(event) => change({ prompt: event.target.value })}
              placeholder="Investigate the failure. Report the cause, evidence, and a proposed fix."
            />
          </label>
          <div {...stylex.props(styles.grid)}>
            <label
              {...stylex.props(styles.label)}
              htmlFor={`${formId}-provider`}
            >
              <span {...stylex.props(styles.labelText)}>Provider</span>
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
            <label {...stylex.props(styles.label)} htmlFor={`${formId}-model`}>
              <span {...stylex.props(styles.labelText)}>Model</span>
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
                <option value="">Provider default</option>
                {catalog.models.map((value) => (
                  <option key={value} value={value}>
                    {toHumanModelName({ model: value }) || value}
                  </option>
                ))}
                <option value={CUSTOM_MODEL}>Custom model id…</option>
              </NativeSelect>
            </label>
            <label {...stylex.props(styles.label)} htmlFor={`${formId}-effort`}>
              <span {...stylex.props(styles.labelText)}>Effort</span>
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
                <option value="">Provider default</option>
                {catalog.efforts.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label
              {...stylex.props(styles.label)}
              htmlFor={`${formId}-permissions`}
            >
              <span {...stylex.props(styles.labelText)}>Permissions</span>
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
          </div>
          {customModel ? (
            <label
              {...stylex.props(styles.label)}
              htmlFor={`${formId}-custom-model`}
            >
              <span {...stylex.props(styles.labelText)}>Custom model id</span>
              <AdsInput
                id={`${formId}-custom-model`}
                maxLength={200}
                value={draft.model}
                autoFocus={!draft.model}
                onChange={(event) => change({ model: event.target.value })}
                placeholder={
                  draft.providerId === "codex"
                    ? "gpt-5.6-terra"
                    : "claude-opus-5"
                }
              />
              <span {...stylex.props(styles.details, styles.muted)}>
                Sent as typed. Leave empty to use the provider default.
              </span>
            </label>
          ) : null}
          <div {...stylex.props(styles.compactStack)}>
            <label {...stylex.props(styles.checkboxLabel)}>
              <Checkbox
                controlOnly
                checked={draft.isolated}
                onCheckedChange={(checked) => change({ isolated: checked })}
              />
              <span>
                Work in a separate Git worktree
                {!draft.isolated ? (
                  <span {...stylex.props(styles.checkboxNote, styles.warning)}>
                    Off: the task edits your files directly, and concurrent
                    edits can conflict.
                  </span>
                ) : null}
              </span>
            </label>
            <label {...stylex.props(styles.checkboxLabel)}>
              <Checkbox
                controlOnly
                checked={draft.keepOpen}
                onCheckedChange={(checked) => change({ keepOpen: checked })}
              />
              <span>
                Keep the task open for follow-ups after its first result
                <span {...stylex.props(styles.checkboxNote, styles.muted)}>
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
          <span {...stylex.props(styles.details, styles.muted)}>
            {describeDelegationPlan(draft)}
          </span>
        </div>
        <p role="status" {...stylex.props(styles.body, styles.muted)}>
          {!loaded && !message ? "Loading saved assignment…" : message}
        </p>
      </form>
    </details>
  );
}
