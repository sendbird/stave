import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type JSX,
} from "react";
import { Badge, Button, Input } from "@/components/ui";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBranchLabel } from "@/lib/source-control-branch-label";
import type { ResolvedWorkspaceScriptsConfig } from "@/lib/workspace-scripts/types";
import { ScriptsManager } from "@/components/scripts";
import { WorkspaceSyncStatusCard } from "./WorkspaceSyncStatusCard";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { sx } from "@/components/ads/utils/stylex";
import { workspaceSettingsDialogStyles as styles } from "./workspace-settings-dialog.styles";
import { useTranslation } from "@/i18n";

export interface WorkspaceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  workspaceName: string;
  isDefault?: boolean;
  branch?: string;
  repositoryPath: string;
  workspacePath: string;
  onRename?: (args: {
    workspaceId: string;
    name: string;
  }) => Promise<{ ok: boolean; message?: string }>;
}

// Exported for direct testing in static-render environments where Radix
// Dialog context and portals are unavailable (e.g. renderToStaticMarkup).
export function WorkspaceSettingsContent(props: {
  workspaceName: string;
  branch?: string;
  workspaceId: string;
  isDefault?: boolean;
  workspacePath: string;
  repositoryPath: string;
  resolvedConfig: ResolvedWorkspaceScriptsConfig | null;
  onSaved: () => void;
  onRename?: (args: {
    workspaceId: string;
    name: string;
  }) => Promise<{ ok: boolean; message?: string }>;
}): JSX.Element {
  const { t } = useTranslation("workspace");
  const [label, setLabel] = useState(props.workspaceName);
  const [labelMessage, setLabelMessage] = useState<string | null>(null);
  const [isSavingLabel, setIsSavingLabel] = useState(false);
  const canEditLabel = props.isDefault !== true && Boolean(props.onRename);
  const normalizedLabel = label.trim();
  const currentLabel = props.workspaceName.trim();
  const labelChanged =
    normalizedLabel.length > 0 && normalizedLabel !== currentLabel;

  useEffect(() => {
    setLabel(props.workspaceName);
    setLabelMessage(null);
  }, [props.workspaceName]);

  async function handleLabelSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditLabel || !props.onRename || isSavingLabel) {
      return;
    }
    if (!normalizedLabel) {
      setLabelMessage(t("settingsDialog.label.required"));
      return;
    }
    if (!labelChanged) {
      setLabelMessage(null);
      return;
    }

    setIsSavingLabel(true);
    setLabelMessage(null);
    try {
      const result = await props.onRename({
        workspaceId: props.workspaceId,
        name: normalizedLabel,
      });
      setLabelMessage(
        result.ok
          ? t("settingsDialog.label.saved")
          : (result.message ?? t("settingsDialog.label.saveFailed")),
      );
    } finally {
      setIsSavingLabel(false);
    }
  }

  return (
    <>
      <div data-slot="dialog-header" className={sx(styles.header)}>
        <h2 className={sx(styles.headerTitle)}>{t("settingsDialog.title")}</h2>
        <div className={sx(styles.headerMeta)}>
          <span className={sx(styles.headerName)}>{props.workspaceName}</span>
          {props.branch ? (
            <Badge variant="secondary">{formatBranchLabel(props.branch)}</Badge>
          ) : null}
        </div>
        <p className={sx(styles.headerPath)}>{props.workspacePath}</p>
      </div>
      <form className={sx(styles.labelForm)} onSubmit={handleLabelSubmit}>
        <div className={sx(styles.labelRow)}>
          <label className={sx(styles.labelField)}>
            {t("settingsDialog.label.field")}
            <Input
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                setLabelMessage(null);
              }}
              disabled={!canEditLabel || isSavingLabel}
              xstyle={styles.labelInput}
              placeholder={t("settingsDialog.label.placeholder")}
            />
          </label>
          <Button
            type="submit"
            size="sm"
            disabled={!canEditLabel || !labelChanged || isSavingLabel}
            xstyle={styles.labelSubmit}
          >
            {t("settingsDialog.label.save")}
          </Button>
        </div>
        <p className={sx(styles.labelHint)}>
          {props.isDefault
            ? t("settingsDialog.label.defaultFixed")
            : props.branch
              ? t("settingsDialog.label.shownAs", {
                  label: normalizedLabel || t("settingsDialog.label.fallbackName"),
                  branch: props.branch,
                })
              : t("settingsDialog.label.shownInSidebar")}
        </p>
        {labelMessage ? (
          <p className={sx(styles.labelHint)}>{labelMessage}</p>
        ) : null}
      </form>

      <Tabs
        defaultValue="sync"
        orientation="vertical"
        xstyle={styles.tabs}
      >
        <TabsList xstyle={styles.tabsList}>
          <TabsTrigger value="sync">{t("settingsDialog.tabs.sync")}</TabsTrigger>
          <TabsTrigger value="scripts">{t("settingsDialog.tabs.tools")}</TabsTrigger>
        </TabsList>
        <TabsContent value="sync" xstyle={styles.tabPanel}>
          <WorkspaceSyncStatusCard cwd={props.workspacePath} />
        </TabsContent>
        <TabsContent value="scripts" xstyle={styles.tabPanel}>
          <ScriptsManager
            repositoryPath={props.repositoryPath}
            workspacePath={props.workspacePath}
            resolvedConfig={props.resolvedConfig}
            onSaved={props.onSaved}
            hideTitle
            {...(props.workspaceId
              ? {
                  runtime: {
                    workspaceId: props.workspaceId,
                    workspaceName: props.workspaceName,
                    branch: props.branch ?? props.workspaceName,
                  },
                }
              : {})}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

export function WorkspaceSettingsDialog(
  props: WorkspaceSettingsDialogProps,
): JSX.Element {
  const { t } = useTranslation("workspace");
  const [resolvedConfig, setResolvedConfig] =
    useState<ResolvedWorkspaceScriptsConfig | null>(null);

  const loadConfig = useCallback(async () => {
    const getConfig = window.api?.scripts?.getConfig;
    if (!getConfig || !props.repositoryPath || !props.workspacePath) {
      setResolvedConfig(null);
      return;
    }
    const result = await getConfig({
      repositoryPath: props.repositoryPath,
      workspacePath: props.workspacePath,
    });
    setResolvedConfig(result.ok ? result.config : null);
  }, [props.repositoryPath, props.workspacePath]);

  useEffect(() => {
    if (props.open) {
      void loadConfig();
    }
  }, [props.open, loadConfig]);

  const sharedContent = (
    <WorkspaceSettingsContent
      workspaceName={props.workspaceName}
      workspaceId={props.workspaceId}
      isDefault={props.isDefault}
      branch={props.branch}
      workspacePath={props.workspacePath}
      repositoryPath={props.repositoryPath}
      resolvedConfig={resolvedConfig}
      onSaved={loadConfig}
      onRename={props.onRename}
    />
  );

  // Keep server/static render paths testable: when there is no DOM (e.g.
  // renderToStaticMarkup in tests), Radix Dialog portals and context are
  // unavailable. Fall back to rendering the content directly, mirroring the
  // ImageLightbox pattern so tests can assert on structure without a browser DOM.
  if (props.open && (typeof document === "undefined" || !document.body)) {
    return (
      <div data-slot="dialog-content" className={sx(styles.staticSurface)}>
        {sharedContent}
      </div>
    );
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent xstyle={styles.surface}>
        {/*
          The accessible name only: `DialogHeader` is a flex wrapper, and an
          empty one is still a grid child of the surface, so it contributed a
          0px row plus the surface's full `space24` gap above the visible
          header. `VisuallyHidden` is absolutely positioned, so it takes no
          row at all.
        */}
        <VisuallyHidden>
          <DialogTitle>{t("settingsDialog.title")}</DialogTitle>
        </VisuallyHidden>
        {sharedContent}
      </DialogContent>
    </Dialog>
  );
}
