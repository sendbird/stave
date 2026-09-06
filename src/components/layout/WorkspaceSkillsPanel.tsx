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
      return "Provider";
    case "user":
      return "User";
    case "shared":
      return "Shared";
  }
}

function providerLabel(provider: SkillCatalogProvider): string {
  if (provider === "shared") return "Shared";
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
      return "Workspace";
    case "user":
      return "User";
    case "global":
      return "Global";
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
      toast.success("Inserted into prompt");
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
  const { skill } = props;
  if (!skill) return null;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent xstyle={skillStyles.dialog}>
        <DialogHeader className={sx(skillStyles.dialogHeader)}>
          <DialogTitle>{skill.name}</DialogTitle>
          <DialogDescription>
            {skill.description || "No description"}
          </DialogDescription>
        </DialogHeader>
        {skill.instructions ? (
          <Tabs
            variant="line"
            defaultValue="rendered"
            className={sx(skillStyles.dialogTabs)}
          >
            <div className={sx(skillStyles.dialogTabBar)}>
              <TabsList
                variant="line"
                aria-label="Instruction view"
                className={sx(skillStyles.dialogTabList)}
              >
                <TabsTrigger
                  value="rendered"
                  className={sx(skillStyles.dialogTab)}
                >
                  Rendered
                </TabsTrigger>
                <TabsTrigger
                  value="source"
                  className={sx(skillStyles.dialogTab)}
                >
                  Source
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent
              value="rendered"
              className={sx(skillStyles.dialogPanel)}
            >
              <SkillInstructionsContent
                instructions={skill.instructions}
                xstyle={skillStyles.instructionsFill}
              />
            </TabsContent>
            <TabsContent value="source" className={sx(skillStyles.dialogPanel)}>
              <SkillInstructionsContent
                instructions={skill.instructions}
                presentation="source"
                xstyle={skillStyles.instructionsFill}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <p className={sx(skillStyles.dialogEmpty)}>
            No instructions available.
          </p>
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
  const sourceType = resolveSourceType(props.skill);

  return (
    <div className={sx(skillStyles.row)}>
      <AdsButton
        layout="host"
        type="button"
        xstyle={skillStyles.rowOpen}
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
                    aria-label="View instructions"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onViewInstructions();
                    }}
                  />
                }
              >
                <Expand className={sx(skillStyles.glyphXs)} />
              </TooltipTrigger>
              <TooltipContent>View instructions</TooltipContent>
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
                  aria-label="Insert into prompt"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onUse();
                  }}
                />
              }
            >
              <MessageSquarePlus className={sx(skillStyles.glyphXs)} />
            </TooltipTrigger>
            <TooltipContent>Insert into prompt</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <ChevronRight className={sx(skillStyles.rowChevron)} />
    </div>
  );
}

/* ---------- Skill detail view ---------- */

export function SkillMetadataDetails(props: { skill: SkillCatalogEntry }) {
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
        Details
      </summary>
      <dl className={sx(skillStyles.detailsList)}>
        <div className={sx(skillStyles.detailsRow)}>
          <dt className={sx(skillStyles.detailsTerm)}>Slug</dt>
          <dd className={sx(skillStyles.detailsValue)} title={skill.slug}>
            {skill.slug}
          </dd>
        </div>
        <div className={sx(skillStyles.detailsRow)}>
          <dt className={sx(skillStyles.detailsTerm)}>Path</dt>
          <dd className={sx(skillStyles.detailsValue)} title={skill.path}>
            {skill.path}
          </dd>
        </div>
        <div className={sx(skillStyles.detailsRow)}>
          <dt className={sx(skillStyles.detailsTerm)}>Root</dt>
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
  const { skill } = props;
  const sourceType = resolveSourceType(skill);

  const handleCopyPath = useCallback(() => {
    void copyTextToClipboard(skill.path);
    toast.success("Path copied");
  }, [skill.path]);

  const handleCopyInvocationToken = useCallback(() => {
    void copyTextToClipboard(skill.invocationToken);
    toast.success("Invocation token copied");
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
          aria-label="Back to skills"
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
                aria-label="More skill actions"
              />
            }
          >
            <MoreHorizontal className={sx(skillStyles.glyphSm)} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={sx(skillStyles.detailMenu)}>
            <DropdownMenuItem onSelect={handleCopyInvocationToken}>
              <Copy className={sx(skillStyles.glyphMd)} />
              Copy invocation token
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleCopyPath}>
              <Copy className={sx(skillStyles.glyphMd)} />
              Copy path
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleOpenInFinder}>
              <ExternalLink className={sx(skillStyles.glyphMd)} />
              Reveal in Finder
            </DropdownMenuItem>
            {props.onOpenSettings ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={props.onOpenSettings}>
                  <Settings2 className={sx(skillStyles.glyphMd)} />
                  Open Skills settings
                </DropdownMenuItem>
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
                <p className={sx(skillStyles.fieldLabel)}>Description</p>
                <p className={sx(skillStyles.fieldText)}>{skill.description}</p>
              </div>
            ) : null}

            {/* Token */}
            <div className={sx(skillStyles.field)}>
              <p className={sx(skillStyles.fieldLabel)}>Invocation</p>
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
                          aria-label="Copy invocation token"
                          onClick={handleCopyInvocationToken}
                        />
                      }
                    >
                      <Copy className={sx(skillStyles.glyphXs)} />
                    </TooltipTrigger>
                    <TooltipContent>Copy token</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  xstyle={skillStyles.insertButton}
                  onClick={props.onUse}
                  aria-label="Insert into prompt"
                >
                  <MessageSquarePlus className={sx(skillStyles.glyphSm)} />
                  Insert
                </Button>
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
                <p className={sx(skillStyles.fieldLabel)}>Instructions</p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon"
                          variant="ghost"
                          xstyle={skillStyles.iconButtonSm}
                          aria-label="View full instructions"
                          onClick={props.onViewInstructions}
                        />
                      }
                    >
                      <Expand className={sx(skillStyles.glyphXs)} />
                    </TooltipTrigger>
                    <TooltipContent>View full instructions</TooltipContent>
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
    projectPath?: string | null;
    section?: SectionId;
  }) => void;
}) {
  const [
    skillsEnabled,
    skillCatalog,
    activeWorkspaceId,
    projectPath,
    workspacePathById,
    sharedSkillsHome,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.skillsEnabled,
          state.skillCatalog,
          state.activeWorkspaceId,
          state.projectPath,
          state.workspacePathById,
          state.settings.sharedSkillsHome,
        ] as const,
    ),
  );
  const refreshSkillCatalog = useAppStore((state) => state.refreshSkillCatalog);
  const workspacePath =
    workspacePathById[activeWorkspaceId] ?? projectPath ?? null;

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
  }, [searchQuery, skillCatalog.skills]);

  const groupedSkills = useMemo(() => {
    const groups: {
      label: string;
      scope: SkillCatalogScope;
      skills: SkillCatalogEntry[];
    }[] = [
      { label: "Workspace", scope: "local", skills: [] },
      { label: "User", scope: "user", skills: [] },
      { label: "Global", scope: "global", skills: [] },
    ];
    for (const skill of filteredSkills) {
      const group = groups.find((g) => g.scope === skill.scope);
      if (group) group.skills.push(skill);
    }
    return groups.filter((g) => g.skills.length > 0);
  }, [filteredSkills]);

  const selectedSkill = useMemo(
    () =>
      selectedSkillId
        ? (skillCatalog.skills.find((s) => s.id === selectedSkillId) ?? null)
        : null,
    [selectedSkillId, skillCatalog.skills],
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
            <EmptyTitle>Skills disabled</EmptyTitle>
            <EmptyDescription>
              Enable skills in Settings to discover and use them.
            </EmptyDescription>
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
              Open Settings
            </Button>
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
                ? "Loading..."
                : `${filteredSkills.length} skill${filteredSkills.length !== 1 ? "s" : ""}`}
            </span>
            <span className={sx(skillStyles.panelHint)}>
              Inspect instructions or insert a skill directly into the prompt.
            </span>
          </div>
          <div className={sx(skillStyles.panelActions)}>
            {props.onOpenSettings ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                xstyle={skillStyles.iconButtonMd}
                onClick={openSkillSettings}
                title="Skills Settings"
                aria-label="Open skills settings"
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
              title="Refresh"
              aria-label="Refresh skills"
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
              placeholder="Find a skill by name, provider, or purpose…"
              aria-label="Search skills"
            />
            {searchQuery ? (
              <AdsButton
                layout="host"
                type="button"
                xstyle={skillStyles.searchClear}
                onClick={() => setSearchQuery("")}
                aria-label="Clear skill search"
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
              Discovering skills...
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className={sx(skillStyles.listEmpty)}>
              <p className={sx(skillStyles.listEmptyText)}>
                {searchQuery ? "No matching skills." : "No skills found."}
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
