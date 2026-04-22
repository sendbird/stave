import { useMemo } from "react";
import { Badge, Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  buildCommandPaletteGroups,
  recordRecentCommandPaletteAction,
  type CommandPaletteRuntimeContext,
} from "@/components/layout/command-palette-registry";
import { useAppStore } from "@/store/app.store";

interface GlobalCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runtimeContext: CommandPaletteRuntimeContext;
}

function buildSearchValue(args: {
  groupTitle: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
}) {
  return [
    args.groupTitle,
    args.title,
    args.subtitle ?? "",
    ...(args.keywords ?? []),
  ]
    .join(" ")
    .trim();
}

export function GlobalCommandPalette(args: GlobalCommandPaletteProps) {
  const updateSettings = useAppStore((state) => state.updateSettings);
  const sections = useMemo(
    () => buildCommandPaletteGroups(args.runtimeContext),
    [args.runtimeContext],
  );

  return (
    <CommandDialog
      open={args.open}
      onOpenChange={args.onOpenChange}
      title="Command Palette"
      description="Run workspace commands, switch context, and open settings."
      className="max-w-2xl border-border/80 bg-background/95 p-0 shadow-2xl"
    >
      <Command
        key={args.open ? "open" : "closed"}
        className="flex h-[min(84vh,44rem)] min-h-0 flex-col bg-transparent"
      >
        <div className="shrink-0 border-b border-border/70 px-1 pb-1">
          <CommandInput autoFocus placeholder="Type a command or search settings, tasks, and workspaces..." />
        </div>
        <CommandList className="min-h-0 max-h-none flex-1 px-2 pb-3">
          <CommandEmpty className="px-4 py-10 text-left">
            <p className="text-sm font-medium text-foreground">No matching command.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Global IDE commands live here. Slash commands stay in the chat input.
            </p>
          </CommandEmpty>
          {sections.map((section) => (
            <CommandGroup key={section.key} heading={section.title} className="py-1">
              {section.items.map((action) => {
                const Icon = action.icon;
                return (
                  <CommandItem
                    key={action.id}
                    value={buildSearchValue({
                      groupTitle: section.title,
                      title: action.title,
                      subtitle: action.subtitle,
                      keywords: action.keywords,
                    })}
                    onSelect={() => {
                      args.onOpenChange(false);
                      updateSettings({
                        patch: {
                          commandPaletteRecentCommandIds: recordRecentCommandPaletteAction({
                            commandId: action.id,
                            recentIds: args.runtimeContext.preferences.recentIds,
                          }),
                        },
                      });
                      void action.run();
                    }}
                    className="items-start gap-3 rounded-lg px-3 py-3"
                  >
                    {Icon ? (
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/70 text-muted-foreground">
                        <Icon className="size-4" />
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-foreground">{action.title}</span>
                        {action.source === "contributed" ? (
                          <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px] uppercase tracking-[0.16em]">
                            Ext
                          </Badge>
                        ) : null}
                      </div>
                      {action.subtitle ? (
                        <p className="truncate text-xs text-muted-foreground">{action.subtitle}</p>
                      ) : null}
                    </div>
                    {action.shortcut ? (
                      <CommandShortcut className={cn("mt-1 whitespace-nowrap text-[11px] tracking-normal")}>
                        {action.shortcut}
                      </CommandShortcut>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
