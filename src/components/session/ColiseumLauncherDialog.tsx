import { Paperclip, Plus, Swords, Trash2, X } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Button,
  Kbd,
  Textarea,
  toast,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { ProviderModelPicker } from "@/components/session/ProviderModelPicker";
import {
  getColiseumDefaultModelForProvider,
  isColiseumSubmitShortcut,
  mergeColiseumAttachedFilePaths,
  resolveColiseumInitialModel,
  resolveColiseumAttachmentFileContexts,
} from "@/components/session/coliseum-launcher-dialog.utils";
import { listProviderIds } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import {
  MAX_COLISEUM_BRANCHES,
  MIN_COLISEUM_BRANCHES,
  validateColiseumBranches,
  type ColiseumBranchSpec,
} from "@/store/coliseum.utils";

/**
 * Coliseum launcher dialog.
 *
 * Why a standalone dialog rather than inline in ChatInput: the composer is
 * already a dense multi-concern component (1800+ LOC) and the Coliseum is an
 * intentionally opt-in, low-frequency action. A dialog keeps the happy path
 * (single-model chat) visually clean, and isolates the fan-out flow so it
 * cannot regress existing behaviour.
 */

interface ColiseumLauncherDialogProps {
  parentTaskId: string;
  defaultProviderId?: ProviderId;
  defaultModel?: string;
  workspaceRootPath?: string;
  disabled?: boolean;
  disabledReason?: string;
  renderTrigger?: (args: { disabled: boolean }) => ReactNode;
  tooltipSide?: "top" | "right" | "bottom" | "left";
}

interface BranchDraft {
  id: string;
  provider: ProviderId;
  model: string;
}

function makeDefaultBranches(args: {
  defaultProviderId?: ProviderId;
  defaultModel?: string;
}): BranchDraft[] {
  const primaryProvider: ProviderId = args.defaultProviderId ?? "claude-code";
  const primaryModel = resolveColiseumInitialModel({
    providerId: primaryProvider,
    preferredModel: args.defaultModel,
  });
  // Pick a distinct second entrant so the contest actually compares something.
  const secondaryProvider: ProviderId =
    primaryProvider === "codex" ? "claude-code" : "codex";
  const secondaryModel = getColiseumDefaultModelForProvider({
    providerId: secondaryProvider,
  });
  return [
    { id: crypto.randomUUID(), provider: primaryProvider, model: primaryModel },
    {
      id: crypto.randomUUID(),
      provider: secondaryProvider,
      model: secondaryModel,
    },
  ];
}

export function ColiseumLauncherDialog(args: ColiseumLauncherDialogProps) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<BranchDraft[]>(() =>
    makeDefaultBranches({
      defaultProviderId: args.defaultProviderId,
      defaultModel: args.defaultModel,
    }),
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [prompt, setPrompt] = useState("");
  const [attachedFilePaths, setAttachedFilePaths] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const startColiseum = useAppStore((state) => state.startColiseum);
  const providerAvailability = useAppStore(
    (state) => state.providerAvailability,
  );
  const editorTabs = useAppStore((state) => state.editorTabs);

  const providerIds = useMemo(() => listProviderIds(), []);

  const branchSpecs = useMemo<ColiseumBranchSpec[]>(
    () =>
      branches.map((branch) => ({
        provider: branch.provider,
        model: branch.model,
      })),
    [branches],
  );

  const validationError = useMemo(
    () => validateColiseumBranches(branchSpecs),
    [branchSpecs],
  );
  const hasUnavailableProvider = branches.some(
    (branch) => providerAvailability[branch.provider] === false,
  );
  const promptTrimmed = prompt.trim();
  const canSubmit =
    !submitting &&
    validationError == null &&
    !hasUnavailableProvider &&
    promptTrimmed.length > 0;
  const canAttachFiles = Boolean(
    args.workspaceRootPath &&
      typeof window !== "undefined" &&
      window.api?.fs?.pickFiles,
  );
  const shortcutModifierLabel =
    typeof window !== "undefined" && window.api?.platform === "darwin"
      ? "Cmd"
      : "Ctrl";

  const resetToDefaults = () => {
    setBranches(
      makeDefaultBranches({
        defaultProviderId: args.defaultProviderId,
        defaultModel: args.defaultModel,
      }),
    );
    setPrompt("");
    setAttachedFilePaths([]);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (submitting) {
      return;
    }
    setOpen(nextOpen);
    if (!nextOpen) {
      // Reset on close so the next open starts fresh.
      resetToDefaults();
    }
  };

  const addBranch = () => {
    if (branches.length >= MAX_COLISEUM_BRANCHES) return;
    // Seed the new row with a provider that is not already at capacity, or fall
    // back to the first available provider. Keeps duplicate picks possible (the
    // user may want to compare two temperatures of the same model later).
    const usedProviderIds = new Set(branches.map((branch) => branch.provider));
    const nextProvider =
      providerIds.find((id) => !usedProviderIds.has(id)) ?? providerIds[0];
    if (!nextProvider) return;
    setBranches([
      ...branches,
      {
        id: crypto.randomUUID(),
        provider: nextProvider,
        model: getColiseumDefaultModelForProvider({
          providerId: nextProvider,
        }),
      },
    ]);
  };

  const removeBranch = (branchId: string) => {
    if (branches.length <= MIN_COLISEUM_BRANCHES) return;
    setBranches(branches.filter((branch) => branch.id !== branchId));
  };

  const updateBranchProvider = (branchId: string, provider: ProviderId) => {
    setBranches(
      branches.map((branch) =>
        branch.id === branchId
          ? {
              ...branch,
              provider,
              model: getColiseumDefaultModelForProvider({
                providerId: provider,
              }),
            }
          : branch,
      ),
    );
  };

  const updateBranchModel = (branchId: string, model: string) => {
    setBranches(
      branches.map((branch) =>
        branch.id === branchId ? { ...branch, model } : branch,
      ),
    );
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { fileContexts, unreadableFilePaths } =
        await resolveColiseumAttachmentFileContexts({
          attachedFilePaths,
          editorTabs,
          workspaceRootPath: args.workspaceRootPath,
          readFile: window.api?.fs?.readFile,
        });
      if (unreadableFilePaths.length > 0) {
        toast.error("Some attachments could not be read.", {
          description:
            unreadableFilePaths.length === 1
              ? unreadableFilePaths[0]
              : `${unreadableFilePaths.length} files need attention before starting the Coliseum.`,
        });
        return;
      }

      const result = await startColiseum({
        parentTaskId: args.parentTaskId,
        branches: branchSpecs,
        content: promptTrimmed,
        fileContexts,
        imageContexts: [],
      });
      if (result.status === "started") {
        toast.success(
          `Coliseum started — ${result.branchTaskIds.length} branches running`,
        );
        setOpen(false);
        resetToDefaults();
      } else {
        toast.error(`Could not start Coliseum: ${result.reason}`);
      }
    } catch (error) {
      toast.error(
        `Failed to start Coliseum: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleAttachFiles = async () => {
    const pickFiles = window.api?.fs?.pickFiles;
    if (!pickFiles || !args.workspaceRootPath) {
      return;
    }
    const result = await pickFiles({ rootPath: args.workspaceRootPath });
    if (!result.ok || result.filePaths.length === 0) {
      return;
    }
    setAttachedFilePaths((current) =>
      mergeColiseumAttachedFilePaths({
        existing: current,
        incoming: result.filePaths,
      }),
    );
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSubmit();
  };

  const handlePromptKeyDown = (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (
      !isColiseumSubmitShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        isComposing: event.nativeEvent.isComposing,
      })
    ) {
      return;
    }
    event.preventDefault();
    formRef.current?.requestSubmit();
  };

  const triggerDisabled = args.disabled === true;
  const triggerElement = args.renderTrigger?.({ disabled: triggerDisabled }) ?? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="gap-1.5 text-xs"
      disabled={triggerDisabled}
    >
      <Swords className="size-3.5" />
      <span>Coliseum</span>
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <DialogTrigger asChild disabled={triggerDisabled}>
                {triggerElement}
              </DialogTrigger>
            </span>
          </TooltipTrigger>
          <TooltipContent
            side={args.tooltipSide ?? "bottom"}
            className="max-w-xs text-xs"
          >
            {triggerDisabled
              ? (args.disabledReason ??
                "Coliseum is unavailable for this task right now.")
              : "Run the same prompt across 2–4 models in parallel and pick the winner."}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DialogContent className="sm:max-w-xl">
        <form ref={formRef} onSubmit={handleFormSubmit} className="grid gap-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Swords className="size-4" />
              Coliseum
            </DialogTitle>
            <DialogDescription>
              Pick {MIN_COLISEUM_BRANCHES}–{MAX_COLISEUM_BRANCHES} entrants.
              Each runs the same prompt in parallel; you promote one response as
              the canonical answer and the rest are discarded.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {branches.map((branch, index) => {
              const providerAvailable =
                providerAvailability[branch.provider] !== false;
              return (
                <div
                  key={branch.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 p-2",
                    !providerAvailable && "border-destructive/60",
                  )}
                >
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </span>

                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <ProviderModelPicker
                      selectedProvider={branch.provider}
                      selectedModel={branch.model}
                      onProviderChange={(providerId) =>
                        updateBranchProvider(branch.id, providerId)
                      }
                      onModelChange={(model) =>
                        updateBranchModel(branch.id, model)
                      }
                      providerAvailable={providerAvailable}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove entrant ${index + 1}`}
                    disabled={branches.length <= MIN_COLISEUM_BRANCHES}
                    onClick={() => removeBranch(branch.id)}
                    className="shrink-0"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addBranch}
              disabled={branches.length >= MAX_COLISEUM_BRANCHES}
              className="self-start gap-1.5 text-xs"
            >
              <Plus className="size-3.5" />
              Add entrant ({branches.length}/{MAX_COLISEUM_BRANCHES})
            </Button>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="coliseum-prompt"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Prompt
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  disabled={!canAttachFiles || submitting}
                  onClick={() => void handleAttachFiles()}
                  aria-label="Attach files to Coliseum"
                >
                  <Paperclip className="size-3.5" />
                  {attachedFilePaths.length > 0
                    ? `Attached (${attachedFilePaths.length})`
                    : "Attach files"}
                </Button>
              </div>
              <Textarea
                id="coliseum-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handlePromptKeyDown}
                placeholder="Type the prompt every entrant should run..."
                rows={5}
                className="resize-none text-sm"
                disabled={submitting}
              />
              {attachedFilePaths.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {attachedFilePaths.map((filePath) => (
                    <div
                      key={filePath}
                      className="flex items-center gap-1 rounded-sm border border-border/80 bg-secondary/40 px-2 py-1 text-xs"
                    >
                      <span className="font-mono text-foreground">
                        {filePath}
                      </span>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() =>
                          setAttachedFilePaths((current) =>
                            current.filter((candidate) => candidate !== filePath),
                          )
                        }
                        className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                        aria-label={`Remove attached file ${filePath}`}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>Start shortcut</span>
                <Kbd>{shortcutModifierLabel}</Kbd>
                <Kbd>Enter</Kbd>
              </div>
            </div>

            {validationError || hasUnavailableProvider ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {hasUnavailableProvider
                  ? "One or more selected providers are unavailable. Check provider status and retry."
                  : validationError}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {submitting ? "Starting…" : "Start Coliseum"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
