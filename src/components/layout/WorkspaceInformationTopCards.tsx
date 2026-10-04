import { sx } from "@/components/ads/utils/stylex";
import { WorkspaceInformationMartinCard } from "./WorkspaceInformationMartinCard";
import { workspaceInformationPanelStyles as styles } from "./workspace-information-panel.styles";

/** The cards above the Information sections: Martin, when linked. */
export function WorkspaceInformationTopCards(props: { showMartinCard: boolean }) {
  if (!props.showMartinCard) return null;
  return (
    <div className={sx(styles.topCards)}>
      <WorkspaceInformationMartinCard />
    </div>
  );
}
