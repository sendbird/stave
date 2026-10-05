import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ArrowLeft, Folder, Search, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ads/components/Button";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { cx, sx } from "@/components/ads/utils/stylex";
import { Input } from "@/components/ui";
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
import { useAppStore } from "@/store/app.store";
import { captureCurrentRepositoryState } from "@/store/repository.utils";
import {
  matchesSettingsSection,
  settingsSectionGroups,
  settingsSections,
  type SectionId,
} from "./settings-dialog.schema";
import { resolveSettingsRepositorySelection } from "./settings-dialog.utils";
import { SettingsDialogSectionContent } from "./settings-dialog-sections";
import { searchSettingsFields } from "./settings-dialog.registry";
import { settingsDialogStyles as styles } from "./SettingsDialog.styles";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (args: { open: boolean }) => void;
  initialSection?: SectionId;
  initialRepositoryPath?: string | null;
}

const sectionsById = Object.fromEntries(
  settingsSections.map((section) => [section.id, section]),
) as Record<SectionId, (typeof settingsSections)[number]>;

const IS_MAC =
  typeof window !== "undefined" && window.api?.platform === "darwin";
/** Keep this aligned with the native traffic-light placement in `electron/main/window.ts`. */
const MAC_TRAFFIC_LIGHT_CLEARANCE = 40;

export function SettingsDialog(args: SettingsDialogProps) {
  const { initialRepositoryPath, initialSection, open, onOpenChange } = args;
  const { t } = useTranslation(I18N_NAMESPACES);
  const [activeSection, setActiveSection] = useState<SectionId>("general");
  const [selectedRepositoryPath, setSelectedRepositoryPath] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingFieldId, setPendingFieldId] = useState<string | null>(null);
  const allowHighlightedOverrideRef = useRef(true);
  const lastHighlightedRepositoryPathRef = useRef<string | null>(null);
  const [
    repositoryPath,
    repositoryName,
    recentRepositories,
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
          state.repositoryPath,
          state.repositoryName,
          state.recentRepositories,
          state.defaultBranch,
          state.workspaces,
          state.activeWorkspaceId,
          state.workspaceBranchById,
          state.workspacePathById,
          state.workspaceDefaultById,
        ] as const,
    ),
  );
  const repositories = useMemo(
    () =>
      captureCurrentRepositoryState({
        recentRepositories,
        repositoryPath,
        repositoryName,
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
      repositoryName,
      repositoryPath,
      recentRepositories,
      workspaceBranchById,
      workspaceDefaultById,
      workspacePathById,
      workspaces,
    ],
  );

  useEffect(() => {
    if (!open) {
      allowHighlightedOverrideRef.current = true;
      lastHighlightedRepositoryPathRef.current = null;
      setSelectedRepositoryPath(null);
      setPendingFieldId(null);
      return;
    }
    setActiveSection(initialSection ?? "general");
  }, [initialSection, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const highlightedRepositoryPath = initialRepositoryPath?.trim() || null;
    if (highlightedRepositoryPath !== lastHighlightedRepositoryPathRef.current) {
      lastHighlightedRepositoryPathRef.current = highlightedRepositoryPath;
      allowHighlightedOverrideRef.current = true;
    }

    const nextSelectedRepositoryPath = resolveSettingsRepositorySelection({
      repositories,
      selectedRepositoryPath,
      highlightedRepositoryPath,
      currentRepositoryPath: repositoryPath,
      allowHighlightedOverride: allowHighlightedOverrideRef.current,
    });
    if (nextSelectedRepositoryPath === selectedRepositoryPath) {
      return;
    }

    setSelectedRepositoryPath(nextSelectedRepositoryPath);
  }, [initialRepositoryPath, open, repositoryPath, repositories, selectedRepositoryPath]);

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
          className={cx(UI_LAYER_CLASS.dialog, sx(styles.backdrop))}
        />
        <DialogPrimitive.Popup
          aria-modal="true"
          className={cx(UI_LAYER_CLASS.dialog, sx(styles.popup))}
        >
          <DialogPrimitive.Title render={<VisuallyHidden />}>
            {t("settings:dialog.title")}
          </DialogPrimitive.Title>
          <SidebarProvider
            className={sx(styles.provider)}
            style={
              {
                "--sidebar-width": "248px",
                height: "100%",
                minHeight: 0,
              } as React.CSSProperties
            }
          >
            <Sidebar collapsible="none" className={sx(styles.sidebar)}>
              <SidebarContent
                className={sx(styles.sidebarContent)}
                style={
                  IS_MAC
                    ? { paddingBlockStart: MAC_TRAFFIC_LIGHT_CLEARANCE }
                    : undefined
                }
              >
                <div className={sx(styles.sidebarSection)}>
                  <DialogPrimitive.Close
                    render={
                      <Button
                        variant="quiet"
                        size="sm"
                        xstyle={styles.backButton}
                        aria-label={t("settings:dialog.backToApp")}
                      />
                    }
                  >
                    <ArrowLeft className={sx(styles.icon)} />
                    {t("settings:dialog.backToApp")}
                  </DialogPrimitive.Close>
                </div>
                <div className={sx(styles.sidebarSection)}>
                  <div className={sx(styles.searchWrap)}>
                    <Search className={sx(styles.searchIcon)} />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder={t("settings:dialog.search.label")}
                      aria-label={t("settings:dialog.search.label")}
                      xstyle={styles.searchInput}
                    />
                    {searchQuery ? (
                      <Button
                        type="button"
                        variant="quiet"
                        size="xs"
                        iconOnly
                        xstyle={styles.searchClear}
                        aria-label={t("settings:dialog.search.clear")}
                        onClick={() => setSearchQuery("")}
                      >
                        <X className={sx(styles.icon)} />
                      </Button>
                    ) : null}
                  </div>
                </div>
                {matchingFields.length > 0 ? (
                  <SidebarGroup>
                    <SidebarGroupLabel className={sx(styles.groupLabel)}>
                      {t("settings:dialog.search.results")}
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
                              className={sx(styles.menuButton)}
                              icon={<Search />}
                              badge={
                                <span className={sx(styles.menuSectionLabel)}>
                                  {t(sectionsById[field.sectionId].labelKey)}
                                </span>
                              }
                            >
                              {t(field.titleKey)}
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                ) : null}
                {visibleGroups.length > 0 ? (
                  visibleGroups.map((group) => (
                    <SidebarGroup key={group.labelKey}>
                      <SidebarGroupLabel className={sx(styles.groupLabel)}>
                        {t(group.labelKey)}
                      </SidebarGroupLabel>
                      <SidebarGroupContent>
                        <SidebarMenu>
                          {group.ids.map((sectionId) => {
                            if (sectionId === "projects") {
                              return repositories.length === 0 ? (
                                <SidebarMenuItem key="projects-empty">
                                  <SidebarMenuButton
                                    size="sm"
                                    current={activeSection === "projects"}
                                    onClick={() => setActiveSection("projects")}
                                    icon={<Folder />}
                                  >
                                    {t("settings:dialog.noRepositories")}
                                  </SidebarMenuButton>
                                </SidebarMenuItem>
                              ) : (
                                repositories.map((repository) => {
                                  const current =
                                    repository.repositoryPath === repositoryPath;
                                  const active =
                                    activeSection === "projects" &&
                                    selectedRepositoryPath === repository.repositoryPath;

                                  return (
                                    <SidebarMenuItem key={repository.repositoryPath}>
                                      <SidebarMenuButton
                                        size="sm"
                                        current={active}
                                        title={repository.repositoryPath}
                                        onClick={() => {
                                          allowHighlightedOverrideRef.current = false;
                                          setSelectedRepositoryPath(
                                            repository.repositoryPath,
                                          );
                                          setActiveSection("projects");
                                        }}
                                        className={sx(styles.menuButtonGap)}
                                        icon={<Folder />}
                                        badge={
                                          current ? (
                                            <span
                                              className={sx(
                                                styles.currentPill,
                                                active &&
                                                  styles.currentPillActive,
                                              )}
                                            >
                                              {t("settings:dialog.currentRepository")}
                                            </span>
                                          ) : undefined
                                        }
                                      >
                                        {repository.repositoryName}
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
                                  current={active}
                                  onClick={() => setActiveSection(section.id)}
                                  className={sx(styles.menuButton)}
                                  icon={<Icon />}
                                >
                                  {t(section.labelKey)}
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            );
                          })}
                        </SidebarMenu>
                      </SidebarGroupContent>
                    </SidebarGroup>
                  ))
                ) : matchingFields.length === 0 ? (
                  <div className={sx(styles.emptyResults)}>
                    {t("settings:dialog.search.noMatches", {
                      query: normalizedSearchQuery,
                    })}
                  </div>
                ) : null}
              </SidebarContent>
            </Sidebar>

            <main className={sx(styles.main)}>
              <header
                className={sx(styles.header, IS_MAC && styles.headerMacPad)}
              >
                <div className={sx(styles.headerDesktop)}>
                  <div className={sx(styles.breadcrumbRow)}>
                    <span className={sx(styles.eyebrow)}>
                      {t("settings:dialog.title")}
                    </span>
                    <span
                      className={sx(styles.breadcrumbSep)}
                      aria-hidden="true"
                    >
                      /
                    </span>
                    <h1 className={sx(styles.headerTitle)}>
                      {t(activeSectionData.labelKey)}
                    </h1>
                  </div>
                  <p className={sx(styles.headerDescription)}>
                    {t(activeSectionData.descriptionKey)}
                  </p>
                </div>
                <div className={sx(styles.headerMobile)}>
                  <div className={sx(styles.headerMobileRow)}>
                    <DialogPrimitive.Close
                      render={
                        <Button
                          variant="quiet"
                          size="md"
                          iconOnly
                          xstyle={styles.mobileBack}
                          aria-label={t("settings:dialog.backToApp")}
                        />
                      }
                    >
                      <ArrowLeft className={sx(styles.icon)} />
                    </DialogPrimitive.Close>
                    <Select
                      value={activeSection}
                      onValueChange={(value) =>
                        setActiveSection(value as SectionId)
                      }
                    >
                      <SelectTrigger
                        aria-label={t("settings:dialog.sectionSelect")}
                        className={sx(styles.mobileSelectTrigger)}
                      >
                        <SelectValue>
                          {t(activeSectionData.labelKey)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {settingsSections.map((section) => (
                          <SelectItem key={section.id} value={section.id}>
                            {t(section.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className={sx(styles.searchWrap)}>
                    <Search className={sx(styles.mobileSearchIcon)} />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder={t("settings:dialog.search.label")}
                      aria-label={t("settings:dialog.search.label")}
                      xstyle={styles.mobileSearchInput}
                    />
                    {searchQuery ? (
                      <Button
                        type="button"
                        variant="quiet"
                        size="xs"
                        iconOnly
                        xstyle={styles.mobileSearchClear}
                        aria-label={t("settings:dialog.search.clear")}
                        onClick={() => setSearchQuery("")}
                      >
                        <X className={sx(styles.icon)} />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </header>

              <div className={sx(styles.body)}>
                <div className={sx(styles.bodyInner)}>
                  <SettingsDialogSectionContent
                    sectionId={activeSection}
                    currentRepositoryPath={repositoryPath}
                    repositories={repositories}
                    selectedRepositoryPath={selectedRepositoryPath}
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
