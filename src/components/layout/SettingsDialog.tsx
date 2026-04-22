import { useEffect, useMemo, useRef, useState } from "react";
import { Folder, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button, Card } from "@/components/ui";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useDismissibleLayer } from "@/lib/dismissible-layer";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { captureCurrentProjectState } from "@/store/project.utils";
import { settingsSectionGroups, settingsSections, type SectionId } from "./settings-dialog.schema";
import { resolveSettingsProjectSelection, shouldCloseSettingsDialogFromMouseDown } from "./settings-dialog.utils";
import { SettingsDialogSectionContent } from "./settings-dialog-sections";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (args: { open: boolean }) => void;
  initialSection?: SectionId;
  initialProjectPath?: string | null;
}

const sectionsById = Object.fromEntries(settingsSections.map((section) => [section.id, section])) as Record<SectionId, (typeof settingsSections)[number]>;

export function SettingsDialog(args: SettingsDialogProps) {
  const { initialProjectPath, initialSection, open, onOpenChange } = args;
  const [activeSection, setActiveSection] = useState<SectionId>("general");
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null);
  const allowHighlightedOverrideRef = useRef(true);
  const lastHighlightedProjectPathRef = useRef<string | null>(null);
  const [
    projectPath,
    projectName,
    recentProjects,
    defaultBranch,
    workspaces,
    activeWorkspaceId,
    workspaceBranchById,
    workspacePathById,
    workspaceDefaultById,
  ] = useAppStore(
    useShallow((state) => [
      state.projectPath,
      state.projectName,
      state.recentProjects,
      state.defaultBranch,
      state.workspaces,
      state.activeWorkspaceId,
      state.workspaceBranchById,
      state.workspacePathById,
      state.workspaceDefaultById,
    ] as const),
  );
  const { containerRef, handleKeyDown } = useDismissibleLayer<HTMLDivElement>({
    enabled: open,
    onDismiss: () => onOpenChange({ open: false }),
  });
  const projects = useMemo(
    () =>
      captureCurrentProjectState({
        recentProjects,
        projectPath,
        projectName,
        defaultBranch,
        workspaces,
        activeWorkspaceId,
        workspaceBranchById,
        workspacePathById,
        workspaceDefaultById,
      }),
    [
      activeWorkspaceId,
      defaultBranch,
      projectName,
      projectPath,
      recentProjects,
      workspaceBranchById,
      workspaceDefaultById,
      workspacePathById,
      workspaces,
    ],
  );

  useEffect(() => {
    if (!open) {
      allowHighlightedOverrideRef.current = true;
      lastHighlightedProjectPathRef.current = null;
      setSelectedProjectPath(null);
      return;
    }
    setActiveSection(initialSection ?? "general");
  }, [initialSection, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const highlightedProjectPath = initialProjectPath?.trim() || null;
    if (highlightedProjectPath !== lastHighlightedProjectPathRef.current) {
      lastHighlightedProjectPathRef.current = highlightedProjectPath;
      allowHighlightedOverrideRef.current = true;
    }

    const nextSelectedProjectPath = resolveSettingsProjectSelection({
      projects,
      selectedProjectPath,
      highlightedProjectPath,
      currentProjectPath: projectPath,
      allowHighlightedOverride: allowHighlightedOverrideRef.current,
    });
    if (nextSelectedProjectPath === selectedProjectPath) {
      return;
    }

    setSelectedProjectPath(nextSelectedProjectPath);
  }, [initialProjectPath, open, projectPath, projects, selectedProjectPath]);

  if (!open) {
    return null;
  }

  const activeSectionData = sectionsById[activeSection];

  return (
    <div
      ref={containerRef}
      className={cn(UI_LAYER_CLASS.dialog, "fixed inset-0 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]")}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => {
        if (!shouldCloseSettingsDialogFromMouseDown({
          target: event.target,
          currentTarget: event.currentTarget,
        })) {
          return;
        }
        onOpenChange({ open: false });
      }}
    >
      <Card
        className="animate-dropdown-in flex h-[92vh] w-full max-w-6xl flex-col gap-0 overflow-hidden rounded-2xl border-border/80 bg-background py-0 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <SidebarProvider
          className="h-full min-h-0 flex-1 items-start overflow-hidden"
          style={{ "--sidebar-width": "220px", height: "100%", minHeight: 0 } as React.CSSProperties}
        >
          <Sidebar collapsible="none" className="border-r border-border/80 bg-sidebar/60">
            <SidebarContent className="pt-2">
              {settingsSectionGroups.map((group) => (
                <SidebarGroup key={group.label}>
                  <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/55">
                    {group.label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.ids.map((sectionId) => {
                        if (sectionId === "projects") {
                          return projects.length === 0 ? (
                            <SidebarMenuItem key="projects-empty">
                              <SidebarMenuButton
                                size="sm"
                                isActive={activeSection === "projects"}
                                onClick={() => setActiveSection("projects")}
                                className="text-sidebar-foreground/65"
                              >
                                <Folder />
                                <span>No projects yet</span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ) : (
                            projects.map((project) => {
                              const current = project.projectPath === projectPath;
                              const active = activeSection === "projects" && selectedProjectPath === project.projectPath;

                              return (
                                <SidebarMenuItem key={project.projectPath}>
                                  <SidebarMenuButton
                                    size="sm"
                                    isActive={active}
                                    title={project.projectPath}
                                    onClick={() => {
                                      allowHighlightedOverrideRef.current = false;
                                      setSelectedProjectPath(project.projectPath);
                                      setActiveSection("projects");
                                    }}
                                    className={cn(
                                      "gap-2",
                                      active
                                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                                        : "text-sidebar-foreground/78",
                                    )}
                                  >
                                    <Folder />
                                    <span className="min-w-0 flex-1 truncate">
                                      {project.projectName}
                                    </span>
                                    {current ? (
                                      <span
                                        className={cn(
                                          "rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]",
                                          active
                                            ? "border-sidebar-primary-foreground/25 bg-sidebar-primary-foreground/12 text-sidebar-primary-foreground"
                                            : "border-sidebar-border/80 text-sidebar-foreground/60",
                                        )}
                                      >
                                        current
                                      </span>
                                    ) : null}
                                  </SidebarMenuButton>
                                </SidebarMenuItem>
                              );
                            })
                          );
                        }

                        const section = sectionsById[sectionId];
                        const Icon = section.icon;
                        const active = activeSection === section.id;

                        return (
                          <SidebarMenuItem key={section.id}>
                            <SidebarMenuButton
                              onClick={() => setActiveSection(section.id)}
                              className={cn(
                                active
                                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                                  : "text-sidebar-foreground/78",
                              )}
                            >
                              <Icon />
                              <span>{section.label}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarContent>
          </Sidebar>

          <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/80 bg-card/50 px-4">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <span className="text-sm text-muted-foreground">Settings</span>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="text-sm font-medium">
                      {activeSectionData.label}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <div className="ml-auto">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="close-settings"
                  onClick={() => onOpenChange({ open: false })}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
              <div className="mx-auto max-w-4xl">
                <SettingsDialogSectionContent
                  sectionId={activeSection}
                  currentProjectPath={projectPath}
                  projects={projects}
                  selectedProjectPath={selectedProjectPath}
                />
              </div>
            </div>
          </main>
        </SidebarProvider>
      </Card>
    </div>
  );
}
