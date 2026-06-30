import { useCallback, useEffect, useState, type JSX } from "react";
import { Badge } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { ResolvedWorkspaceScriptsConfig } from "@/lib/workspace-scripts/types";
import { WorkspaceScriptsManager } from "./WorkspaceScriptsManager";
import { WorkspaceSyncStatusCard } from "./WorkspaceSyncStatusCard";

export interface WorkspaceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  workspaceName: string;
  branch?: string;
  projectPath: string;
  workspacePath: string;
}

// Exported for direct testing in static-render environments where Radix
// Dialog context and portals are unavailable (e.g. renderToStaticMarkup).
export function WorkspaceSettingsContent(props: {
  workspaceName: string;
  branch?: string;
  workspacePath: string;
  projectPath: string;
  resolvedConfig: ResolvedWorkspaceScriptsConfig | null;
  onSaved: () => void;
}): JSX.Element {
  return (
    <>
      <div data-slot="dialog-header" className="flex flex-col gap-2">
        <h2 className="font-heading leading-none font-medium">
          Workspace settings
        </h2>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-sm font-semibold text-foreground">
            {props.workspaceName}
          </span>
          {props.branch ? (
            <Badge variant="secondary">{props.branch}</Badge>
          ) : null}
        </div>
        <p className="break-all pt-1 text-xs text-muted-foreground">
          {props.workspacePath}
        </p>
      </div>

      <Tabs
        defaultValue="sync"
        orientation="vertical"
        className="w-full gap-4 pt-2"
      >
        <TabsList className="min-w-36 shrink-0">
          <TabsTrigger value="sync">Sync</TabsTrigger>
          <TabsTrigger value="scripts">Scripts</TabsTrigger>
        </TabsList>
        <TabsContent
          value="sync"
          className="max-h-[60vh] overflow-y-auto pt-2"
        >
          <WorkspaceSyncStatusCard cwd={props.workspacePath} />
        </TabsContent>
        <TabsContent
          value="scripts"
          className="max-h-[60vh] overflow-y-auto pt-2"
        >
          <WorkspaceScriptsManager
            projectPath={props.projectPath}
            workspacePath={props.workspacePath}
            resolvedConfig={props.resolvedConfig}
            onSaved={props.onSaved}
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
      branch={props.branch}
      workspacePath={props.workspacePath}
      projectPath={props.projectPath}
      resolvedConfig={resolvedConfig}
      onSaved={loadConfig}
    />
  );

  // Keep server/static render paths testable: when there is no DOM (e.g.
  // renderToStaticMarkup in tests), Radix Dialog portals and context are
  // unavailable. Fall back to rendering the content directly, mirroring the
  // ImageLightbox pattern so tests can assert on structure without a browser DOM.
  if (props.open && (typeof document === "undefined" || !document.body)) {
    return (
      <div data-slot="dialog-content" className="max-w-4xl">
        {sharedContent}
      </div>
    );
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="sr-only">Workspace settings</DialogTitle>
        </DialogHeader>
        {sharedContent}
      </DialogContent>
    </Dialog>
  );
}
