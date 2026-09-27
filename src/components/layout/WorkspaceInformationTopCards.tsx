import { sx } from "@/components/ads/utils/stylex";
import { findWorkspaceProject, ProjectInformationCard } from "@/components/projects/ProjectInformationCard";
import { useProjectsStore } from "@/store/projects-store";
import { WorkspaceInformationMartinCard } from "./WorkspaceInformationMartinCard";
import { workspaceInformationPanelStyles as styles } from "./workspace-information-panel.styles";

/** The cards above the Information sections: the project this workspace works for, and Martin. */
export function WorkspaceInformationTopCards(props: { workspaceId: string; showMartinCard: boolean }) {
  const inProject = useProjectsStore((state) => Boolean(findWorkspaceProject(state.details, props.workspaceId)));
  if (!inProject && !props.showMartinCard) return null;
  return (
    <div className={sx(styles.topCards)}>
      {inProject ? <ProjectInformationCard workspaceId={props.workspaceId} /> : null}
      {props.showMartinCard ? <WorkspaceInformationMartinCard /> : null}
    </div>
  );
}
