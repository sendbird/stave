import { RotateCcw, Settings2 } from "lucide-react";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";
import {
  WORKSPACE_INFORMATION_SECTION_IDS,
  WORKSPACE_INFORMATION_SECTION_LABELS,
  resolveVisibleWorkspaceInformationSections,
  workspaceInformationSectionHasContent,
} from "@/lib/workspace-information-sections";
import { useAppStore } from "@/store/app.store";

export function WorkspaceInformationSectionMenu() {
  const [information, visibility, updateSettings] = useAppStore(
    useShallow((state) => [
      state.workspaceInformation,
      state.settings.infoPanelSectionVisibility,
      state.updateSettings,
    ]),
  );
  const visibleSections = useMemo(
    () =>
      new Set(
        resolveVisibleWorkspaceInformationSections({
          visibility,
          information,
        }),
      ),
    [information, visibility],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-md"
            aria-label="Configure information panel sections"
          />
        }
      >
        <Settings2 className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Visible sections</DropdownMenuLabel>
        {WORKSPACE_INFORMATION_SECTION_IDS.filter(
          (id) => id !== "overview",
        ).map((id) => {
          // Plans live on the filesystem, so the menu cannot cheaply know
          // whether they exist; skip the hint instead of showing a stale one.
          const hasContent =
            id !== "plans" &&
            workspaceInformationSectionHasContent({
              id,
              information,
            });
          return (
            <DropdownMenuCheckboxItem
              key={id}
              checked={visibleSections.has(id)}
              onCheckedChange={(checked) =>
                updateSettings({
                  patch: {
                    infoPanelSectionVisibility: {
                      ...visibility,
                      [id]: checked === true,
                    },
                  },
                })
              }
            >
              <span className="min-w-0 flex-1 truncate">
                {WORKSPACE_INFORMATION_SECTION_LABELS[id]}
              </span>
              {hasContent ? (
                <span className="text-xs text-muted-foreground">Filled</span>
              ) : null}
            </DropdownMenuCheckboxItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            updateSettings({ patch: { infoPanelSectionVisibility: {} } })
          }
        >
          <RotateCcw className="size-4" />
          Reset to defaults
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
