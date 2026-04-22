import { FolderOpen, Plus } from "lucide-react";
import { memo, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { buildZenProjectList, type ZenProjectListItem } from "@/components/layout/zen-project-sidebar.utils";

const IS_MAC = typeof window !== "undefined" && window.api?.platform === "darwin";

export const ZenProjectSidebar = memo(function ZenProjectSidebar() {
  const [currentProjectPath, currentProjectName, recentProjects, createProject, openProject] = useAppStore(useShallow((state) => [
    state.projectPath,
    state.projectName,
    state.recentProjects,
    state.createProject,
    state.openProject,
  ] as const));

  const projects = useMemo<ZenProjectListItem[]>(
    () => buildZenProjectList({
      currentProjectName,
      currentProjectPath,
      recentProjects,
    }),
    [currentProjectName, currentProjectPath, recentProjects],
  );

  return (
    <aside
      className={cn(
        "flex h-full w-60 shrink-0 flex-col border-r border-border/60 bg-card/55 supports-backdrop-filter:backdrop-blur-md",
        IS_MAC ? "pt-11" : "pt-6",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Projects
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 rounded-md"
          onClick={() => void createProject({})}
          aria-label="Add project"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {projects.length > 0 ? (
          <TooltipProvider>
            <div className="space-y-1">
              {projects.map((project) => (
                <Tooltip key={project.projectPath}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        if (project.isCurrent) {
                          return;
                        }
                        void openProject({ projectPath: project.projectPath });
                      }}
                      className={cn(
                        "h-10 w-full justify-start gap-2 rounded-md px-3 font-mono text-[12px] font-medium shadow-none",
                        project.isCurrent
                          ? "border border-primary/30 bg-primary/12 text-foreground hover:bg-primary/14"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                      )}
                      aria-current={project.isCurrent ? "page" : undefined}
                    >
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          project.isCurrent ? "bg-primary" : "bg-border/80",
                        )}
                        aria-hidden="true"
                      />
                      <span className="truncate">{project.projectName}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{project.projectPath}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        ) : (
          <div className="flex h-full flex-col items-start justify-center gap-3 px-2">
            <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-muted-foreground">
              <FolderOpen className="size-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No projects</p>
              <p className="text-xs text-muted-foreground">Open a repository folder to start a focused session.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-md"
              onClick={() => void createProject({})}
            >
              <FolderOpen className="size-3.5" />
              Open Folder
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
});
