import { FolderKanban } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { isOpenProjectState } from "@/lib/projects/domain";
import { useAppStore } from "@/store/app.store";
import { countProjectNeeds, useProjectsStore } from "@/store/projects-store";

/** Fleet's project roll-up: how many projects run and how many need you. */
export function FleetProjectRollup() {
  const projects = useProjectsStore((state) => state.projects);
  const details = useProjectsStore((state) => state.details);
  const openProjects = useAppStore((state) => state.openProjects);
  const open = projects.filter((project) => isOpenProjectState(project.state));
  if (open.length === 0) return null;
  const needs = open.reduce((sum, project) => sum + countProjectNeeds(details[project.id]), 0);
  return (
    <Button type="button" size="sm" variant={needs > 0 ? "secondary" : "quiet"} onClick={openProjects}>
      <FolderKanban aria-hidden />
      {open.length} {open.length === 1 ? "project" : "projects"}
      {needs > 0 ? ` · ${needs} need you` : ""}
    </Button>
  );
}
