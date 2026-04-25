import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, FolderOpen, RefreshCcw } from "lucide-react";
import { Badge, Button, Card, CardContent } from "@/components/ui";
import {
  buildWorkspacePlanListEntries,
  LEGACY_WORKSPACE_PLANS_DIRECTORY,
  MAX_WORKSPACE_PLANS,
  WORKSPACE_PLANS_DIRECTORY,
  type WorkspacePlanListEntry,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

interface WorkspacePlansSectionProps {
  workspacePath: string;
  refreshNonce: number;
  embedded?: boolean;
  onOpenFile: (args: { filePath: string }) => Promise<void>;
}

async function listWorkspacePlanEntries(rootPath: string): Promise<WorkspacePlanListEntry[]> {
  const listDirectory = window.api?.fs?.listDirectory;
  if (!listDirectory) {
    return [];
  }

  const [currentResult, legacyResult] = await Promise.all([
    listDirectory({ rootPath, directoryPath: WORKSPACE_PLANS_DIRECTORY }),
    listDirectory({ rootPath, directoryPath: LEGACY_WORKSPACE_PLANS_DIRECTORY }),
  ]);

  return buildWorkspacePlanListEntries({
    currentFilePaths: currentResult?.ok
      ? currentResult.entries
        .filter((entry) => entry.type === "file" && entry.path.endsWith(".md"))
        .map((entry) => entry.path)
      : [],
    legacyFilePaths: legacyResult?.ok
      ? legacyResult.entries
        .filter((entry) => entry.type === "file" && entry.path.endsWith(".md"))
        .map((entry) => entry.path)
      : [],
  });
}

function WorkspacePlansSectionBody(args: WorkspacePlansSectionProps) {
  const {
    workspacePath,
    refreshNonce,
    embedded = false,
    onOpenFile,
  } = args;
  const [entries, setEntries] = useState<WorkspacePlanListEntry[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const loadPlans = useCallback(async () => {
    if (!workspacePath) {
      setEntries([]);
      return;
    }

    setListLoading(true);
    try {
      setEntries(await listWorkspacePlanEntries(workspacePath));
    } finally {
      setListLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans, refreshNonce]);

  return (
    <div className="space-y-3">
      {embedded ? (
        <div className="flex items-center justify-end gap-2">
          <Badge variant="outline" className="rounded-sm">
            {entries.length}/{MAX_WORKSPACE_PLANS}
          </Badge>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-sm"
              onClick={() => void loadPlans()}
            >
              <RefreshCcw className={cn("size-4", listLoading && "animate-spin")} />
              <span className="sr-only">Refresh plans</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Plans</p>
            <p className="text-xs leading-5 text-muted-foreground">
              Open the saved plan markdown directly in the editor.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-sm">
              {entries.length} saved
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-sm"
              onClick={() => void loadPlans()}
            >
              <RefreshCcw className={cn("mr-1 size-4", listLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      )}

      {!workspacePath ? (
        <div className="rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 py-2 text-xs leading-5 text-muted-foreground">
          Workspace path unavailable, so plans cannot be listed here.
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 py-3 text-xs leading-5 text-muted-foreground">
          No saved plans yet.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <button
              key={entry.filePath}
              type="button"
              onClick={() => void onOpenFile({ filePath: entry.filePath })}
              className="group flex w-full items-start gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 text-left transition-colors hover:bg-muted/35"
              title={entry.filePath}
            >
              <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">
                    {entry.label}
                  </p>
                  {entry.source === "legacy" ? (
                    <Badge variant="outline" className="rounded-sm px-1.5 py-0 text-[10px]">
                      legacy
                    </Badge>
                  ) : null}
                </div>
                <p className="truncate text-[11px] text-muted-foreground/80">
                  Task {entry.taskIdPrefix || "unknown"}
                </p>
              </div>
              <FolderOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkspacePlansSection(args: WorkspacePlansSectionProps) {
  if (args.embedded) {
    return <WorkspacePlansSectionBody {...args} />;
  }

  return (
    <Card size="sm" className="border border-border/70 bg-background/80">
      <CardContent className="pt-4">
        <WorkspacePlansSectionBody {...args} />
      </CardContent>
    </Card>
  );
}
