import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ArrowLeft, Folder, Search, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button, Input } from "@/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { captureCurrentProjectState } from "@/store/project.utils";
import {
  matchesSettingsSection,
  settingsSectionGroups,
  settingsSections,
  type SectionId,
} from "./settings-dialog.schema";
import { resolveSettingsProjectSelection } from "./settings-dialog.utils";
import { SettingsDialogSectionContent } from "./settings-dialog-sections";
import { searchSettingsFields } from "./settings-dialog.registry";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (args: { open: boolean }) => void;
  initialSection?: SectionId;
  initialProjectPath?: string | null;
}

const sectionsById = Object.fromEntries(
  settingsSections.map((section) => [section.id, section]),
) as Record<SectionId, (typeof settingsSections)[number]>;

const IS_MAC =
  typeof window !== "undefined" && window.api?.platform === "darwin";
/** Keep this aligned with the native traffic-light placement in `electron/main/window.ts`. */
const MAC_TRAFFIC_LIGHT_CLEARANCE = 40;

export function SettingsDialog(args: SettingsDialogProps) {
  const { initialProjectPath, initialSection, open, onOpenChange } = args;
  const [activeSection, setActiveSection] = useState<SectionId>("general");
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingFieldId, setPendingFieldId] = useState<string | null>(null);
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
    useShallow(
      (state) =>
        [
          state.projectPath,
          state.projectName,
          state.recentProjects,
          state.defaultBranch,
          state.workspaces,
          state.activeWorkspaceId,
          state.workspaceBranchById,
          state.workspacePathById,
          state.workspaceDefaultById,
        ] as const,
    ),
  );
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
      setPendingFieldId(null);
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

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const appRoot = document.getElementById("root");
    if (!appRoot) {
      return;
    }

    const wasInert = appRoot.inert;
    const previousAriaHidden = appRoot.getAttribute("aria-hidden");
    appRoot.inert = true;
    appRoot.setAttribute("aria-hidden", "true");

    return () => {
      appRoot.inert = wasInert;
      if (previousAriaHidden === null) {
        appRoot.removeAttribute("aria-hidden");
      } else {
        appRoot.setAttribute("aria-hidden", previousAriaHidden);
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open || !pendingFieldId || typeof document === "undefined") {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const field = document.getElementById(pendingFieldId);
      if (!field) {
        return;
      }
      field.focus({ preventScroll: true });
      field.scrollIntoView({ block: "start", behavior: "auto" });
      setPendingFieldId(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSection, open, pendingFieldId]);

  if (!open) {
    return null;
  }

  const activeSectionData = sectionsById[activeSection];
  const normalizedSearchQuery = searchQuery.trim();
  const matchingFields = searchSettingsFields(normalizedSearchQuery);
  const visibleSectionIds = new Set(
    settingsSections
      .filter((section) =>
        matchesSettingsSection(section, normalizedSearchQuery),
      )
      .map((section) => section.id),
  );
  matchingFields.forEach((field) => visibleSectionIds.add(field.sectionId));
  const visibleGroups = settingsSectionGroups
    .map((group) => ({
      ...group,
      ids: group.ids.filter((sectionId) => visibleSectionIds.has(sectionId)),
    }))
    .filter((group) => group.ids.length > 0);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => onOpenChange({ open: nextOpen })}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            UI_LAYER_CLASS.dialog,
            "fixed inset-0 bg-background outline-none",
          )}
        />
        <DialogPrimitive.Popup
          aria-modal="true"
          className={cn(
            UI_LAYER_CLASS.dialog,
            "fixed inset-0 flex h-dvh w-full flex-col bg-background outline-none",
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Settings
          </DialogPrimitive.Title>
          <SidebarProvider
            className="h-full min-h-0 flex-1 items-start overflow-hidden"
            style={
              {
                "--sidebar-width": "248px",
                height: "100%",
                minHeight: 0,
              } as React.CSSProperties
            }
          >
            <Sidebar
              collapsible="none"
              className="hidden border-r border-sidebar-border/80 bg-sidebar sm:flex"
            >
              <SidebarContent
                className="pt-2"
                style={
                  IS_MAC
                    ? { paddingTop: MAC_TRAFFIC_LIGHT_CLEARANCE }
                    : undefined
                }
              >
                <div className="px-2 pb-2">
                  <DialogPrimitive.Close
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-1.5 text-sidebar-foreground/80"
                        aria-label="back-to-app"
                      />
                    }
                  >
                    <ArrowLeft className="size-4" />
                    Back to app
                  </DialogPrimitive.Close>
                </div>
                <div className="px-2 pb-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sidebar-foreground/45" />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search settings"
                      aria-label="Search settings"
                      className="h-9 border-transparent bg-sidebar-accent/35 pl-8 pr-8 text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/45 hover:border-sidebar-border focus-visible:border-sidebar-ring focus-visible:ring-sidebar-ring/25"
                    />
                    {searchQuery ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-sidebar-foreground/55 hover:text-sidebar-foreground"
                        aria-label="Clear settings search"
                        onClick={() => setSearchQuery("")}
                      >
                        <X className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </div>
                {matchingFields.length > 0 ? (
                  <SidebarGroup>
                    <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/55">
                      Search results
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {matchingFields.map((field) => (
                          <SidebarMenuItem key={field.fieldId}>
                            <SidebarMenuButton
                              size="sm"
                              onClick={() => {
                                setActiveSection(field.sectionId);
                                setPendingFieldId(field.fieldId);
                              }}
                              className="h-9 text-[13px] text-sidebar-foreground/78"
                            >
                              <Search />
                              <span className="min-w-0 flex-1 truncate">
                                {field.title}
                              </span>
                              <span className="text-[10px] text-sidebar-foreground/50">
                                {sectionsById[field.sectionId].label}
                              </span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                ) : null}
                {visibleGroups.length > 0 ? (
                  visibleGroups.map((group) => (
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
                                  const current =
                                    project.projectPath === projectPath;
                                  const active =
                                    activeSection === "projects" &&
                                    selectedProjectPath === project.projectPath;

                                  return (
                                    <SidebarMenuItem key={project.projectPath}>
                                      <SidebarMenuButton
                                        size="sm"
                                        isActive={active}
                                        title={project.projectPath}
                                        onClick={() => {
                                          allowHighlightedOverrideRef.current = false;
                                          setSelectedProjectPath(
                                            project.projectPath,
                                          );
                                          setActiveSection("projects");
                                        }}
                                        className={cn(
                                          "h-9 gap-2 text-[13px]",
                                          active
                                            ? "bg-sidebar-accent/70 text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--sidebar-primary)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
                                              "rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]",
                                              active
                                                ? "bg-sidebar-primary/10 text-sidebar-primary"
                                                : "bg-sidebar-accent/60 text-sidebar-foreground/60",
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
                                    "h-9 text-[13px]",
                                    active
                                      ? "bg-sidebar-accent/70 text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--sidebar-primary)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
                  ))
                ) : matchingFields.length === 0 ? (
                  <div className="px-4 py-6 text-xs leading-5 text-sidebar-foreground/60">
                    No settings match "{normalizedSearchQuery}".
                  </div>
                ) : null}
              </SidebarContent>
            </Sidebar>

            <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
              <header
                className={cn(
                  "flex min-h-20 shrink-0 items-center border-b border-border/65 px-4 py-3 sm:px-8 sm:py-4",
                  IS_MAC && "pt-10 sm:py-4",
                )}
              >
                <div className="hidden min-w-0 sm:block">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                      Settings
                    </span>
                    <span
                      className="text-muted-foreground/45"
                      aria-hidden="true"
                    >
                      /
                    </span>
                    <h1 className="font-heading truncate text-lg font-semibold tracking-[-0.015em] text-foreground">
                      {activeSectionData.label}
                    </h1>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {activeSectionData.description}
                  </p>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:hidden">
                  <div className="flex min-w-0 items-center gap-2">
                    <DialogPrimitive.Close
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-9 shrink-0"
                          aria-label="back-to-app"
                        />
                      }
                    >
                      <ArrowLeft className="size-4" />
                    </DialogPrimitive.Close>
                    <Select
                      value={activeSection}
                      onValueChange={(value) =>
                        setActiveSection(value as SectionId)
                      }
                    >
                      <SelectTrigger
                        aria-label="Settings section"
                        className="h-9 min-w-0 flex-1"
                      >
                        <SelectValue>{activeSectionData.label}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {settingsSections.map((section) => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search settings"
                      aria-label="Search settings"
                      className="h-9 pl-8 pr-8"
                    />
                    {searchQuery ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2"
                        aria-label="Clear settings search"
                        onClick={() => setSearchQuery("")}
                      >
                        <X className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-8 sm:py-7">
                <div className="w-full max-w-[70rem]">
                  <SettingsDialogSectionContent
                    sectionId={activeSection}
                    currentProjectPath={projectPath}
                    projects={projects}
                    selectedProjectPath={selectedProjectPath}
                    onNavigateSection={setActiveSection}
                  />
                </div>
              </div>
            </main>
          </SidebarProvider>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
