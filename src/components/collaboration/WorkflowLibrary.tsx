import { Input as AdsInput } from "@/components/ui/input";
import { useState } from "react";
import { ActionButton } from "@/components/system/ActionButton";
import {
  WORKFLOW_STARTERS,
  appendWorkflowDraft,
} from "@/lib/collaboration/workflows";
import { STAVE_OPEN_SETTINGS_EVENT, useAppStore } from "@/store/app.store";
import * as stylex from "@stylexjs/stylex";
import { collaborationStyles as styles } from "./collaboration.styles";
import { focusRing } from "../ads/recipes/focus-ring";

export function WorkflowLibrary({
  taskId,
  workspaceId,
  projectPath,
  onDraftReady,
  onOpenProject,
}: {
  taskId: string | null;
  workspaceId: string | null;
  projectPath: string | null;
  onDraftReady?: () => void;
  onOpenProject?: () => void;
}) {
  const available = useAppStore(
    (s) =>
      Boolean(workspaceId && projectPath) &&
      s.activeWorkspaceId === workspaceId &&
      s.projectPath === projectPath &&
      (!taskId || s.tasks.some((t) => t.id === taskId)),
  );
  const macros = useAppStore((s) => s.settings.macros);
  const presets = useAppStore((s) => s.settings.taskPresets);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const matches = (value: string) =>
    value.toLowerCase().includes(query.trim().toLowerCase());
  const workflows = WORKFLOW_STARTERS.filter((w) =>
    matches(w.label + " " + w.description),
  );
  const visibleMacros = macros.filter((m) =>
    matches(m.label + " " + (m.description ?? "")),
  );
  const visiblePresets = presets.filter((p) =>
    matches(p.label + " " + p.provider),
  );
  function currentWorkspace() {
    const store = useAppStore.getState();
    if (
      !workspaceId ||
      !projectPath ||
      store.activeWorkspaceId !== workspaceId ||
      store.projectPath !== projectPath
    ) {
      setStatus("Open the target workspace before using this library item.");
      return null;
    }
    return store;
  }
  function append(prompt: string, title: string) {
    let store = currentWorkspace();
    if (!store) return;
    if (!taskId) {
      store.createTask({ title });
      store = useAppStore.getState();
    }
    const destination = taskId || store.activeTaskId;
    if (!destination || !store.tasks.some((task) => task.id === destination))
      return;
    store.updatePromptDraft({
      taskId: destination,
      patch: {
        text: appendWorkflowDraft(
          store.promptDraftByTask[destination]?.text ?? "",
          prompt,
        ),
      },
    });
    setStatus("Added to your draft. Review it before sending.");
    onDraftReady?.();
  }
  const openSettings = (section: "macros" | "presets") =>
    window.dispatchEvent(
      new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, { detail: { section } }),
    );
  if (!available && taskId && workspaceId && projectPath)
    return (
      <div {...stylex.props(styles.contentStack)}>
        <p {...stylex.props(styles.body, styles.muted)}>
          Open this task to edit its draft or use its workspace tools.
        </p>
        <ActionButton
          xstyle={styles.selfStart}
          onClick={() =>
            void useAppStore.getState().focusTaskAttention({
              taskId,
              workspaceId,
              projectPath,
              refreshFromPersistence: true,
            })
          }
        >
          Open task
        </ActionButton>
      </div>
    );
  return (
    <div {...stylex.props(styles.panelStack)}>
      {!available ? (
        <div {...stylex.props(styles.compactStack)}>
          <p {...stylex.props(styles.body, styles.muted)}>
            Explore the library now. Open a project and workspace to use these
            instructions and tools.
          </p>
          {onOpenProject ? (
            <ActionButton xstyle={styles.selfStart} onClick={onOpenProject}>
              Open a project
            </ActionButton>
          ) : null}
        </div>
      ) : null}
      <label {...stylex.props(styles.label)}>
        <span {...stylex.props(styles.srOnly)}>
          Find a workflow, macro, or preset
        </span>
        <AdsInput
          xstyle={styles.searchField}
          placeholder="Find a workflow, macro, or preset…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {query.trim() &&
      !workflows.length &&
      !visibleMacros.length &&
      !visiblePresets.length ? (
        <p role="status" {...stylex.props(styles.body, styles.muted)}>
          No library items match your search. Try a shorter name or clear the
          search.
        </p>
      ) : null}
      <section {...stylex.props(styles.librarySectionStack)}>
        <h3 {...stylex.props(styles.heading)}>
          Workflows · what to accomplish
        </h3>
        {workflows.map((w) => (
          <details key={w.id} {...stylex.props(styles.card)}>
            <summary
              {...stylex.props(styles.cursor, styles.heading, focusRing.ring)}
            >
              {w.label}
            </summary>
            <p {...stylex.props(styles.body, styles.muted, styles.marginY2)}>
              {w.description}
            </p>
            <p
              {...stylex.props(
                styles.body,
                styles.preWrap,
                styles.marginBottom3,
              )}
            >
              {w.prompt}
            </p>
            <ActionButton
              xstyle={styles.selfStart}
              disabled={!available}
              onClick={() => append(w.prompt, w.label)}
            >
              {taskId ? "Add to draft" : "Start a task draft"}
            </ActionButton>
          </details>
        ))}
      </section>
      <section {...stylex.props(styles.librarySectionStack)}>
        <h3 {...stylex.props(styles.heading)}>
          Macros · reusable instructions
        </h3>
        <ActionButton
          xstyle={styles.selfStart}
          weight="quiet"
          onClick={() => openSettings("macros")}
        >
          Manage macros
        </ActionButton>
        <p {...stylex.props(styles.body, styles.muted)}>
          Preview saved instructions here. Adding a macro keeps your current
          draft and does not run it or change its model.
        </p>
        {macros.length ? (
          visibleMacros.map((m) => (
            <details key={m.id} {...stylex.props(styles.card)}>
              <summary
                {...stylex.props(styles.cursor, styles.heading, focusRing.ring)}
              >
                {m.label}
              </summary>
              <p
                {...stylex.props(
                  styles.body,
                  styles.preWrap,
                  styles.breakWords,
                  styles.marginY2,
                )}
              >
                {m.body}
              </p>
              <ActionButton
                xstyle={styles.selfStart}
                disabled={!available}
                onClick={() => append(m.body, m.label)}
              >
                {taskId ? "Add instructions to draft" : "Start a task draft"}
              </ActionButton>
            </details>
          ))
        ) : (
          <p {...stylex.props(styles.body, styles.muted)}>
            Save repeatable instructions in Settings → Macros.
          </p>
        )}
      </section>
      <section {...stylex.props(styles.librarySectionStack)}>
        <h3 {...stylex.props(styles.heading)}>Presets · how to start</h3>
        <ActionButton
          xstyle={styles.selfStart}
          weight="quiet"
          onClick={() => openSettings("presets")}
        >
          Manage presets
        </ActionButton>
        <p {...stylex.props(styles.body, styles.muted)}>
          A preset opens a new task with its own model and effort, or a terminal
          with saved context. Other tasks keep their settings.
        </p>
        <div {...stylex.props(styles.wrap)}>
          {visiblePresets.map((p) => (
            <ActionButton
              xstyle={styles.selfStart}
              key={p.id}
              disabled={!available}
              title={[p.provider, p.model, p.effort, p.contextMode]
                .filter(Boolean)
                .join(" · ")}
              onClick={() => {
                const store = currentWorkspace();
                if (
                  !store ||
                  !store.settings.taskPresets.some(
                    (preset) => preset.id === p.id,
                  )
                )
                  return;
                store.applyTaskPreset({ presetId: p.id });
                onDraftReady?.();
              }}
            >
              {p.label} · {p.kind === "task" ? "New task" : "Open terminal"}
            </ActionButton>
          ))}
        </div>
      </section>
      <section {...stylex.props(styles.librarySectionStack)}>
        <h3 {...stylex.props(styles.heading)}>
          Workspace tools · commands and services
        </h3>
        <p {...stylex.props(styles.body, styles.muted)}>
          Run project commands, inspect service logs, and configure automatic
          hooks.
        </p>
        <ActionButton
          xstyle={styles.selfStart}
          disabled={!available}
          onClick={() => {
            const store = currentWorkspace();
            if (!store) return;
            store.setLayout({
              patch: {
                sidebarOverlayVisible: true,
                sidebarOverlayTab: "scripts",
              },
            });
            onDraftReady?.();
          }}
        >
          Open workspace tools
        </ActionButton>
      </section>
      <p role="status" {...stylex.props(styles.body, styles.muted)}>
        {status}
      </p>
    </div>
  );
}
