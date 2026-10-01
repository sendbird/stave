import { useCallback, useEffect, useState } from "react";
import { FolderKanban, TriangleAlert, X } from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { Button } from "@/components/ads/components/Button";
import { EmptyState } from "@/components/ads/components/EmptyState";
import { IconTile, iconTileGlyphSizes } from "@/components/ads/components/IconTile";
import { Select } from "@/components/ads/components/Select";
import { sx } from "@/components/ads/utils/stylex";
import { centerStyles } from "@/components/layout/automation-center/automation-center-view.styles";
import type { ProjectDetail } from "@/lib/projects/api";
import { isOpenProjectState, type Project } from "@/lib/projects/domain";
import { useAppStore } from "@/store/app.store";
import { countProjectNeeds, useProjectsStore } from "@/store/projects-store";
import { CoordinatorDock, type CoordinatorMessageLoader } from "./CoordinatorDock";
import { ProjectHome } from "./ProjectHome";
import { projectStyles as styles } from "./projects.styles";

const STATE_TONE = { active: "accent", paused: "warning", completed: "success", cancelled: "neutral", expired: "neutral" } as const;

function ProjectCard(props: { project: Project; detail: ProjectDetail | undefined; active: boolean; onSelect: () => void }) {
  const { detail } = props;
  const needs = countProjectNeeds(detail);
  const running = detail?.missions.filter((mission) => mission.state === "running" || mission.state === "paused").length ?? 0;
  const done = detail?.missions.filter((mission) => mission.state === "completed").length ?? 0;
  return (
    <Button
      layout="host"
      variant="quiet"
      press="none"
      aria-current={props.active ? "true" : undefined}
      xstyle={[styles.card, props.active && styles.cardActive]}
      onClick={props.onSelect}
    >
      <span className={sx(styles.cardTitleRow)}>
        <span className={sx(styles.cardTitle)}>{props.project.name}</span>
        {needs > 0 ? (
          <span className={sx(styles.needsCount)} aria-label={`${needs} need you`}>
            {needs}
          </span>
        ) : (
          <Badge size="sm" tone={STATE_TONE[props.project.state]} dot>
            {props.project.state === "active" ? "Active" : props.project.state[0]!.toUpperCase() + props.project.state.slice(1)}
          </Badge>
        )}
      </span>
      <span className={sx(styles.cardMeta)}>
        {running} running · {done} done
      </span>
    </Button>
  );
}

/**
 * No projects: they are deprecated and new ones cannot be started, so the
 * view only says where the work went.
 */
export function ProjectsEmpty() {
  return (
    <div className={sx(styles.scroll)}>
      <div className={sx(styles.empty)}>
        <div className={sx(styles.emptyIntro)}>
          <IconTile size="md" tone="accent">
            <FolderKanban size={iconTileGlyphSizes.md} />
          </IconTile>
          <h2 className={sx(styles.emptyTitle)}>No projects</h2>
          <p className={sx(styles.emptyText)}>
            Projects are being retired. Assign work to an agent instead; an agent with a workflow carries it stage by stage.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Every project, open ones first, each with what it needs from you. */
export function ProjectList(props: {
  projects: readonly Project[];
  details: Record<string, ProjectDetail>;
  selectedId: string | null;
  onSelect: (projectId: string) => void;
}) {
  const open = props.projects.filter((project) => isOpenProjectState(project.state));
  const ended = props.projects.filter((project) => !isOpenProjectState(project.state));
  const card = (project: Project) => (
    <ProjectCard
      key={project.id}
      project={project}
      detail={props.details[project.id]}
      active={project.id === props.selectedId}
      onSelect={() => props.onSelect(project.id)}
    />
  );
  return (
    <aside className={sx(styles.master)} aria-label="Projects">
      {open.map(card)}
      {ended.length > 0 ? <p className={sx(styles.masterLabel)}>Ended</p> : null}
      {ended.map(card)}
    </aside>
  );
}

/**
 * The width of the element the returned ref lands on, following resizes; 0
 * before layout (and in tests). A callback ref, so an element that mounts
 * later — the body after the first project is created — is observed too.
 */
function useElementWidth(): [number, (element: HTMLElement | null) => (() => void) | undefined] {
  const [width, setWidth] = useState(0);
  const ref = useCallback((element: HTMLElement | null) => {
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    setWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [width, ref];
}

/** Projects (or one project) could not be read: why, and a way to try again. */
export function ProjectsLoadFailure(props: { title: string; message: string; onRetry: () => Promise<void> }) {
  const [retrying, setRetrying] = useState(false);
  return (
    <div className={sx(styles.scroll)}>
      <div className={sx(styles.failure)}>
        <EmptyState
          role="alert"
          tone="danger"
          icon={<TriangleAlert size={iconTileGlyphSizes.xl} />}
          title={props.title}
          description={props.message}
          action={{
            children: "Try again",
            loading: retrying,
            onClick: () => {
              setRetrying(true);
              void props.onRetry().finally(() => setRetrying(false));
            },
          }}
        />
      </div>
    </div>
  );
}

/** The Projects surface: every project on the left, the one in focus on the right. */
export function ProjectsView(props: { loadCoordinatorMessages?: CoordinatorMessageLoader } = {}) {
  const projects = useProjectsStore((state) => state.projects);
  const selectedId = useProjectsStore((state) => state.selectedId);
  const select = useProjectsStore((state) => state.select);
  const loaded = useProjectsStore((state) => state.loaded);
  const loadFailure = useProjectsStore((state) => state.loadFailure);
  const load = useProjectsStore((state) => state.load);
  const refresh = useProjectsStore((state) => state.refresh);
  const closeProjects = useAppStore((state) => state.closeProjects);
  const details = useProjectsStore((state) => state.details);
  const selected =
    projects.find((project) => project.id === selectedId) ??
    projects.find((project) => isOpenProjectState(project.state)) ??
    projects[0] ??
    null;
  const detail = selected ? details[selected.id] : undefined;
  const detailFailure = useProjectsStore((state) => (selected ? (state.detailFailureById[selected.id] ?? null) : null));
  const [width, bodyRef] = useElementWidth();
  const dockOpen = useProjectsStore((state) => state.dockOpen);
  const dockOverlayOpen = useProjectsStore((state) => state.dockOverlayOpen);
  const openCoordinatorDock = useProjectsStore((state) => state.openCoordinatorDock);
  const closeCoordinatorDock = useProjectsStore((state) => state.closeCoordinatorDock);
  const runCommand = useProjectsStore((state) => state.runCommand);
  const focusTaskAttention = useAppStore((state) => state.focusTaskAttention);
  // Room decides the layout: the conversation docks from 56rem and the list
  // stays beside it from 80rem; narrower, the conversation floats.
  const dockMode: "docked" | "overlay" = width >= 896 ? "docked" : "overlay";
  const dockVisible = dockMode === "docked" ? dockOpen : dockOverlayOpen;
  const listShown = dockMode === "docked" && dockVisible ? width >= 1280 : width >= 768;
  const openCoordinatorTask = (target: ProjectDetail) => {
    closeProjects();
    void focusTaskAttention({
      workspaceId: target.project.coordinator.workspaceId,
      taskId: target.project.coordinator.taskId,
      repositoryPath: target.project.repositoryPath,
      refreshFromPersistence: true,
    });
  };

  useEffect(() => {
    if (selected && !detail) select(selected.id);
  }, [detail, select, selected]);

  return (
    <div className={sx(centerStyles.root)} data-testid="projects-view">
      <header className={sx(centerStyles.header)}>
        <div className={sx(centerStyles.headerText)}>
          <div className={sx(centerStyles.headerTitleRow)}>
            <FolderKanban className={sx(centerStyles.headerIcon)} />
            <h1 className={sx(centerStyles.headerTitle)}>Projects</h1>
          </div>
          <p className={sx(centerStyles.headerSubtitle)}>
            Your existing projects keep working. Projects are deprecated and new ones cannot be started.
          </p>
        </div>
        <div className={sx(centerStyles.headerActions)}>
          <Button variant="quiet" size="sm" xstyle={centerStyles.iconButton} aria-label="Close Projects" onClick={closeProjects}>
            <X className={sx(centerStyles.actionIcon)} />
          </Button>
        </div>
      </header>

      {loadFailure && projects.length === 0 ? (
        <ProjectsLoadFailure title="Projects could not be loaded" message={loadFailure} onRetry={load} />
      ) : loaded && projects.length === 0 ? (
        <ProjectsEmpty />
      ) : (
        <div
          ref={bodyRef}
          className={sx(
            styles.body,
            listShown && dockMode === "docked" && dockVisible
              ? styles.bodyListDock
              : listShown
                ? styles.bodyList
                : dockMode === "docked" && dockVisible
                  ? styles.bodyDock
                  : null,
          )}
        >
          {listShown ? (
            <ProjectList projects={projects} details={details} selectedId={selected?.id ?? null} onSelect={select} />
          ) : null}
          <div className={sx(styles.scroll)}>
            {!listShown && projects.length > 1 ? (
              <div className={sx(styles.picker)}>
                <Select
                  size="sm"
                  aria-label="Project"
                  value={selected?.id ?? ""}
                  options={projects.map((project) => ({ value: project.id, label: project.name }))}
                  onValueChange={(value) => select(String(value))}
                />
              </div>
            ) : null}
            {detail ? (
              <ProjectHome detail={detail} coordinatorDocked={dockVisible} onTalkToCoordinator={openCoordinatorDock} />
            ) : selected && detailFailure ? (
              <ProjectsLoadFailure
                title={`“${selected.name}” could not be loaded`}
                message={detailFailure}
                onRetry={() => refresh(selected.id)}
              />
            ) : null}
          </div>
          {detail && dockVisible ? (
            <div className={sx(dockMode === "docked" ? styles.dockColumn : styles.dockOverlay)}>
              <CoordinatorDock
                // A dock per project: a message typed for one never goes to another.
                key={detail.project.id}
                detail={detail}
                onSend={async (text) => {
                  const response = await runCommand("messageCoordinator", { projectId: detail.project.id, text });
                  return { ok: response.ok, message: response.message };
                }}
                onOpenTask={() => openCoordinatorTask(detail)}
                onClose={() => closeCoordinatorDock(dockMode)}
                loadMessages={props.loadCoordinatorMessages}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
