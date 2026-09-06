import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type JSX,
} from "react";
import { Badge, Button, Input } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBranchLabel } from "@/lib/source-control-branch-label";
import type { ResolvedWorkspaceScriptsConfig } from "@/lib/workspace-scripts/types";
import { WORKSPACE_TOOLS_LABEL } from "@/lib/workspace-scripts/constants";
import { ScriptsManager } from "@/components/scripts";
import { WorkspaceSyncStatusCard } from "./WorkspaceSyncStatusCard";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { sx } from "@/components/ads/utils/stylex";
import { workspaceSettingsDialogStyles as styles } from "./workspace-settings-dialog.styles";

export interface WorkspaceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  workspaceName: string;
  isDefault?: boolean;
  branch?: string;
  projectPath: string;
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
  projectPath: string;
  resolvedConfig: ResolvedWorkspaceScriptsConfig | null;
  onSaved: () => void;
  onRename?: (args: {
    workspaceId: string;
    name: string;
  }) => Promise<{ ok: boolean; message?: string }>;
}): JSX.Element {
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
      setLabelMessage("Label is required.");
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
        result.ok ? "Saved." : (result.message ?? "Save failed."),
      );
    } finally {
      setIsSavingLabel(false);
    }
  }

  return (
    <>
      <div data-slot="dialog-header" className={sx(styles.header)}>
        <h2 className={sx(styles.headerTitle)}>Workspace settings</h2>
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
            Label
            <Input
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                setLabelMessage(null);
              }}
              disabled={!canEditLabel || isSavingLabel}
              xstyle={styles.labelInput}
              placeholder="Workspace label"
            />
          </label>
          <Button
            type="submit"
            size="sm"
            disabled={!canEditLabel || !labelChanged || isSavingLabel}
            xstyle={styles.labelSubmit}
          >
            Save label
          </Button>
        </div>
        <p className={sx(styles.labelHint)}>
          {props.isDefault
            ? "Default workspace labels are fixed."
            : props.branch
              ? `Shown as ${normalizedLabel || "label"} (${props.branch}).`
              : "Shown in the project sidebar."}
        </p>
        {labelMessage ? (
          <p className={sx(styles.labelHint)}>{labelMessage}</p>
        ) : null}
      </form>

      <Tabs
        defaultValue="sync"
        orientation="vertical"
        className={sx(styles.tabs)}
      >
        <TabsList className={sx(styles.tabsList)}>
          <TabsTrigger value="sync">Sync</TabsTrigger>
          <TabsTrigger value="scripts">{WORKSPACE_TOOLS_LABEL}</TabsTrigger>
        </TabsList>
        <TabsContent value="sync" className={sx(styles.tabPanel)}>
          <WorkspaceSyncStatusCard cwd={props.workspacePath} />
        </TabsContent>
        <TabsContent value="scripts" className={sx(styles.tabPanel)}>
          <ScriptsManager
            projectPath={props.projectPath}
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
  const [resolvedConfig, setResolvedConfig] =
    useState<ResolvedWorkspaceScriptsConfig | null>(null);

  const loadConfig = useCallback(async () => {
    const getConfig = window.api?.scripts?.getConfig;
    if (!getConfig || !props.projectPath || !props.workspacePath) {
      setResolvedConfig(null);
      return;
    }
    const result = await getConfig({
      projectPath: props.projectPath,
      workspacePath: props.workspacePath,
    });
    setResolvedConfig(result.ok ? result.config : null);
  }, [props.projectPath, props.workspacePath]);

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
      projectPath={props.projectPath}
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
        <DialogHeader>
          <VisuallyHidden>
            <DialogTitle>Workspace settings</DialogTitle>
          </VisuallyHidden>
        </DialogHeader>
        {sharedContent}
      </DialogContent>
    </Dialog>
  );
}
