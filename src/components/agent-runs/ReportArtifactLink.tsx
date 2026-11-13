import { resolveRepositoryForWorkspaceId } from "@/store/repository.utils";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Dialog } from "@/components/aui/components/Dialog";
import { Button } from "@/components/aui/components/Button";
import { sx, type StyleXValue } from "@/components/aui/utils/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { EditorHtmlPreview } from "@/components/layout/editor-html-preview";
import { ExternalAnchor } from "@/components/ui/external-anchor";
import { isLocalPreviewUrl, savedHtmlReference } from "@/lib/agent-runs/artifacts";
import type { AgentRunReportLink } from "@/lib/agent-runs/report";
import { useAppStore } from "@/store/app.store";
import { agentRunStyles } from "./agent-runs.styles";

const ArtifactPreviewContext = createContext<((link: AgentRunReportLink) => void) | null>(null);

/** Tars owns the modal outside responsive tray rows, so switching placement keeps the saved page open. */
export function ReportArtifactPreviewProvider({ children }: { children: ReactNode }) {
  const [link, setLink] = useState<AgentRunReportLink | null>(null);
  return <ArtifactPreviewContext.Provider value={setLink}>
    {children}
    {link ? <SavedArtifactPreview key={link.url} link={link} onClose={() => setLink(null)} /> : null}
  </ArtifactPreviewContext.Provider>;
}

export function ReportArtifactLink({ link, children, xstyle }: { link: AgentRunReportLink; children?: ReactNode; xstyle?: StyleXValue }) {
  const { t } = useTranslation(["agentRuns"]);
  const openShared = useContext(ArtifactPreviewContext);
  const [openLocal, setOpenLocal] = useState(false);
  if (!savedHtmlReference(link.url)) return <ExternalAnchor href={link.url} xstyle={xstyle ?? agentRunStyles.link}>
    {children ?? <>{link.label}{isLocalPreviewUrl(link.url) ? ` · ${t("artifacts.liveLink")}` : ""}<ArrowUpRight aria-hidden className={sx(agentRunStyles.iconSm)} /></>}
  </ExternalAnchor>;
  return <>
    <Button variant="quiet" size="sm" layout="host" xstyle={xstyle ?? agentRunStyles.link} onClick={() => openShared ? openShared(link) : setOpenLocal(true)} data-saved-html-open={savedHtmlReference(link.url)}>
      {children ?? <>{link.label} · {t("artifacts.saved")}</>}
    </Button>
    {openLocal ? <SavedArtifactPreview link={link} onClose={() => setOpenLocal(false)} /> : null}
  </>;
}

/** A saved page is view-only and network-blocked. Starting a real app is a separate user action. */
function SavedArtifactPreview({ link, onClose }: { link: AgentRunReportLink; onClose: () => void }) {
  const { t } = useTranslation(["agentRuns"]);
  const renderId = savedHtmlReference(link.url);
  const [page, setPage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [launch, setLaunch] = useState<"idle" | "starting" | "ready" | "failed">("idle");
  useEffect(() => {
    if (!renderId) return;
    let disposed = false;
    setPage(null); setFailed(false);
    void window.api?.inlineRender?.readSource({ renderId }).then((result) => {
      if (disposed) return;
      if (result.ok) setPage(result.html); else setFailed(true);
    }).catch(() => { if (!disposed) setFailed(true); });
    if (!window.api?.inlineRender) setFailed(true);
    return () => { disposed = true; };
  }, [renderId]);
  const startApp = async () => {
    setLaunch("starting");
    try {
      const state = useAppStore.getState();
      if (!link.workspaceId) throw new Error("unavailable");
      const repository = resolveRepositoryForWorkspaceId({ state, workspaceId: link.workspaceId });
      const remembered = state.recentRepositories.find((entry) => entry.repositoryPath === repository?.repositoryPath);
      const current = state.workspaces.find((entry) => entry.id === link.workspaceId);
      const workspace = current ?? remembered?.workspaces.find((entry) => entry.id === link.workspaceId);
      const workspacePath = current ? state.workspacePathById[link.workspaceId] : remembered?.workspacePathById[link.workspaceId];
      const branch = current ? state.workspaceBranchById[link.workspaceId] : remembered?.workspaceBranchById[link.workspaceId];
      const api = window.api?.scripts;
      if (!repository || !workspace || !workspacePath || !link.livePreview || !api?.getConfig || !api.runEntry) throw new Error("unavailable");
      const context = { workspaceId: workspace.id, repositoryPath: repository.repositoryPath, workspacePath, workspaceName: workspace.name, branch: branch || workspace.name };
      const config = await api.getConfig({ repositoryPath: context.repositoryPath, workspacePath: context.workspacePath });
      if (!config.ok || !config.config?.services.some((entry) => entry.id === link.livePreview!.scriptId)) throw new Error("missing process");
      const result = await api.runEntry({ ...context, scriptId: link.livePreview.scriptId, scriptKind: "service" });
      if (!result.ok) throw new Error("start failed");
      setLaunch("ready");
    } catch { setLaunch("failed"); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title={link.label} width="xl" description={t("artifacts.description")}>
      <div className={sx(styles.stack)}>
        <p className={sx(styles.meta)} data-artifact-presentation={link.presentation ?? "unspecified"}>{t(`artifacts.presentation.${link.presentation === "component-render" ? "componentRender" : link.presentation ?? "unspecified"}`)}</p>
        {link.livePreview ? <div className={sx(styles.stack)}>
          <p className={sx(styles.meta)}>{t("artifacts.liveRequirements")}</p>
          <div className={sx(styles.actions)}><Button size="sm" variant="secondary" disabled={launch === "starting"} onClick={() => void startApp()}>{t(launch === "starting" ? "artifacts.starting" : "artifacts.startApp")}</Button>
            {launch === "ready" ? <ExternalAnchor href={link.livePreview.url}>{t("artifacts.openApp")}</ExternalAnchor> : null}</div>
          {launch === "failed" ? <p role="alert" className={sx(styles.meta)}>{t("artifacts.launchFailed")}</p> : null}
        </div> : null}
        <div className={sx(styles.preview)}>
          {page !== null ? <EditorHtmlPreview content={page} frameTitle={link.label} networkPolicy="blocked" />
            : <p role="status">{t(failed ? "artifacts.missing" : "artifacts.loading")}</p>}
        </div>
      </div>
    </Dialog>;
}

const styles = stylex.create({
  stack: { display: "flex", flexDirection: "column", minWidth: 0, gap: vars["--aui-space-12"] },
  actions: { display: "flex", flexWrap: "wrap", gap: vars["--aui-space-8"], alignItems: "center" },
  meta: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], overflowWrap: "anywhere" },
  preview: { height: "60vh", minHeight: "12rem", minWidth: 0 },
});
