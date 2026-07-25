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
import { cn } from "@/lib/utils";
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
  className?: string;
}) {
  if (props.presentation === "source") {
    return (
      <pre
        data-skill-instructions-source=""
        className={cn(
          "min-h-0 rounded-lg bg-muted/25 px-4 py-3 font-mono text-[13px] leading-6 text-foreground whitespace-pre-wrap break-words ring-1 ring-border/60",
          props.className,
        )}
      >
        <code>{props.instructions}</code>
      </pre>
    );
  }

  return (
    <div
      data-skill-instructions-rendered=""
      className={cn(
        "flex min-h-0 flex-col rounded-lg bg-surface px-4 py-3 text-foreground ring-1 ring-border/60",
        props.className,
      )}
    >
      <EditorMarkdownPreview
        content={props.instructions}
        fontSize={14}
        variant="embedded"
        className="min-h-0 flex-1 overflow-visible bg-transparent [&>div]:min-h-full [&>div]:text-foreground [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_h4]:text-sm"
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
      <DialogContent className="flex h-[min(88vh,56rem)] max-h-[88vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-7 py-5 pr-14">
          <DialogTitle>{skill.name}</DialogTitle>
          <DialogDescription>
            {skill.description || "No description"}
          </DialogDescription>
        </DialogHeader>
        {skill.instructions ? (
          <Tabs defaultValue="rendered" className="h-full min-h-0 flex-1 gap-0">
            <div className="shrink-0 border-b border-border/60 px-7">
              <TabsList
                variant="line"
                aria-label="Instruction view"
                className="h-11 gap-5 rounded-none p-0"
              >
                <TabsTrigger
                  value="rendered"
                  className="h-11 flex-none px-0 text-[13px]"
                >
                  Rendered
                </TabsTrigger>
                <TabsTrigger
                  value="source"
                  className="h-11 flex-none px-0 text-[13px]"
                >
                  Source
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent
              value="rendered"
              className="flex h-full min-h-0 flex-1 flex-col overflow-auto px-5 py-5 sm:px-7"
            >
              <SkillInstructionsContent
                instructions={skill.instructions}
                className="h-full min-h-full flex-1"
              />
            </TabsContent>
            <TabsContent
              value="source"
              className="flex h-full min-h-0 flex-1 flex-col overflow-auto px-5 py-5 sm:px-7"
            >
              <SkillInstructionsContent
                instructions={skill.instructions}
                presentation="source"
                className="h-full min-h-full flex-1"
              />
            </TabsContent>
          </Tabs>
        ) : (
          <p className="flex min-h-0 flex-1 items-center justify-center px-7 py-8 text-sm text-muted-foreground">
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
    <div className="flex items-center justify-between gap-2 border-b border-border/55 px-1 pt-4 pb-2">
      <h3 className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {props.title}
      </h3>
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
        {props.count}
      </span>
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
    <div className="group flex w-full items-center gap-3 border-b border-border/45 px-1 py-3 text-left transition-colors hover:bg-accent/15 focus-within:bg-accent/15">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3"
        onClick={props.onClick}
      >
        <div className="flex shrink-0 items-center pt-0.5">
          <ScopeIcon
            scope={props.skill.scope}
            className="size-3.5 text-muted-foreground"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-foreground">
              {props.skill.name}
            </span>
            <Badge
              variant={sourceTypeBadgeVariant(sourceType)}
              className="h-[18px] rounded-sm px-1.5 py-0 text-[10px] uppercase tracking-wide"
            >
              {sourceTypeLabel(sourceType)}
            </Badge>
            {props.skill.provider !== "shared" ? (
              <Badge
                variant="outline"
                className="h-[18px] rounded-sm px-1.5 py-0 text-[10px]"
              >
                {providerLabel(props.skill.provider)}
              </Badge>
            ) : null}
          </div>
          {props.skill.description ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {props.skill.description}
            </p>
          ) : null}
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {props.skill.instructions ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-6 rounded-md"
                    aria-label="View instructions"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onViewInstructions();
                    }}
                  />
                }
              >
                <Expand className="size-3" />
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
                  className="size-6 rounded-md"
                  aria-label="Insert into prompt"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onUse();
                  }}
                />
              }
            >
              <MessageSquarePlus className="size-3" />
            </TooltipTrigger>
            <TooltipContent>Insert into prompt</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
    </div>
  );
}

/* ---------- Skill detail view ---------- */

export function SkillMetadataDetails(props: { skill: SkillCatalogEntry }) {
  const { skill } = props;

  return (
    <details
      data-skill-metadata-details=""
      className="group rounded-lg bg-muted/20 text-xs text-muted-foreground"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:bg-muted/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3 shrink-0 transition-transform duration-150 group-open:rotate-90" />
        Details
      </summary>
      <dl className="space-y-1.5 px-2.5 pb-2.5 pt-1">
        <div className="flex gap-2">
          <dt className="shrink-0 font-medium text-foreground/70">Slug</dt>
          <dd className="min-w-0 truncate" title={skill.slug}>
            {skill.slug}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 font-medium text-foreground/70">Path</dt>
          <dd className="min-w-0 truncate" title={skill.path}>
            {skill.path}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 font-medium text-foreground/70">Root</dt>
          <dd className="min-w-0 truncate" title={skill.sourceRootPath}>
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
    <div className="flex h-full flex-col">
      {/* Detail header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-2 py-2">
        <Button
          size="icon"
          variant="ghost"
          className="size-7 rounded-md"
          aria-label="Back to skills"
          onClick={props.onBack}
        >
          <ArrowLeft className="size-3.5" />
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {skill.name}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                className="size-7 rounded-md"
                aria-label="More skill actions"
              />
            }
          >
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={handleCopyInvocationToken}>
              <Copy className="size-4" />
              Copy invocation token
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleCopyPath}>
              <Copy className="size-4" />
              Copy path
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleOpenInFinder}>
              <ExternalLink className="size-4" />
              Reveal in Finder
            </DropdownMenuItem>
            {props.onOpenSettings ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={props.onOpenSettings}>
                  <Settings2 className="size-4" />
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
        className="min-h-0 flex-1 overflow-hidden px-3 py-3"
      >
        <div className="flex h-full min-h-0 flex-col gap-4">
          <div
            data-skill-detail-overview=""
            className={cn(
              "min-h-0 space-y-4 pr-1",
              skill.instructions
                ? "max-h-[42%] shrink-0 overflow-y-auto overscroll-contain pb-1"
                : "flex-1 overflow-y-auto",
            )}
          >
            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant={sourceTypeBadgeVariant(sourceType)}
                className="rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-wide"
              >
                {sourceTypeLabel(sourceType)}
              </Badge>
              <Badge
                variant="outline"
                className="rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-wide"
              >
                {providerLabel(skill.provider)}
              </Badge>
              <Badge
                variant="secondary"
                className="rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-wide"
              >
                {scopeLabel(skill.scope)}
              </Badge>
            </div>

            {/* Description */}
            {skill.description ? (
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Description
                </p>
                <p className="text-sm leading-relaxed text-foreground">
                  {skill.description}
                </p>
              </div>
            ) : null}

            {/* Token */}
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Invocation
              </p>
              <div className="flex items-center gap-2">
                <code className="rounded-md border border-border/70 bg-background/60 px-2 py-1 font-mono text-sm">
                  {skill.invocationToken}
                </code>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6 rounded-md"
                          aria-label="Copy invocation token"
                          onClick={handleCopyInvocationToken}
                        />
                      }
                    >
                      <Copy className="size-3" />
                    </TooltipTrigger>
                    <TooltipContent>Copy token</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 rounded-md px-2"
                  onClick={props.onUse}
                  aria-label="Insert into prompt"
                >
                  <MessageSquarePlus className="size-3.5" />
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
              className="flex min-h-0 flex-1 flex-col gap-1"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Instructions
                </p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6 rounded-md"
                          aria-label="View full instructions"
                          onClick={props.onViewInstructions}
                        />
                      }
                    >
                      <Expand className="size-3" />
                    </TooltipTrigger>
                    <TooltipContent>View full instructions</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <SkillInstructionsContent
                instructions={skill.instructions}
                className="min-h-0 flex-1 overflow-auto px-3 py-2.5"
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
      <div className="flex h-full flex-col items-center justify-center px-4">
        <Empty className="border border-dashed border-border/70 bg-muted/15">
          <EmptyHeader>
            <EmptyMedia>
              <Search className="size-4" />
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
              className="mt-1 h-8 rounded-md"
              onClick={openSkillSettings}
            >
              <Settings2 className="mr-1 size-4" />
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
      <div className="flex h-full flex-col">
        {/* Header bar */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/45 px-3 py-2.5">
          <div className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">
              {skillCatalog.status === "loading"
                ? "Loading..."
                : `${filteredSkills.length} skill${filteredSkills.length !== 1 ? "s" : ""}`}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              Inspect instructions or insert a skill directly into the prompt.
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {props.onOpenSettings ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 rounded-md"
                onClick={openSkillSettings}
                title="Skills Settings"
                aria-label="Open skills settings"
              >
                <Settings2 className="size-3.5" />
              </Button>
            ) : null}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 rounded-md"
              onClick={() => void refreshSkillCatalog({ workspacePath })}
              disabled={skillCatalog.status === "loading"}
              title="Refresh"
              aria-label="Refresh skills"
            >
              <RefreshCcw
                className={cn(
                  "size-3.5",
                  skillCatalog.status === "loading" && "animate-spin",
                )}
              />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="shrink-0 px-3 py-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 border-transparent bg-muted/35 pl-7 pr-7 text-sm hover:border-border/70"
              placeholder="Find a skill by name, provider, or purpose…"
              aria-label="Search skills"
            />
            {searchQuery ? (
              <button
                type="button"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery("")}
                aria-label="Clear skill search"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Skill list */}
        <div className="min-h-0 flex-1 overflow-auto px-3 pb-2">
          {skillCatalog.status === "loading" &&
          skillCatalog.skills.length === 0 ? (
            <div className="px-1 py-4 text-xs text-muted-foreground">
              Discovering skills...
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="px-1 py-4 text-center">
              <p className="text-sm text-muted-foreground">
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
