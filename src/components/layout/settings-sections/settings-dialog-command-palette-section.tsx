import { useMemo } from "react";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import { type ModelSelectorOption } from "@/components/ai-elements/model-selector";
import { useSettingsModelSelectorOptions } from "@/components/layout/settings-dialog-model-fields";
import {
  COMMAND_PALETTE_GROUP_LABELS,
  getCommandPaletteCoreCommands,
} from "@/components/layout/command-palette-registry";
import { useShallow } from "zustand/react/shallow";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import {
  APP_SHORTCUT_DEFINITIONS,
  APP_SHORTCUT_KEY_OPTIONS,
  DEFAULT_APP_SHORTCUT_KEYS,
  assignAppShortcutKey,
  buildAppShortcutSequences,
  createEmptyAppShortcutKeys,
  formatAppShortcutLabel,
  normalizeAppShortcutKeys,
  type AppShortcutCommandId,
} from "@/lib/app-shortcuts";
import {
  DEFAULT_MODEL_SHORTCUT_EFFORTS,
  DEFAULT_MODEL_SHORTCUT_KEYS,
  describeModelShortcutKey,
  listModelShortcutEffortOptions,
  MODEL_SHORTCUT_DEFAULT_EFFORT_VALUE,
  MODEL_SHORTCUT_SLOT_LABELS,
  normalizeModelShortcutEfforts,
  normalizeModelShortcutKeys,
  resolveModelShortcutEffort,
  type ModelShortcutEffort,
} from "@/lib/providers/model-shortcuts";
import {
  formatPromptCommentShortcutLabel,
  normalizePromptCommentShortcut,
  PROMPT_COMMENT_SHORTCUT_OPTIONS,
} from "@/lib/prompt-comment-shortcuts";
import {
  formatVisualCommentShortcutLabel,
  normalizeVisualCommentShortcut,
  VISUAL_COMMENT_SHORTCUT_OPTIONS,
} from "@/lib/visual-comment-shortcuts";
import { useAppStore } from "@/store/app.store";
import { WorkspaceShortcutChip } from "../WorkspaceShortcutChip";
import {
  LabeledField,
  SectionStack,
  SettingsCard,
  SwitchField,
} from "../settings-dialog.shared";

const MODEL_SHORTCUT_PROVIDER_IDS = [
  "claude-code",
  "codex",
  "cursor",
  "kiro",
] as const;

const UNASSIGNED_APP_SHORTCUT_VALUE = "__shortcut_unassigned__";

const UNASSIGNED_MODEL_SHORTCUT_VALUE = "__unassigned__";

function ModelShortcutOptionLabel(args: { option: ModelSelectorOption }) {
  const { option } = args;
  return (
    <span className={sx(styles.modelOptionLabel)}>
      <ModelIcon
        providerId={option.providerId}
        model={option.model}
        className={sx(styles.modelOptionGlyph)}
      />
      <span className={sx(styles.truncate)}>
        {getProviderLabel({ providerId: option.providerId, variant: "full" })} ·{" "}
        {option.label}
      </span>
    </span>
  );
}

export function CommandPaletteSection() {
  const [
    commandPaletteShowRecent,
    commandPalettePinnedCommandIds,
    commandPaletteHiddenCommandIds,
    commandPaletteRecentCommandIds,
    appShortcutKeys,
    modelShortcutKeys,
    modelShortcutEfforts,
    promptCommentShortcut,
    visualCommentShortcut,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.commandPaletteShowRecent,
          state.settings.commandPalettePinnedCommandIds,
          state.settings.commandPaletteHiddenCommandIds,
          state.settings.commandPaletteRecentCommandIds,
          state.settings.appShortcutKeys,
          state.settings.modelShortcutKeys,
          state.settings.modelShortcutEfforts,
          state.settings.promptCommentShortcut,
          state.settings.visualCommentShortcut,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const normalizedAppShortcutKeys = useMemo(
    () => normalizeAppShortcutKeys(appShortcutKeys),
    [appShortcutKeys],
  );
  const commands = useMemo(
    () =>
      getCommandPaletteCoreCommands({
        appShortcutKeys: normalizedAppShortcutKeys,
      }),
    [normalizedAppShortcutKeys],
  );
  const normalizedModelShortcutKeys = useMemo(
    () => normalizeModelShortcutKeys(modelShortcutKeys),
    [modelShortcutKeys],
  );
  const normalizedModelShortcutEfforts = useMemo(
    () => normalizeModelShortcutEfforts(modelShortcutEfforts),
    [modelShortcutEfforts],
  );
  const normalizedPromptCommentShortcut = normalizePromptCommentShortcut(
    promptCommentShortcut,
  );
  const normalizedVisualCommentShortcut = normalizeVisualCommentShortcut(
    visualCommentShortcut,
  );
  const {
    options: modelShortcutOptions,
    recommendedOptions: recommendedModelShortcutOptions,
  } = useSettingsModelSelectorOptions({
    providerIds: MODEL_SHORTCUT_PROVIDER_IDS,
  });
  const recommendedModelShortcutKeySet = useMemo(
    () => new Set(recommendedModelShortcutOptions.map((option) => option.key)),
    [recommendedModelShortcutOptions],
  );
  const additionalModelShortcutOptions = useMemo(
    () =>
      modelShortcutOptions.filter(
        (option) => !recommendedModelShortcutKeySet.has(option.key),
      ),
    [modelShortcutOptions, recommendedModelShortcutKeySet],
  );

  function togglePinnedCommand(commandId: string) {
    const isPinned = commandPalettePinnedCommandIds.includes(commandId);
    updateSettings({
      patch: {
        commandPalettePinnedCommandIds: isPinned
          ? commandPalettePinnedCommandIds.filter((id) => id !== commandId)
          : [...commandPalettePinnedCommandIds, commandId],
        commandPaletteHiddenCommandIds: commandPaletteHiddenCommandIds.filter(
          (id) => id !== commandId,
        ),
      },
    });
  }

  function toggleHiddenCommand(commandId: string) {
    const isHidden = commandPaletteHiddenCommandIds.includes(commandId);
    updateSettings({
      patch: {
        commandPaletteHiddenCommandIds: isHidden
          ? commandPaletteHiddenCommandIds.filter((id) => id !== commandId)
          : [...commandPaletteHiddenCommandIds, commandId],
        commandPalettePinnedCommandIds: commandPalettePinnedCommandIds.filter(
          (id) => id !== commandId,
        ),
        commandPaletteRecentCommandIds: isHidden
          ? commandPaletteRecentCommandIds
          : commandPaletteRecentCommandIds.filter((id) => id !== commandId),
      },
    });
  }

  function updateModelShortcutSlot(slotIndex: number, nextShortcutKey: string) {
    const nextKeys = [...normalizedModelShortcutKeys];
    const nextEfforts = [...normalizedModelShortcutEfforts];
    nextKeys[slotIndex] = nextShortcutKey;
    nextEfforts[slotIndex] =
      resolveModelShortcutEffort({
        shortcutKey: nextShortcutKey,
        effort: nextEfforts[slotIndex],
      }) ?? "";
    updateSettings({
      patch: {
        modelShortcutKeys: nextKeys,
        modelShortcutEfforts: nextEfforts,
      },
    });
  }

  function updateModelShortcutEffort(
    slotIndex: number,
    nextEffort: ModelShortcutEffort,
  ) {
    const nextEfforts = [...normalizedModelShortcutEfforts];
    nextEfforts[slotIndex] = nextEffort;
    updateSettings({
      patch: {
        modelShortcutEfforts: nextEfforts,
      },
    });
  }

  function updateAppShortcut(actionId: AppShortcutCommandId, nextKey: string) {
    updateSettings({
      patch: {
        appShortcutKeys: assignAppShortcutKey({
          actionId,
          shortcutKeys: normalizedAppShortcutKeys,
          nextKey,
        }),
      },
    });
  }

  return (
    <>
      <SectionStack>
        <SettingsCard
          title="Behavior"
          description="Pinned commands appear first, hidden commands stay out of the palette, and recent history can be shown as its own section."
        >
          <SwitchField
            title="Recent Commands"
            checked={commandPaletteShowRecent}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { commandPaletteShowRecent: checked } })
            }
          />
          <div className={sx(styles.rowWrapGap2)}>
            <Button
              variant="outline"
              onClick={() =>
                updateSettings({
                  patch: { commandPaletteRecentCommandIds: [] },
                })
              }
              disabled={commandPaletteRecentCommandIds.length === 0}
            >
              Clear Recent History
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                updateSettings({
                  patch: {
                    commandPalettePinnedCommandIds: [],
                    commandPaletteHiddenCommandIds: [],
                    commandPaletteRecentCommandIds: [],
                    commandPaletteShowRecent: true,
                  },
                })
              }
              disabled={
                commandPalettePinnedCommandIds.length === 0 &&
                commandPaletteHiddenCommandIds.length === 0 &&
                commandPaletteRecentCommandIds.length === 0 &&
                commandPaletteShowRecent
              }
            >
              Reset Palette Settings
            </Button>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Shell Shortcut Chords"
          description="Keep panel and navigation shortcuts on a single Cmd/Ctrl+K prefix so they do not collide with editor and IDE bindings."
          titleAccessory={<Badge variant="secondary">Cmd/Ctrl+K</Badge>}
        >
          <div className={sx(styles.rowWrapGap2)}>
            <Button
              variant="outline"
              onClick={() =>
                updateSettings({
                  patch: {
                    appShortcutKeys: { ...DEFAULT_APP_SHORTCUT_KEYS },
                  },
                })
              }
              disabled={APP_SHORTCUT_DEFINITIONS.every(
                (definition) =>
                  normalizedAppShortcutKeys[definition.commandId] ===
                  definition.defaultKey,
              )}
            >
              Reset Default Chords
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                updateSettings({
                  patch: {
                    appShortcutKeys: createEmptyAppShortcutKeys(),
                  },
                })
              }
              disabled={APP_SHORTCUT_DEFINITIONS.every(
                (definition) =>
                  normalizedAppShortcutKeys[definition.commandId].length === 0,
              )}
            >
              Clear All Chords
            </Button>
          </div>
          <p className={sx(styles.captionMuted)}>
            Assigning a key moves it off any conflicting shell command
            automatically.
          </p>
          <div className={sx(styles.spaceY25)}>
            {APP_SHORTCUT_DEFINITIONS.map((definition) => {
              const selectedKey =
                normalizedAppShortcutKeys[definition.commandId] ?? "";
              const currentValue = selectedKey || UNASSIGNED_APP_SHORTCUT_VALUE;
              const currentShortcutLabel =
                formatAppShortcutLabel({
                  actionId: definition.commandId,
                  modifierLabel: "Cmd/Ctrl",
                  shortcutKeys: normalizedAppShortcutKeys,
                }) ?? "Disabled";
              const shortcutSequences = buildAppShortcutSequences({
                actionId: definition.commandId,
                modifierLabel: "Cmd/Ctrl",
                shortcutKeys: normalizedAppShortcutKeys,
              });

              return (
                <div
                  key={definition.commandId}
                  className={sx(styles.shortcutCard)}
                >
                  <div className={sx(styles.shortcutRow)}>
                    <div className={sx(styles.shortcutLead)}>
                      <div className={sx(styles.rowWrapGap2)}>
                        {shortcutSequences.map((sequence, index) => (
                          <div
                            key={`${definition.commandId}-${sequence.join("-")}`}
                            className={sx(styles.rowCenter)}
                          >
                            {index > 0 ? (
                              <span className={sx(styles.seqThen)}>
                                then
                              </span>
                            ) : null}
                            <Badge variant="secondary">
                              {sequence.join(" + ")}
                            </Badge>
                          </div>
                        ))}
                        <p className={sx(styles.commandTitle)}>
                          {definition.title}
                        </p>
                      </div>
                      <p className={sx(styles.captionMuted)}>
                        {definition.description}
                      </p>
                    </div>
                    <div className={sx(styles.shortcutMain)}>
                      <Select
                        value={currentValue}
                        onValueChange={(value) =>
                          updateAppShortcut(
                            definition.commandId,
                            value === UNASSIGNED_APP_SHORTCUT_VALUE
                              ? ""
                              : value,
                          )
                        }
                      >
                        <SelectTrigger className={sx(styles.selectTriggerPlain)}>
                          <SelectValue placeholder="Disabled" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Shortcut State</SelectLabel>
                            <SelectItem value={UNASSIGNED_APP_SHORTCUT_VALUE}>
                              Disabled
                            </SelectItem>
                          </SelectGroup>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>Assignable Keys</SelectLabel>
                            {APP_SHORTCUT_KEY_OPTIONS.map((option) => (
                              <SelectItem key={option.key} value={option.key}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <p className={sx(styles.captionMuted)}>
                        Current chord: {currentShortcutLabel}.
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsCard>

        <SettingsCard
          title="Composer Shortcut"
          description="Choose the shortcut that stages the current prompt text as a comment instead of sending it."
          titleAccessory={
            <Badge variant="secondary">
              {formatPromptCommentShortcutLabel(
                normalizedPromptCommentShortcut,
              )}
            </Badge>
          }
        >
          <LabeledField
            title="Stage Comment"
            description="The staged comment appears under the composer and is merged into the next sent prompt."
          >
            <Select
              value={normalizedPromptCommentShortcut}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    promptCommentShortcut:
                      normalizePromptCommentShortcut(value),
                  },
                })
              }
            >
              <SelectTrigger className={sx(styles.selectTriggerPlain)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Shortcut</SelectLabel>
                  {PROMPT_COMMENT_SHORTCUT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </LabeledField>
        </SettingsCard>

        <SettingsCard
          title="Lens Shortcut"
          description="Choose the shortcut that toggles Lens visual comment mode."
          titleAccessory={
            <Badge variant="secondary">
              {formatVisualCommentShortcutLabel(
                normalizedVisualCommentShortcut,
              )}
            </Badge>
          }
        >
          <LabeledField
            title="Visual Comment"
            description="The shortcut turns visual comment picking on or off while Lens is available."
          >
            <Select
              value={normalizedVisualCommentShortcut}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    visualCommentShortcut:
                      normalizeVisualCommentShortcut(value),
                  },
                })
              }
            >
              <SelectTrigger className={sx(styles.selectTriggerPlain)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Shortcut</SelectLabel>
                  {VISUAL_COMMENT_SHORTCUT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </LabeledField>
        </SettingsCard>

        <SettingsCard
          title="Model Shortcuts"
          description="Map Alt+1..0 to prompt models and optional effort overrides. These shortcuts switch the active task provider and draft model immediately."
          titleAccessory={<Badge variant="secondary">Alt+1..0</Badge>}
        >
          <div className={sx(styles.rowWrapGap2)}>
            <Button
              variant="outline"
              onClick={() =>
                updateSettings({
                  patch: {
                    modelShortcutKeys: [...DEFAULT_MODEL_SHORTCUT_KEYS],
                    modelShortcutEfforts: [...DEFAULT_MODEL_SHORTCUT_EFFORTS],
                  },
                })
              }
              disabled={
                normalizedModelShortcutKeys.every(
                  (value, index) =>
                    value === (DEFAULT_MODEL_SHORTCUT_KEYS[index] ?? ""),
                ) &&
                normalizedModelShortcutEfforts.every(
                  (value, index) =>
                    value === (DEFAULT_MODEL_SHORTCUT_EFFORTS[index] ?? ""),
                )
              }
            >
              Reset Default Shortcuts
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                updateSettings({
                  patch: {
                    modelShortcutKeys: MODEL_SHORTCUT_SLOT_LABELS.map(() => ""),
                    modelShortcutEfforts: [...DEFAULT_MODEL_SHORTCUT_EFFORTS],
                  },
                })
              }
              disabled={
                normalizedModelShortcutKeys.every(
                  (value) => value.length === 0,
                ) &&
                normalizedModelShortcutEfforts.every(
                  (value) => value.length === 0,
                )
              }
            >
              Clear All Shortcuts
            </Button>
          </div>
          <div className={sx(styles.spaceY25)}>
            {MODEL_SHORTCUT_SLOT_LABELS.map((slotLabel, slotIndex) => {
              const selectedShortcutKey =
                normalizedModelShortcutKeys[slotIndex] ?? "";
              const selectedShortcutDetails = describeModelShortcutKey({
                shortcutKey: selectedShortcutKey,
              });
              const defaultShortcutDetails = describeModelShortcutKey({
                shortcutKey: DEFAULT_MODEL_SHORTCUT_KEYS[slotIndex] ?? "",
              });
              const currentValue = modelShortcutOptions.some(
                (option) => option.key === selectedShortcutKey,
              )
                ? selectedShortcutKey
                : UNASSIGNED_MODEL_SHORTCUT_VALUE;
              const effortOptions = listModelShortcutEffortOptions({
                shortcutKey: selectedShortcutKey,
              });
              const selectedShortcutEffort =
                normalizedModelShortcutEfforts[slotIndex] ?? "";
              const currentEffortValue = effortOptions.some(
                (option) => option.value === selectedShortcutEffort,
              )
                ? selectedShortcutEffort
                : MODEL_SHORTCUT_DEFAULT_EFFORT_VALUE;
              const selectedEffortLabel = effortOptions.find(
                (option) => option.value === selectedShortcutEffort,
              )?.label;
              const selectedEffortDescription = selectedEffortLabel
                ? `${selectedEffortLabel} effort`
                : "the current effort setting";

              return (
                <div
                  key={slotLabel}
                  className={sx(styles.shortcutCard)}
                >
                  <div className={sx(styles.shortcutRow)}>
                    <div className={sx(styles.shortcutLeadNarrow)}>
                      <div className={sx(styles.rowCenter)}>
                        <WorkspaceShortcutChip
                          modifier="Alt"
                          label={slotLabel}
                        />
                        <p className={sx(styles.commandTitle)}>
                          Model Slot {slotLabel}
                        </p>
                      </div>
                      <p className={sx(styles.captionMuted)}>
                        Default:{" "}
                        {defaultShortcutDetails?.modelLabel ?? "Unassigned"}
                      </p>
                    </div>
                    <div className={sx(styles.shortcutMain)}>
                      <Select
                        value={currentValue}
                        onValueChange={(value) =>
                          updateModelShortcutSlot(
                            slotIndex,
                            value === UNASSIGNED_MODEL_SHORTCUT_VALUE
                              ? ""
                              : value,
                          )
                        }
                      >
                        <SelectTrigger className={sx(styles.selectTriggerPlain)}>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent className={sx(styles.selectContentTall)}>
                          <SelectGroup>
                            <SelectLabel>Shortcut State</SelectLabel>
                            <SelectItem value={UNASSIGNED_MODEL_SHORTCUT_VALUE}>
                              Unassigned
                            </SelectItem>
                          </SelectGroup>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>Recommended</SelectLabel>
                            {recommendedModelShortcutOptions.map((option) => (
                              <SelectItem key={option.key} value={option.key}>
                                <ModelShortcutOptionLabel option={option} />
                              </SelectItem>
                            ))}
                          </SelectGroup>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>All Models</SelectLabel>
                            {additionalModelShortcutOptions.map((option) => (
                              <SelectItem key={option.key} value={option.key}>
                                <ModelShortcutOptionLabel option={option} />
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <div className={sx(styles.rowCenter)}>
                        <span className={sx(styles.effortLabel)}>
                          Effort
                        </span>
                        <Select
                          value={currentEffortValue}
                          disabled={!selectedShortcutDetails}
                          onValueChange={(value) =>
                            updateModelShortcutEffort(
                              slotIndex,
                              value === MODEL_SHORTCUT_DEFAULT_EFFORT_VALUE
                                ? ""
                                : (value as ModelShortcutEffort),
                            )
                          }
                        >
                          <SelectTrigger
                            className={sx(styles.selectTriggerEffort)}
                            aria-label={`Effort for Model Slot ${slotLabel}`}
                          >
                            <SelectValue placeholder="Use current effort" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem
                              value={MODEL_SHORTCUT_DEFAULT_EFFORT_VALUE}
                            >
                              Use current effort
                            </SelectItem>
                            {effortOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <p className={sx(styles.captionMuted)}>
                        {selectedShortcutDetails
                          ? `Currently selects ${selectedShortcutDetails.modelLabel} on ${selectedShortcutDetails.providerLabel} with ${selectedEffortDescription}.`
                          : "No model assigned. The shortcut stays inactive until you set one."}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsCard>

        <SettingsCard
          title="Command Visibility"
          description="Pin the core actions you use most, or hide the ones you never want in the global palette."
        >
          <div className={sx(styles.spaceY2)}>
            {commands.map((command) => {
              const isPinned = commandPalettePinnedCommandIds.includes(
                command.id,
              );
              const isHidden = commandPaletteHiddenCommandIds.includes(
                command.id,
              );

              return (
                <div
                  key={command.id}
                  className={sx(styles.shortcutCard)}
                >
                  <div className={sx(styles.commandRow)}>
                    <div className={sx(styles.commandInfo)}>
                      <div className={sx(styles.rowWrapGap2)}>
                        <p className={sx(styles.mediumText)}>
                          {command.title}
                        </p>
                        <Badge variant="outline">
                          {COMMAND_PALETTE_GROUP_LABELS[command.group]}
                        </Badge>
                        {command.shortcut ? (
                          <Badge variant="secondary">{command.shortcut}</Badge>
                        ) : null}
                        {isPinned ? <Badge>Pinned</Badge> : null}
                        {isHidden ? (
                          <Badge variant="destructive">Hidden</Badge>
                        ) : null}
                      </div>
                      <p className={sx(styles.mutedBody)}>
                        {command.description}
                      </p>
                      <p className={sx(styles.monoMicroMuted)}>
                        {command.id}
                      </p>
                    </div>
                    <div className={sx(styles.commandActions)}>
                      <Button
                        variant={isPinned ? "primary" : "outline"}
                        size="sm"
                        onClick={() => togglePinnedCommand(command.id)}
                      >
                        {isPinned ? "Unpin" : "Pin"}
                      </Button>
                      <Button
                        variant={isHidden ? "primary" : "outline"}
                        size="sm"
                        onClick={() => toggleHiddenCommand(command.id)}
                      >
                        {isHidden ? "Show" : "Hide"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsCard>

        <SettingsCard
          title="Programmatic Contributors"
          description="The palette is backed by a registry so internal modules can add commands without coupling to the dialog component."
        >
          <p className={sx(styles.contributorCopy)}>
            Use <code>registerCommandPaletteContributor()</code> to inject
            additional commands. Core Stave commands are customizable here;
            dynamic workspace/task entries and future contributed commands
            inherit the same execution surface automatically.
          </p>
        </SettingsCard>
      </SectionStack>
    </>
  );
}
