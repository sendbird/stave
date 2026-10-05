import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Expand,
  FolderOpen,
  Globe2,
  MessageSquarePlus,
  MoreHorizontal,
  RefreshCcw,
  Search,
  Settings2,
  UserRound,
  X,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { EditorMarkdownPreview } from "@/components/layout/editor-markdown-preview";
import { copyTextToClipboard } from "@/lib/clipboard";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { sx, type StyleXValue } from "@/components/ads/utils/stylex";
import { hostSurface } from "@/components/ui/host-surface.styles";
import { skillStyles } from "./workspace-skills.styles";
import type { SectionId } from "@/components/layout/settings-dialog.schema";
import type {
  SkillCatalogEntry,
  SkillCatalogScope,
  SkillCatalogProvider,
} from "@/lib/skills/types";
import { useAppStore } from "@/store/app.store";

/* ---------- Provider label helpers ---------- */

type SkillSourceType = "provider" | "user" | "shared";

function resolveSourceType(entry: SkillCatalogEntry): SkillSourceType {
  if (entry.provider === "shared") return "shared";
  if (entry.scope === "user") return "user";
  return "provider";
}

function sourceTypeLabel(type: SkillSourceType): string {
  switch (type) {
    case "provider":
      return i18n.t("workspace:workspaceSkillsPanel.provider");
    case "user":
      return i18n.t("workspace:workspaceSkillsPanel.user");
    case "shared":
      return i18n.t("workspace:workspaceSkillsPanel.shared");
  }
}

function providerLabel(provider: SkillCatalogProvider): string {
  if (provider === "shared") return i18n.t("workspace:workspaceSkillsPanel.shared");
  if (provider === "claude-code") return "Claude";
  if (provider === "codex") return "Codex";
  return provider;
}

function sourceTypeBadgeVariant(
  type: SkillSourceType,
): "default" | "secondary" | "outline" {
  switch (type) {
    case "provider":
      return "default";
    case "user":
      return "secondary";
    case "shared":
      return "outline";
  }
}

/* ---------- Scope icon ---------- */

function ScopeIcon(props: { scope: SkillCatalogScope; className?: string }) {
  switch (props.scope) {
    case "local":
      return <FolderOpen className={props.className} />;
    case "user":
      return <UserRound className={props.className} />;
    default:
      return <Globe2 className={props.className} />;
  }
}

function scopeLabel(scope: SkillCatalogScope): string {
  switch (scope) {
    case "local":
      return i18n.t("workspace:workspaceSkillsPanel.workspace");
    case "user":
      return i18n.t("workspace:workspaceSkillsPanel.user");
    case "global":
      return i18n.t("workspace:workspaceSkillsPanel.global");
  }
}

/* ---------- Insert skill token into prompt ---------- */

function useInsertSkillToPrompt() {
  const updatePromptDraft = useAppStore((state) => state.updatePromptDraft);
  const activeTaskId = useAppStore((state) => state.activeTaskId);

  return useCallback(
    (token: string) => {
      const taskId = activeTaskId || "draft:session";
      const current =
        useAppStore.getState().promptDraftByTask[taskId]?.text ?? "";
      const separator = current.length > 0 && !current.endsWith(" ") ? " " : "";
      updatePromptDraft({
        taskId,
        patch: { text: `${current}${separator}${token} ` },
      });
      toast.success(i18n.t("workspace:workspaceSkillsPanel.insertedIntoPrompt"));
    },
    [updatePromptDraft, activeTaskId],
  );
}

/* ---------- Instructions dialog ---------- */

export function SkillInstructionsContent(props: {
  instructions: string;
  presentation?: "rendered" | "source";
  xstyle?: StyleXValue;
}) {
  if (props.presentation === "source") {
    return (
      <pre
        data-skill-instructions-source=""
        className={sx(skillStyles.instructionsSource, props.xstyle)}
      >
        <code>{props.instructions}</code>
      </pre>
    );
  }

  return (
    <div
      data-skill-instructions-rendered=""
      className={sx(skillStyles.instructionsRendered, props.xstyle)}
    >
      <EditorMarkdownPreview
        content={props.instructions}
        fontSize={14}
        variant="embedded"
        className={sx(skillStyles.instructionsPreview)}
      />
    </div>
  );
}

function SkillInstructionsDialog(props: {
  skill: SkillCatalogEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const { skill } = props;
  if (!skill) return null;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent xstyle={skillStyles.dialog}>
        <DialogHeader className={sx(skillStyles.dialogHeader)}>
          <DialogTitle>{skill.name}</DialogTitle>
          <DialogDescription>
            {skill.description || tI18n("workspace:workspaceSkillsPanel.noDescription")}
          </DialogDescription>
        </DialogHeader>
        {skill.instructions ? (
          <Tabs
            variant="line"
            defaultValue="rendered"
            xstyle={skillStyles.dialogTabs}
          >
            <div className={sx(skillStyles.dialogTabBar)}>
              <TabsList
                aria-label={tI18n("workspace:workspaceSkillsPanel.instructionView")}
                xstyle={skillStyles.dialogTabList}
              >
                <TabsTrigger
                  value="rendered"
                  xstyle={skillStyles.dialogTab}
                >
                  {tI18n("workspace:workspaceSkillsPanel.rendered")}</TabsTrigger>
                <TabsTrigger
                  value="source"
                  xstyle={skillStyles.dialogTab}
                >
                  {tI18n("workspace:workspaceSkillsPanel.source")}</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent
              value="rendered"
              xstyle={skillStyles.dialogPanel}
            >
              <SkillInstructionsContent
                instructions={skill.instructions}
                xstyle={skillStyles.instructionsFill}
              />
            </TabsContent>
            <TabsContent value="source" xstyle={skillStyles.dialogPanel}>
              <SkillInstructionsContent
                instructions={skill.instructions}
                presentation="source"
                xstyle={skillStyles.instructionsFill}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <p className={sx(skillStyles.dialogEmpty)}>
            {tI18n("workspace:workspaceSkillsPanel.noInstructionsAvailable")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Section header ---------- */

function SectionHeader(props: { title: string; count: number }) {
  return (
    <div className={sx(skillStyles.sectionHeader)}>
      <h3 className={sx(skillStyles.sectionTitle)}>{props.title}</h3>
      <span className={sx(skillStyles.sectionCount)}>{props.count}</span>
    </div>
  );
}

/* ---------- Skill row (list view) ---------- */

function SkillRow(props: {
  skill: SkillCatalogEntry;
  onClick: () => void;
  onUse: () => void;
  onViewInstructions: () => void;
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const sourceType = resolveSourceType(props.skill);

  return (
    <div className={sx(skillStyles.row)}>
      <AdsButton
        layout="host"
        type="button"
        xstyle={[skillStyles.rowOpen, hostSurface.inertChrome]}
        onClick={props.onClick}
      >
        <div className={sx(skillStyles.rowScope)}>
          <ScopeIcon
            scope={props.skill.scope}
            className={sx(skillStyles.rowScopeIcon)}
          />
        </div>
        <div className={sx(skillStyles.rowBody)}>
          <div className={sx(skillStyles.rowTitleLine)}>
            <span className={sx(skillStyles.rowTitle)}>
              {props.skill.name}
            </span>
            <Badge
              variant={sourceTypeBadgeVariant(sourceType)}
              className={sx(skillStyles.rowBadge)}
            >
              {sourceTypeLabel(sourceType)}
            </Badge>
            {props.skill.provider !== "shared" ? (
              <Badge variant="outline" className={sx(skillStyles.rowBadge)}>
                {providerLabel(props.skill.provider)}
              </Badge>
            ) : null}
          </div>
          {props.skill.description ? (
            <p className={sx(skillStyles.rowDescription)}>
              {props.skill.description}
            </p>
          ) : null}
        </div>
      </AdsButton>
      <div className={sx(skillStyles.rowActions)}>
        {props.skill.instructions ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    xstyle={skillStyles.iconButtonSm}
                    aria-label={tI18n("workspace:workspaceSkillsPanel.viewInstructions")}
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onViewInstructions();
                    }}
                  />
                }
              >
                <Expand className={sx(skillStyles.glyphXs)} />
              </TooltipTrigger>
              <TooltipContent>{tI18n("workspace:workspaceSkillsPanel.viewInstructions")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  xstyle={skillStyles.iconButtonSm}
                  aria-label={tI18n("workspace:workspaceSkillsPanel.insertIntoPrompt")}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onUse();
                  }}
                />
              }
            >
              <MessageSquarePlus className={sx(skillStyles.glyphXs)} />
            </TooltipTrigger>
            <TooltipContent>{tI18n("workspace:workspaceSkillsPanel.insertIntoPrompt")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <ChevronRight className={sx(skillStyles.rowChevron)} />
    </div>
  );
}

/* ---------- Skill detail view ---------- */

export function SkillMetadataDetails(props: { skill: SkillCatalogEntry }) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const { skill } = props;
  // StyleX has no parent selector, so the chevron reads React state rather
  // than the `<details open>` attribute it used to inherit through `group-open`.
  const [open, setOpen] = useState(false);

  return (
    <details
      data-skill-metadata-details=""
      className={sx(skillStyles.details)}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className={sx(skillStyles.summary, focusRing.ring)}>
        <ChevronRight
          className={sx(
            skillStyles.summaryChevron,
            open && skillStyles.summaryChevronOpen,
          )}
        />
        {tI18n("workspace:workspaceSkillsPanel.details")}</summary>
      <dl className={sx(skillStyles.detailsList)}>
        <div className={sx(skillStyles.detailsRow)}>
          <dt className={sx(skillStyles.detailsTerm)}>{tI18n("workspace:workspaceSkillsPanel.slug")}</dt>
          <dd className={sx(skillStyles.detailsValue)} title={skill.slug}>
            {skill.slug}
          </dd>
        </div>
        <div className={sx(skillStyles.detailsRow)}>
          <dt className={sx(skillStyles.detailsTerm)}>{tI18n("workspace:workspaceSkillsPanel.path")}</dt>
          <dd className={sx(skillStyles.detailsValue)} title={skill.path}>
            {skill.path}
          </dd>
        </div>
        <div className={sx(skillStyles.detailsRow)}>
          <dt className={sx(skillStyles.detailsTerm)}>{tI18n("workspace:workspaceSkillsPanel.root")}</dt>
          <dd
            className={sx(skillStyles.detailsValue)}
            title={skill.sourceRootPath}
          >
            {skill.sourceRootPath}
          </dd>
        </div>
      </dl>
    </details>
  );
}

export function SkillDetail(props: {
  skill: SkillCatalogEntry;
  onBack: () => void;
  onUse: () => void;
  onViewInstructions: () => void;
  onOpenSettings?: () => void;
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const { skill } = props;
  const sourceType = resolveSourceType(skill);

  const handleCopyPath = useCallback(() => {
    void copyTextToClipboard(skill.path);
    toast.success(tI18n("workspace:workspaceSkillsPanel.pathCopied"));
  }, [skill.path]);

  const handleCopyInvocationToken = useCallback(() => {
    void copyTextToClipboard(skill.invocationToken);
    toast.success(tI18n("workspace:workspaceSkillsPanel.invocationTokenCopied"));
  }, [skill.invocationToken]);

  const handleOpenInFinder = useCallback(() => {
    void window.api?.shell?.showInFinder?.({ path: skill.path });
  }, [skill.path]);

  return (
    <div className={sx(skillStyles.detail)}>
      {/* Detail header */}
      <div className={sx(skillStyles.detailHeader)}>
        <Button
          size="icon"
          variant="ghost"
          xstyle={skillStyles.iconButtonMd}
          aria-label={tI18n("workspace:workspaceSkillsPanel.backToSkills")}
          onClick={props.onBack}
        >
          <ArrowLeft className={sx(skillStyles.glyphSm)} />
        </Button>
        <span className={sx(skillStyles.detailTitle)}>{skill.name}</span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                xstyle={skillStyles.iconButtonMd}
                aria-label={tI18n("workspace:workspaceSkillsPanel.moreSkillActions")}
              />
            }
          >
            <MoreHorizontal className={sx(skillStyles.glyphSm)} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" xstyle={skillStyles.detailMenu}>
            <DropdownMenuItem onSelect={handleCopyInvocationToken}>
              <Copy className={sx(skillStyles.glyphMd)} />
              {tI18n("workspace:workspaceSkillsPanel.copyInvocationToken")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={handleCopyPath}>
              <Copy className={sx(skillStyles.glyphMd)} />
              {tI18n("workspace:workspaceSkillsPanel.copyPath")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleOpenInFinder}>
              <ExternalLink className={sx(skillStyles.glyphMd)} />
              {tI18n("workspace:workspaceSkillsPanel.revealInFinder")}</DropdownMenuItem>
            {props.onOpenSettings ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={props.onOpenSettings}>
                  <Settings2 className={sx(skillStyles.glyphMd)} />
                  {tI18n("workspace:workspaceSkillsPanel.openSkillsSettings")}</DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Detail body */}
      <div
        data-skill-detail-body=""
        className={sx(skillStyles.detailBody)}
      >
        <div className={sx(skillStyles.detailColumn)}>
          <div
            data-skill-detail-overview=""
            className={sx(
              skillStyles.overview,
              skill.instructions
                ? skillStyles.overviewScrolled
                : skillStyles.overviewFull,
            )}
          >
            {/* Badges row */}
            <div className={sx(skillStyles.badgeRow)}>
              <Badge
                variant={sourceTypeBadgeVariant(sourceType)}
                className={sx(skillStyles.detailBadge)}
              >
                {sourceTypeLabel(sourceType)}
              </Badge>
              <Badge
                variant="outline"
                className={sx(skillStyles.detailBadge)}
              >
                {providerLabel(skill.provider)}
              </Badge>
              <Badge
                variant="secondary"
                className={sx(skillStyles.detailBadge)}
              >
                {scopeLabel(skill.scope)}
              </Badge>
            </div>

            {/* Description */}
            {skill.description ? (
              <div className={sx(skillStyles.field)}>
                <p className={sx(skillStyles.fieldLabel)}>{tI18n("workspace:workspaceSkillsPanel.description")}</p>
                <p className={sx(skillStyles.fieldText)}>{skill.description}</p>
              </div>
            ) : null}

            {/* Token */}
            <div className={sx(skillStyles.field)}>
              <p className={sx(skillStyles.fieldLabel)}>{tI18n("workspace:workspaceSkillsPanel.invocation")}</p>
              <div className={sx(skillStyles.tokenRow)}>
                <code className={sx(skillStyles.tokenCode)}>
                  {skill.invocationToken}
                </code>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon"
                          variant="ghost"
                          xstyle={skillStyles.iconButtonSm}
                          aria-label={tI18n("workspace:workspaceSkillsPanel.copyInvocationToken")}
                          onClick={handleCopyInvocationToken}
                        />
                      }
                    >
                      <Copy className={sx(skillStyles.glyphXs)} />
                    </TooltipTrigger>
                    <TooltipContent>{tI18n("workspace:workspaceSkillsPanel.copyToken")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  xstyle={skillStyles.insertButton}
                  onClick={props.onUse}
                  aria-label={tI18n("workspace:workspaceSkillsPanel.insertIntoPrompt")}
                >
                  <MessageSquarePlus className={sx(skillStyles.glyphSm)} />
                  {tI18n("workspace:workspaceSkillsPanel.insert")}</Button>
              </div>
            </div>

            <SkillMetadataDetails skill={skill} />
          </div>

          {/* Instructions preview */}
          {skill.instructions ? (
            <div
              data-skill-detail-instructions=""
              className={sx(skillStyles.instructionsBlock)}
            >
              <div className={sx(skillStyles.instructionsHead)}>
                <p className={sx(skillStyles.fieldLabel)}>{tI18n("workspace:workspaceSkillsPanel.instructions")}</p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon"
                          variant="ghost"
                          xstyle={skillStyles.iconButtonSm}
                          aria-label={tI18n("workspace:workspaceSkillsPanel.viewFullInstructions")}
                          onClick={props.onViewInstructions}
                        />
                      }
                    >
                      <Expand className={sx(skillStyles.glyphXs)} />
                    </TooltipTrigger>
                    <TooltipContent>{tI18n("workspace:workspaceSkillsPanel.viewFullInstructions")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <SkillInstructionsContent
                instructions={skill.instructions}
                xstyle={skillStyles.instructionsPreviewPane}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ---------- Main panel ---------- */

export function WorkspaceSkillsPanel(props: {
  onOpenSettings?: (options?: {
    repositoryPath?: string | null;
    section?: SectionId;
  }) => void;
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const [
    skillsEnabled,
    skillCatalog,
    activeWorkspaceId,
    repositoryPath,
    workspacePathById,
    sharedSkillsHome,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.skillsEnabled,
          state.skillCatalog,
          state.activeWorkspaceId,
          state.repositoryPath,
          state.workspacePathById,
          state.settings.sharedSkillsHome,
        ] as const,
    ),
  );
  const refreshSkillCatalog = useAppStore((state) => state.refreshSkillCatalog);
  const workspacePath =
    workspacePathById[activeWorkspaceId] ?? repositoryPath ?? null;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  /* ── Auto-refresh catalog when panel mounts ── */
  useEffect(() => {
    if (!skillsEnabled || !workspacePath) return;

    const normalizedSharedSkillsHome = sharedSkillsHome.trim() || null;
    const catalogMatchesRequest =
      skillCatalog.workspacePath === workspacePath &&
      skillCatalog.sharedSkillsHome === normalizedSharedSkillsHome;

    if (catalogMatchesRequest) {
      if (
        skillCatalog.status === "loading" ||
        skillCatalog.status === "error"
      ) {
        return;
      }

      if (skillCatalog.status !== "ready") {
        void refreshSkillCatalog({ workspacePath });
        return;
      }

      const CATALOG_TTL_MS = 5 * 60 * 1000;
      const fetchedAtMs = skillCatalog.fetchedAt
        ? Date.parse(skillCatalog.fetchedAt)
        : 0;
      if (Date.now() - fetchedAtMs < CATALOG_TTL_MS) return;
    }

    void refreshSkillCatalog({ workspacePath });
  }, [
    refreshSkillCatalog,
    sharedSkillsHome,
    skillCatalog.status,
    skillCatalog.workspacePath,
    skillCatalog.sharedSkillsHome,
    skillCatalog.fetchedAt,
    skillsEnabled,
    workspacePath,
  ]);

  /* ── Filtered & grouped skills ── */
  const filteredSkills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return skillCatalog.skills;
    return skillCatalog.skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(q) ||
        skill.slug.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q) ||
        skill.provider.toLowerCase().includes(q),
    );
  }, [searchQuery, skillCatalog.skills, i18n.resolvedLanguage]);

  const groupedSkills = useMemo(() => {
    const groups: {
      label: string;
      scope: SkillCatalogScope;
      skills: SkillCatalogEntry[];
    }[] = [
      { label: tI18n("workspace:workspaceSkillsPanel.workspace"), scope: "local", skills: [] },
      { label: tI18n("workspace:workspaceSkillsPanel.user"), scope: "user", skills: [] },
      { label: tI18n("workspace:workspaceSkillsPanel.global"), scope: "global", skills: [] },
    ];
    for (const skill of filteredSkills) {
      const group = groups.find((g) => g.scope === skill.scope);
      if (group) group.skills.push(skill);
    }
    return groups.filter((g) => g.skills.length > 0);
  }, [filteredSkills, i18n.resolvedLanguage]);

  const selectedSkill = useMemo(
    () =>
      selectedSkillId
        ? (skillCatalog.skills.find((s) => s.id === selectedSkillId) ?? null)
        : null,
    [selectedSkillId, skillCatalog.skills, i18n.resolvedLanguage],
  );

  const openSkillSettings = useCallback(() => {
    props.onOpenSettings?.({ section: "skills" });
  }, [props.onOpenSettings]);

  const insertSkillToPrompt = useInsertSkillToPrompt();
  const [instructionsDialogSkill, setInstructionsDialogSkill] =
    useState<SkillCatalogEntry | null>(null);

  /* ── Detail view ── */
  if (selectedSkill) {
    return (
      <>
        <SkillDetail
          skill={selectedSkill}
          onBack={() => setSelectedSkillId(null)}
          onUse={() => insertSkillToPrompt(selectedSkill.invocationToken)}
          onViewInstructions={() => setInstructionsDialogSkill(selectedSkill)}
          onOpenSettings={props.onOpenSettings ? openSkillSettings : undefined}
        />
        <SkillInstructionsDialog
          skill={instructionsDialogSkill}
          open={instructionsDialogSkill !== null}
          onOpenChange={(open) => {
            if (!open) setInstructionsDialogSkill(null);
          }}
        />
      </>
    );
  }

  /* ── Disabled state ── */
  if (!skillsEnabled) {
    return (
      <div className={sx(skillStyles.disabled)}>
        <Empty xstyle={skillStyles.disabledEmpty}>
          <EmptyHeader>
            <EmptyMedia>
              <Search className={sx(skillStyles.glyphMd)} />
            </EmptyMedia>
            <EmptyTitle>{tI18n("workspace:workspaceSkillsPanel.skillsDisabled")}</EmptyTitle>
            <EmptyDescription>
              {tI18n("workspace:workspaceSkillsPanel.enableSkillsInSettingsToDiscoverAnd")}</EmptyDescription>
          </EmptyHeader>
          {props.onOpenSettings ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              xstyle={skillStyles.disabledAction}
              onClick={openSkillSettings}
            >
              <Settings2 className={sx(skillStyles.disabledActionIcon)} />
              {tI18n("workspace:workspaceSkillsPanel.openSettings")}</Button>
          ) : null}
        </Empty>
      </div>
    );
  }

  /* ── List view ── */
  return (
    <>
      <div className={sx(skillStyles.panel)}>
        {/* Header bar */}
        <div className={sx(skillStyles.panelHeader)}>
          <div className={sx(skillStyles.panelHeaderText)}>
            <span className={sx(skillStyles.panelCount)}>
              {skillCatalog.status === "loading"
                ? tI18n("workspace:workspaceSkillsPanel.loading")
                : tI18n("workspace:workspaceSkillsPanel.valueSkillvalue", { count: filteredSkills.length })}
            </span>
            <span className={sx(skillStyles.panelHint)}>
              {tI18n("workspace:workspaceSkillsPanel.inspectInstructionsOrInsertASkillDirectly")}</span>
          </div>
          <div className={sx(skillStyles.panelActions)}>
            {props.onOpenSettings ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                xstyle={skillStyles.iconButtonMd}
                onClick={openSkillSettings}
                title={tI18n("workspace:workspaceSkillsPanel.skillsSettings")}
                aria-label={tI18n("workspace:workspaceSkillsPanel.openSkillsSettings2")}
              >
                <Settings2 className={sx(skillStyles.glyphSm)} />
              </Button>
            ) : null}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              xstyle={skillStyles.iconButtonMd}
              onClick={() => void refreshSkillCatalog({ workspacePath })}
              disabled={skillCatalog.status === "loading"}
              title={tI18n("workspace:workspaceSkillsPanel.refresh")}
              aria-label={tI18n("workspace:workspaceSkillsPanel.refreshSkills")}
            >
              <RefreshCcw
                className={sx(
                  skillStyles.glyphSm,
                  skillCatalog.status === "loading" && skillStyles.spinning,
                )}
              />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className={sx(skillStyles.searchSlot)}>
          <div className={sx(skillStyles.searchAnchor)}>
            <Search className={sx(skillStyles.searchIcon)} />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              xstyle={skillStyles.searchInput}
              placeholder={tI18n("workspace:workspaceSkillsPanel.findASkillByNameProviderOr")}
              aria-label={tI18n("workspace:workspaceSkillsPanel.searchSkills")}
            />
            {searchQuery ? (
              <AdsButton
                layout="host"
                type="button"
                xstyle={skillStyles.searchClear}
                onClick={() => setSearchQuery("")}
                aria-label={tI18n("workspace:workspaceSkillsPanel.clearSkillSearch")}
              >
                <X className={sx(skillStyles.glyphSm)} />
              </AdsButton>
            ) : null}
          </div>
        </div>

        {/* Skill list */}
        <div className={sx(skillStyles.list)}>
          {skillCatalog.status === "loading" &&
          skillCatalog.skills.length === 0 ? (
            <div className={sx(skillStyles.listStatus)}>
              {tI18n("workspace:workspaceSkillsPanel.discoveringSkills")}</div>
          ) : filteredSkills.length === 0 ? (
            <div className={sx(skillStyles.listEmpty)}>
              <p className={sx(skillStyles.listEmptyText)}>
                {searchQuery ? tI18n("workspace:workspaceSkillsPanel.noMatchingSkills") : tI18n("workspace:workspaceSkillsPanel.noSkillsFound")}
              </p>
            </div>
          ) : (
            <div>
              {groupedSkills.map((group) => (
                <div key={group.scope}>
                  <SectionHeader
                    title={group.label}
                    count={group.skills.length}
                  />
                  <div>
                    {group.skills.map((skill) => (
                      <SkillRow
                        key={skill.id}
                        skill={skill}
                        onClick={() => setSelectedSkillId(skill.id)}
                        onUse={() => insertSkillToPrompt(skill.invocationToken)}
                        onViewInstructions={() =>
                          setInstructionsDialogSkill(skill)
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <SkillInstructionsDialog
        skill={instructionsDialogSkill}
        open={instructionsDialogSkill !== null}
        onOpenChange={(open) => {
          if (!open) setInstructionsDialogSkill(null);
        }}
      />
    </>
  );
}
