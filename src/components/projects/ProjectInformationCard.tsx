import * as stylex from "@stylexjs/stylex";
import { ArrowUpRight, FolderKanban, Library } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { IconTile, iconTileGlyphSizes } from "@/components/ads/components/IconTile";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import type { ProjectDetail } from "@/lib/projects/api";
import { isOpenProjectState } from "@/lib/projects/domain";
import { useAppStore } from "@/store/app.store";
import { countProjectNeeds, useProjectsStore } from "@/store/projects-store";

/** The open project a workspace works for — as its coordinator or as a mission — if any. */
export function findWorkspaceProject(
  details: Record<string, ProjectDetail>,
  workspaceId: string,
): { detail: ProjectDetail; role: "coordinator" | "mission" } | null {
  for (const detail of Object.values(details)) {
    if (!isOpenProjectState(detail.project.state)) continue;
    if (detail.project.coordinator.workspaceId === workspaceId) return { detail, role: "coordinator" };
    if (detail.missions.some((mission) => mission.workspaceId === workspaceId)) return { detail, role: "mission" };
  }
  return null;
}

/**
 * The Information panel's link to the project a workspace works for: what it
 * is, what needs you, and its library one click away.
 */
export function ProjectInformationCard(props: { workspaceId: string }) {
  const details = useProjectsStore((state) => state.details);
  const select = useProjectsStore((state) => state.select);
  const setDetailTab = useProjectsStore((state) => state.setDetailTab);
  const openProjects = useAppStore((state) => state.openProjects);
  const found = findWorkspaceProject(details, props.workspaceId);
  if (!found) return null;
  const { detail, role } = found;
  const needs = countProjectNeeds(detail);
  const open = (tab: "memory" | "library") => {
    select(detail.project.id);
    setDetailTab(tab);
    openProjects();
  };
  return (
    <section className={sx(styles.card)} aria-label={`Project ${detail.project.name}`}>
      <IconTile size="xs" tone="accent">
        <FolderKanban size={iconTileGlyphSizes.xs} />
      </IconTile>
      <span className={sx(styles.text)}>
        <span className={sx(styles.eyebrow)}>{role === "coordinator" ? "Coordinates the project" : "Part of the project"}</span>
        <span className={sx(styles.name)} title={detail.project.name}>
          {detail.project.name}
        </span>
      </span>
      <Button variant="quiet" size="xs" iconOnly aria-label={`Open project ${detail.project.name}`} onClick={() => open("memory")}>
        <ArrowUpRight aria-hidden />
      </Button>
      <span className={sx(styles.footer)}>
        <span className={sx(needs > 0 ? styles.needs : styles.quiet)}>
          {needs > 0 ? `${needs} ${needs === 1 ? "needs" : "need"} you` : "Nothing waits for you"}
        </span>
        <Button variant="quiet" size="xs" onClick={() => open("library")}>
          <Library aria-hidden />
          Library · {detail.library.length}
        </Button>
      </span>
    </section>
  );
}

const styles = stylex.create({
  card: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    alignItems: "center",
    columnGap: vars["--ads-space-8"],
    rowGap: 2,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface"],
  },
  text: { display: "flex", flexDirection: "column", minWidth: 0 },
  eyebrow: { fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-subtle"] },
  name: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  needs: { fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-warning-text"] },
  quiet: { fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-subtle"] },
  footer: {
    gridColumn: "2 / 4",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
});
