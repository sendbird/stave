import * as stylex from "@stylexjs/stylex";
import { useMemo } from "react";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { listAgents } from "@/lib/agents/library";
import { buildPlaybookFlowPreview, describeFlowPreviewDoer } from "@/lib/playbooks/flow-preview";
import type { Playbook } from "@/lib/playbooks/schema";
import { useAppStore } from "@/store/app.store";
import { playbookStyles } from "./playbooks.styles";

/**
 * Flow: the stages of the playbook in the order a mission runs them, with who
 * does each, where it stops for you and what it does outside the workspace.
 * Read-only; edit the stages in the list.
 */
export function PlaybookFlowPreview(props: { playbook: Pick<Playbook, "stages" | "checkIns"> }) {
  const custom = useAppStore((state) => state.settings.customAgents);
  const names = useMemo(
    () => Object.fromEntries(listAgents({ custom }).map((agent) => [agent.id, agent.name])),
    [custom],
  );
  const flow = useMemo(() => buildPlaybookFlowPreview(props.playbook, names), [props.playbook, names]);
  return (
    <section aria-label="Flow" className={sx(styles.section)}>
      <div className={sx(playbookStyles.sectionHeader)}>
        <h3 className={sx(playbookStyles.sectionTitle)}>Flow</h3>
        <span className={sx(playbookStyles.sectionAside)}>
          {flow.nodes.length} stages · {flow.stops === 0 ? "no stops" : `${flow.stops} ${flow.stops === 1 ? "stop" : "stops"} for you`}
          {flow.agents ? ` · ${flow.agents} other ${flow.agents === 1 ? "agent" : "agents"}` : ""}
        </span>
      </div>
      <ol className={sx(styles.list)}>
        {flow.nodes.map((node, index) => (
          <li key={node.stageId} className={sx(styles.item)} aria-label={`Stage ${node.position}: ${node.title}`}>
            <div className={sx(styles.rail)} aria-hidden>
              <span className={sx(styles.dot, node.doer.kind === "agent" && styles.dotAgent, node.doer.kind === "stave" && styles.dotStave)} />
              {index < flow.nodes.length - 1 ? <span className={sx(styles.line)} /> : null}
            </div>
            <div className={sx(styles.body)}>
              {node.asksFirst ? <span className={sx(styles.stop)}>Asks you first</span> : null}
              <span className={sx(styles.title)}>
                {node.position}. {node.title}
              </span>
              <span className={sx(styles.meta, node.doer.kind === "agent" && !node.doer.name && styles.warning)}>
                {describeFlowPreviewDoer(node.doer)}
                {node.pinned ? " · pinned to the commit" : ""}
                {node.externalEffect ? " · outside the workspace" : ""}
              </span>
              <span className={sx(styles.meta)}>{node.detail}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const styles = stylex.create({
  section: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"] },
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" },
  item: { display: "flex", gap: vars["--ads-space-12"], minWidth: 0 },
  rail: { display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 auto", paddingTop: 6 },
  dot: { width: 10, height: 10, borderRadius: "50%", backgroundColor: vars["--ads-color-text-subtle"] },
  dotAgent: { backgroundColor: vars["--ads-color-info"] },
  dotStave: { backgroundColor: vars["--ads-color-border-strong"] },
  line: { flex: "1 1 auto", width: 1, minHeight: 16, backgroundColor: vars["--ads-color-border-subtle"], marginBlock: 2 },
  body: { display: "flex", flexDirection: "column", gap: 2, paddingBottom: vars["--ads-space-12"], minWidth: 0 },
  stop: { fontSize: vars["--ads-font-size-micro"], color: vars["--ads-color-warning-text"] },
  title: { fontSize: vars["--ads-font-size-body"], fontWeight: vars["--ads-font-weight-medium"] },
  meta: { fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"], overflowWrap: "anywhere" },
  warning: { color: vars["--ads-color-warning-text"] },
});
