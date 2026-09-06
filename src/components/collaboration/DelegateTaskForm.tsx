import { Checkbox } from "@/components/ads/components/Checkbox";
import { Textarea as AdsTextarea } from "@/components/ui/textarea";
import { Input as AdsInput } from "@/components/ui/input";
import { NativeSelect } from "@/components/ads/components/NativeSelect";
import {
  CLAUDE_SDK_MODEL_OPTIONS,
  CODEX_MODEL_OPTIONS,
} from "@/lib/providers/model-catalog";
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
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setMessage("");
    const initial = createEmptyDelegationDraft();
    draftRef.current = initial;
    setDraft(initial);
    void loadDelegationDraft(scope)
      .then((saved) => {
        if (cancelled) return;
        const next = saved ?? createEmptyDelegationDraft();
        draftRef.current = next;
        setDraft(next);
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
        <fieldset
          disabled={busy || !loaded}
          {...stylex.props(styles.contentStack)}
        >
          <label {...stylex.props(styles.label)} htmlFor={`${formId}-prompt`}>
            <span>Assignment</span>
            <AdsTextarea
              id={`${formId}-prompt`}
              required
              maxLength={100000}
              rows={4}
              xstyle={styles.field}
              value={draft.prompt}
              onChange={(event) => change({ prompt: event.target.value })}
              placeholder="Investigate the failure. Report the cause, evidence, and a proposed fix."
            />
          </label>
          <div {...stylex.props(styles.grid)}>
            <label {...stylex.props(styles.label)}>
              <span>Provider</span>
              <NativeSelect
                controlOnly
                className={stylex.props(styles.field).className}
                value={draft.providerId}
                onChange={(event) =>
                  change({
                    providerId: event.target
                      .value as DelegationDraft["providerId"],
                    model: "",
                  })
                }
              >
                <option value="codex">Codex</option>
                <option value="claude-code">Claude Code</option>
              </NativeSelect>
            </label>
            <label {...stylex.props(styles.label)}>
              <span>Model (optional)</span>
              <AdsInput
                xstyle={styles.field}
                list={`${formId}-models`}
                maxLength={200}
                value={draft.model}
                onChange={(event) => change({ model: event.target.value })}
                placeholder="Provider default"
              />
              <datalist id={`${formId}-models`}>
                {(draft.providerId === "codex"
                  ? CODEX_MODEL_OPTIONS
                  : CLAUDE_SDK_MODEL_OPTIONS
                ).map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </label>
            <label {...stylex.props(styles.label)}>
              <span>Permissions</span>
              <NativeSelect
                controlOnly
                className={stylex.props(styles.field).className}
                value={draft.permissionProfile}
                onChange={(event) =>
                  change({
                    permissionProfile: event.target
                      .value as DelegationDraft["permissionProfile"],
                  })
                }
              >
                <option value="guided">Guided · ask when needed</option>
                <option value="manual">Manual · explicit approvals</option>
                <option value="auto">Automatic · allow execution</option>
              </NativeSelect>
            </label>
          </div>
          <label {...stylex.props(styles.checkboxLabel)}>
            <Checkbox
              controlOnly

              checked={draft.isolated}
              onCheckedChange={(checked) => change({ isolated: checked })}
            />
            <span>Use a separate Git worktree for file changes</span>
          </label>
          <label {...stylex.props(styles.checkboxLabel)}>
            <Checkbox
              controlOnly

              checked={draft.keepOpen}
              onCheckedChange={(checked) => change({ keepOpen: checked })}
            />
            <span>
              Keep available for follow-up after the first result. Release it
              when the assignment is finished.
            </span>
          </label>
          {!draft.isolated ? (
            <p {...stylex.props(styles.body, styles.warning)}>
              This task will share your files. Concurrent edits can conflict.
            </p>
          ) : null}
        </fieldset>
        <ActionButton
          xstyle={styles.selfStart}
          type="submit"
          weight="primary"
          loading={busy}
          disabled={!loaded || !draft.prompt.trim()}
        >
          Delegate task
        </ActionButton>
        <p role="status" {...stylex.props(styles.body, styles.muted)}>
          {!loaded && !message ? "Loading saved assignment…" : message}
        </p>
      </form>
    </details>
  );
}
