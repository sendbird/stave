import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { ActionButton } from "@/components/system/ActionButton";
import { OpenPathDialog } from "./OpenPathDialog";
import { useAppStore } from "@/store/app.store";
import { workspaceWelcomeStyles as styles } from "./workspace-welcome.styles";

export function WorkspaceWelcome() {
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-labelledby="workspace-welcome-title"
      className={sx(styles.root)}
      data-testid="workspace-welcome"
    >
      <div className={sx(styles.column)}>
        <div className={sx(styles.intro)}>
          <p className={sx(styles.eyebrow)}>
            YOUR WORK, IN ONE PLACE
          </p>
          <h1
            id="workspace-welcome-title"
            className={sx(styles.title)}
          >
            From a task to a result you can trust.
          </h1>
          <p className={sx(styles.lede)}>
            Use agents in your local projects. Keep tickets, notes, code, and
            evidence together so you can pick up where you left off.
          </p>
        </div>
        <div className={sx(styles.action)}>
          <ActionButton weight="primary" size="lg" onClick={() => setOpen(true)}>
            <FolderOpen aria-hidden="true" className={sx(styles.actionIcon)} />
            Open a project
          </ActionButton>
          <p className={sx(styles.actionHint)}>
            Choose a folder on your computer. You can connect Jira or Crane
            later.
          </p>
        </div>
        <ol className={sx(styles.steps)}>
          <li>
            <strong className={sx(styles.stepLead)}>
              1. Start with an outcome.
            </strong>{" "}
            A task can be a code change, an investigation, or a document. Choose
            your agent when you start.
          </li>
          <li>
            <strong className={sx(styles.stepLead)}>
              2. Keep the work together.
            </strong>{" "}
            A workspace holds your tasks, files, and terminals. Keep goals,
            decisions, and evidence in Information. Use a separate worktree when changes need isolation.
          </li>
          <li>
            <strong className={sx(styles.stepLead)}>3. Review and continue.</strong>{" "}
            Fleet shows work that needs your attention. Open a task to review results and
            checks, then request changes or take the next action.
          </li>
        </ol>
      </div>
      <OpenPathDialog
        open={open}
        onOpenChange={setOpen}
        onSubmitPath={(inputPath) =>
          useAppStore.getState().openProjectFromPath({ inputPath })
        }
        onBrowse={async () => {
          await useAppStore.getState().createProject({});
        }}
      />
    </section>
  );
}
