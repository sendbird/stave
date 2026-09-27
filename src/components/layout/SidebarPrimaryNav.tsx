import * as stylex from "@stylexjs/stylex";
import { FolderKanban, LayoutGrid } from "lucide-react";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { transition } from "@/components/ads/recipes/transition";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { repositorySidebarStyles } from "@/components/layout/repository-workspace-sidebar.styles";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { isOpenProjectState } from "@/lib/projects/domain";
import { useAppStore } from "@/store/app.store";
import { countAllProjectNeeds, countProjectNeeds, useProjectsStore } from "@/store/projects-store";

const MAX_LISTED_PROJECTS = 5;

/**
 * The sidebar's top navigation: Fleet View, Projects, and the open projects
 * under it, each with what waits for you, so a goal in flight is one click
 * away from any workspace.
 */
export function SidebarPrimaryNav(props: { showFleetView: boolean }) {
  const surface = useAppStore((state) => state.activeAppSurface.kind);
  const openFleetView = useAppStore((state) => state.openFleetView);
  const openProjects = useAppStore((state) => state.openProjects);
  const projects = useProjectsStore((state) => state.projects);
  const details = useProjectsStore((state) => state.details);
  const selectedId = useProjectsStore((state) => state.selectedId);
  const select = useProjectsStore((state) => state.select);
  const open = projects.filter((project) => isOpenProjectState(project.state)).slice(0, MAX_LISTED_PROJECTS);
  // Every open project counts, including those past the few listed here.
  const totalNeeds = countAllProjectNeeds(projects, details);
  return (
    <>
      {props.showFleetView ? (
        <AdsButton
          layout="host"
          type="button"
          onClick={() => openFleetView()}
          aria-label="open-fleet-view"
          xstyle={[
            repositorySidebarStyles.navButton,
            transition.colors,
            surface === "fleet-view" ? repositorySidebarStyles.navButtonActive : repositorySidebarStyles.navButtonIdle,
          ]}
        >
          <LayoutGrid className={sx(repositorySidebarStyles.iconMd)} />
          Fleet View
        </AdsButton>
      ) : null}
      <AdsButton
        layout="host"
        type="button"
        onClick={() => openProjects()}
        aria-label={totalNeeds > 0 ? `Projects, ${totalNeeds} need you` : "Projects"}
        xstyle={[
          repositorySidebarStyles.navButton,
          transition.colors,
          surface === "projects" ? repositorySidebarStyles.navButtonActive : repositorySidebarStyles.navButtonIdle,
        ]}
      >
        <FolderKanban className={sx(repositorySidebarStyles.iconMd)} />
        <span className={sx(styles.label)}>Projects</span>
        {totalNeeds > 0 ? <span className={sx(styles.count)}>{totalNeeds}</span> : null}
      </AdsButton>
      {open.map((project) => {
        const needs = countProjectNeeds(details[project.id]);
        const active = surface === "projects" && selectedId === project.id;
        return (
          <AdsButton
            key={project.id}
            layout="host"
            type="button"
            onClick={() => {
              select(project.id);
              openProjects();
            }}
            aria-label={`Project ${project.name}${needs > 0 ? `, ${needs} need you` : ""}`}
            xstyle={[
              repositorySidebarStyles.navButton,
              styles.projectRow,
              transition.colors,
              active ? repositorySidebarStyles.navButtonActive : repositorySidebarStyles.navButtonIdle,
            ]}
          >
            <span className={sx(styles.dot, project.state === "paused" ? styles.dotPaused : needs > 0 ? styles.dotNeeds : styles.dotActive)} />
            <span className={sx(styles.label)}>{project.name}</span>
            {needs > 0 ? <span className={sx(styles.count)}>{needs}</span> : null}
          </AdsButton>
        );
      })}
    </>
  );
}

/** The collapsed sidebar's rail: Fleet View and Projects as icons, a dot when a project needs you. */
export function SidebarPrimaryNavCollapsed(props: { showFleetView: boolean }) {
  const surface = useAppStore((state) => state.activeAppSurface.kind);
  const openFleetView = useAppStore((state) => state.openFleetView);
  const openProjects = useAppStore((state) => state.openProjects);
  const projects = useProjectsStore((state) => state.projects);
  const details = useProjectsStore((state) => state.details);
  const needs = projects
    .filter((project) => isOpenProjectState(project.state))
    .reduce((sum, project) => sum + countProjectNeeds(details[project.id]), 0);
  const railButton = (active: boolean) => [
    repositorySidebarStyles.collapsedButton,
    styles.railButton,
    active ? repositorySidebarStyles.collapsedButtonActive : repositorySidebarStyles.collapsedButtonIdle,
  ];
  return (
    <>
      {props.showFleetView ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="sm" xstyle={railButton(surface === "fleet-view")} onClick={() => openFleetView()} aria-label="open-fleet-view" />
            }
          >
            <LayoutGrid className={sx(repositorySidebarStyles.iconMd)} />
          </TooltipTrigger>
          <TooltipContent side="right">Fleet View</TooltipContent>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              xstyle={railButton(surface === "projects")}
              onClick={() => openProjects()}
              aria-label={needs > 0 ? `Projects, ${needs} need you` : "Projects"}
            />
          }
        >
          <FolderKanban className={sx(repositorySidebarStyles.iconMd)} />
          {needs > 0 ? <span aria-hidden className={sx(styles.railDot)} /> : null}
        </TooltipTrigger>
        <TooltipContent side="right">{needs > 0 ? `Projects · ${needs} need you` : "Projects"}</TooltipContent>
      </Tooltip>
    </>
  );
}

const styles = stylex.create({
  railButton: { position: "relative" },
  railDot: {
    position: "absolute",
    top: 5,
    insetInlineEnd: 5,
    width: 7,
    height: 7,
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-warning"],
    boxShadow: `0 0 0 2px ${vars["--ads-color-canvas"]}`,
  },
  label: { flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "start" },
  projectRow: { height: 28, paddingInlineStart: vars["--ads-space-24"], fontSize: vars["--ads-font-size-caption"] },
  dot: { flex: "0 0 auto", width: 6, height: 6, borderRadius: vars["--ads-radius-full"] },
  dotActive: { backgroundColor: vars["--ads-color-accent"] },
  dotNeeds: { backgroundColor: vars["--ads-color-warning"] },
  dotPaused: { backgroundColor: vars["--ads-color-border-strong"] },
  count: {
    flex: "0 0 auto",
    minWidth: 18,
    height: 18,
    paddingInline: 5,
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-warning-soft"],
    color: vars["--ads-color-warning-text"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: "18px",
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
  },
});
