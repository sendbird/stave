import { memo, useMemo, useRef, useState } from "react";
import {
  Check,
  Contrast,
  FolderTree,
  ListChecks,
  Monitor,
  Moon,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge, Slider } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import {
  BUILTIN_CUSTOM_THEMES,
  MAX_USER_THEMES,
  PRESET_THEME_TOKENS,
  THEME_TOKEN_NAMES,
  exportCustomThemeJson,
  listAllCustomThemes,
  parseCustomThemeFile,
  type CustomThemeDefinition,
  type ThemeModeName,
  type ThemeTokenName,
  type SidebarNavView,
  useAppStore,
} from "@/store/app.store";
import {
  ChoiceButtons,
  DraftInput,
  LabeledField,
  SectionStack,
  SettingsCard,
  SwitchField,
} from "../settings-dialog.shared";

function formatThemeTokenLabel(token: ThemeTokenName) {
  return token
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

const SIDEBAR_NAV_VIEW_FIELDS: readonly {
  value: SidebarNavView;
  label: string;
  Icon: typeof FolderTree;
}[] = [
  { value: "projects", label: "Projects", Icon: FolderTree },
  { value: "work-queue", label: "Work queue", Icon: ListChecks },
] as const;

export function ThemeSection() {
  const [themeEditorMode, setThemeEditorMode] =
    useState<ThemeModeName>("light");
  const themeMode = useAppStore((state) => state.settings.themeMode);
  const customThemeId = useAppStore((state) => state.settings.customThemeId);
  const sidebarShowFleetView = useAppStore(
    (state) => state.settings.sidebarShowFleetView,
  );
  const sidebarNavView = useAppStore((state) => state.settings.sidebarNavView);
  const borderBeamEnabled = useAppStore(
    (state) => state.settings.borderBeamEnabled,
  );
  const borderBeamSize = useAppStore((state) => state.settings.borderBeamSize);
  const borderBeamVariant = useAppStore(
    (state) => state.settings.borderBeamVariant,
  );
  const borderBeamStrength = useAppStore(
    (state) => state.settings.borderBeamStrength,
  );
  const userCustomThemes = useAppStore(
    (state) => state.settings.userCustomThemes,
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const installCustomTheme = useAppStore((state) => state.installCustomTheme);
  const removeCustomTheme = useAppStore((state) => state.removeCustomTheme);

  const allThemes = useMemo(
    () => listAllCustomThemes({ userThemes: userCustomThemes }),
    [userCustomThemes],
  );
  const builtinIds = useMemo(
    () => new Set(BUILTIN_CUSTOM_THEMES.map((t) => t.id)),
    [],
  );
  const borderBeamStrengthPercent = Math.round(borderBeamStrength * 100);

  return (
    <>
      <SectionStack>
        <SettingsCard
          title="Appearance"
          description="Choose how the app resolves light and dark mode."
        >
          <div className={sx(styles.appearanceGridButtons)}>
            <Button
              xstyle={styles.modeButton}
              variant={themeMode === "light" ? "primary" : "outline"}
              onClick={() =>
                updateSettings({
                  patch: { themeMode: "light", customThemeId: null },
                })
              }
            >
              <Sun className={sx(styles.iconMd)} />
              Light
            </Button>
            <Button
              xstyle={styles.modeButton}
              variant={themeMode === "dark" ? "primary" : "outline"}
              onClick={() =>
                updateSettings({
                  patch: { themeMode: "dark", customThemeId: null },
                })
              }
            >
              <Moon className={sx(styles.iconMd)} />
              Dark
            </Button>
            <Button
              xstyle={styles.modeButton}
              variant={themeMode === "system" ? "primary" : "outline"}
              onClick={() =>
                updateSettings({
                  patch: { themeMode: "system", customThemeId: null },
                })
              }
            >
              <Monitor className={sx(styles.iconMd)} />
              System
            </Button>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Sidebar"
          description="Choose which workspace navigation surfaces appear in the left sidebar."
        >
          <SwitchField
            title="Fleet View Shortcut"
            description="Show the Fleet View entry in the sidebar header area."
            checked={sidebarShowFleetView}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { sidebarShowFleetView: checked } })
            }
          />
          <LabeledField
            title="Sidebar View"
            description="Projects lists workspaces by where they live; Work queue groups every workspace by what it wants from you. The toggle in the sidebar header changes this too, so the sidebar reopens in whichever view you used last."
          >
            <div className={sx(styles.rowWrapGap2)}>
              {SIDEBAR_NAV_VIEW_FIELDS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={
                    sidebarNavView === option.value ? "primary" : "outline"
                  }
                  size="sm"
                  aria-pressed={sidebarNavView === option.value}
                  onClick={() =>
                    updateSettings({ patch: { sidebarNavView: option.value } })
                  }
                >
                  <option.Icon className={sx(styles.iconMd)} />
                  {option.label}
                </Button>
              ))}
            </div>
          </LabeledField>
        </SettingsCard>

        <SettingsCard
          title="Motion"
          description="Opt-in animated accents. All motion honors your system Reduced Motion preference."
        >
          <SwitchField
            title="Border Beam"
            description="Animate a soft highlight around the prompt input and the active workspace row while a task is streaming. Style presets come from the border-beam library."
            checked={borderBeamEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { borderBeamEnabled: checked } })
            }
          />
          {borderBeamEnabled ? (
            <div className={sx(styles.motionExpanded)}>
              <LabeledField
                title="Beam Size"
                description="Library size preset. Choose between a full border glow, compact controls, or a bottom sweep."
              >
                <ChoiceButtons
                  value={borderBeamSize}
                  columns={2}
                  onChange={(value) =>
                    updateSettings({ patch: { borderBeamSize: value } })
                  }
                  options={[
                    {
                      value: "md",
                      label: "Rotate",
                      description: "Full border glow",
                    },
                    {
                      value: "sm",
                      label: "Compact",
                      description: "Small controls",
                    },
                    {
                      value: "line",
                      label: "Line",
                      description: "Bottom sweep",
                    },
                  ]}
                />
              </LabeledField>
              <LabeledField
                title="Beam Colors"
                description="Library color palette. `Colorful` is a full rainbow sweep; `Ocean` and `Sunset` are cool and warm variants; `Mono` is grayscale."
              >
                <ChoiceButtons
                  value={borderBeamVariant}
                  columns={2}
                  onChange={(value) =>
                    updateSettings({ patch: { borderBeamVariant: value } })
                  }
                  options={[
                    { value: "colorful", label: "Colorful" },
                    { value: "mono", label: "Mono" },
                    { value: "ocean", label: "Ocean" },
                    { value: "sunset", label: "Sunset" },
                  ]}
                />
              </LabeledField>
              <LabeledField
                title="Beam Strength"
                description="Controls the library `strength` prop without changing the wrapped content."
              >
                <div className={sx(styles.sliderRow)}>
                  <Slider
                    aria-label="Border Beam strength"
                    className={sx(styles.flex1)}
                    value={borderBeamStrengthPercent}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={(nextValue) => {
                      updateSettings({
                        patch: { borderBeamStrength: nextValue / 100 },
                      });
                    }}
                  />
                  <Badge variant="outline" className={sx(styles.valueBadge)}>
                    {borderBeamStrengthPercent}%
                  </Badge>
                </div>
              </LabeledField>
            </div>
          ) : null}
        </SettingsCard>

        <SettingsCard
          title="Theme Presets"
          description="Choose a Stave original or a curated palette inspired by popular editor themes. Presets override the base light / dark tokens; manual token tweaks below still take priority."
        >
          <div className={sx(styles.stackMd)}>
            {allThemes.map((theme) => (
              <CustomThemeCard
                key={theme.id}
                theme={theme}
                isActive={customThemeId === theme.id}
                isBuiltin={builtinIds.has(theme.id)}
                onSelect={() =>
                  updateSettings({ patch: { customThemeId: theme.id } })
                }
                onDeselect={() =>
                  updateSettings({ patch: { customThemeId: null } })
                }
                onRemove={
                  builtinIds.has(theme.id)
                    ? undefined
                    : () => removeCustomTheme({ themeId: theme.id })
                }
                onExport={() => {
                  const json = exportCustomThemeJson({ theme });
                  const blob = new Blob([json], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${theme.id}.theme.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              />
            ))}
          </div>

          <ThemeImportButton
            existingIds={allThemes.map((t) => t.id)}
            userThemeCount={userCustomThemes.length}
            onInstall={(theme) => {
              const result = installCustomTheme({ theme });
              if (result.ok) {
                updateSettings({ patch: { customThemeId: theme.id } });
              }
              return result;
            }}
          />
        </SettingsCard>

        <SettingsCard
          title="Design Tokens"
          description="These are Stave's base light and dark tokens. Custom presets layer on top, and manual overrides below still win."
        >
          <div className={sx(styles.tokenToolbar)}>
            <div className={sx(styles.rowCenter)}>
              <Button
                size="sm"
                variant={themeEditorMode === "light" ? "primary" : "outline"}
                onClick={() => setThemeEditorMode("light")}
              >
                Light Tokens
              </Button>
              <Button
                size="sm"
                variant={themeEditorMode === "dark" ? "primary" : "outline"}
                onClick={() => setThemeEditorMode("dark")}
              >
                Dark Tokens
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const themeOverrides =
                  useAppStore.getState().settings.themeOverrides;
                updateSettings({
                  patch: {
                    themeOverrides: {
                      ...themeOverrides,
                      [themeEditorMode]: {},
                    },
                  },
                });
              }}
            >
              Reset {themeEditorMode}
            </Button>
          </div>

          <div className={sx(styles.stackMd)}>
            {THEME_TOKEN_NAMES.map((token) => (
              <ThemeTokenRow
                key={`${themeEditorMode}-${token}`}
                token={token}
                themeEditorMode={themeEditorMode}
              />
            ))}
          </div>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

const CustomThemeCard = memo(function CustomThemeCard(args: {
  theme: CustomThemeDefinition;
  isActive: boolean;
  isBuiltin: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  onRemove?: () => void;
  onExport?: () => void;
}) {
  const { theme, isActive, isBuiltin } = args;
  const previewTokens = [
    "background",
    "foreground",
    "primary",
    "accent",
    "destructive",
    "border",
    "success",
    "warning",
  ] as const;
  const previewColors = previewTokens
    .map((t) => theme.tokens[t])
    .filter(Boolean);

  return (
    <div className={sx(styles.themeCard, isActive && styles.themeCardActive)}>
      {/* main clickable area */}
      <Button
        layout="host"
        type="button"
        xstyle={styles.themeCardButton}
        onClick={isActive ? args.onDeselect : args.onSelect}
      >
        <div className={sx(styles.rowCenter)}>
          <Contrast className={sx(styles.audioIcon)} />
          <p className={sx(styles.themeCardName)}>{theme.name}</p>
          <Badge variant="outline" className={sx(styles.microBadge)}>
            {theme.baseMode}
          </Badge>
          {!isBuiltin && (
            <Badge variant="secondary" className={sx(styles.microBadge)}>
              User
            </Badge>
          )}
          {isActive && (
            <span className={sx(styles.activeMark)}>
              <Check className={sx(styles.iconSm)} />
              Active
            </span>
          )}
        </div>
        <p className={sx(styles.themeDescription)}>{theme.description}</p>
        {theme.author && (
          <p className={sx(styles.themeAuthor)}>
            by {theme.author}
            {theme.version ? ` \u00B7 v${theme.version}` : ""}
          </p>
        )}
      </Button>

      {/* right column: swatches + action buttons */}
      <div className={sx(styles.themeRightCol)}>
        {/* colour swatch strip */}
        <div className={sx(styles.swatchStrip)}>
          {previewColors.map((color, i) => (
            <span
              key={i}
              className={sx(styles.swatchDot)}
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
          ))}
        </div>

        {/* action buttons */}
        <div className={sx(styles.cardActionRow)}>
          {args.onExport && (
            <Button
              size="sm"
              variant="quiet"
              xstyle={styles.smallGhostButton}
              onClick={(e) => {
                e.stopPropagation();
                args.onExport?.();
              }}
            >
              <Upload className={sx(styles.iconXs)} />
              Export
            </Button>
          )}
          {args.onRemove && (
            <Button
              size="sm"
              variant="quiet"
              xstyle={styles.smallGhostButtonDanger}
              onClick={(e) => {
                e.stopPropagation();
                args.onRemove?.();
              }}
            >
              <Trash2 className={sx(styles.iconXs)} />
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});

function ThemeImportButton(args: {
  existingIds: string[];
  userThemeCount: number;
  onInstall: (theme: CustomThemeDefinition) => { ok: boolean; error?: string };
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset so the same file can be re-selected.
    e.target.value = "";

    if (file.size > 256 * 1024) {
      setImportError("File too large (max 256 KB).");
      return;
    }

    const text = await file.text();
    const result = parseCustomThemeFile({
      text,
      existingIds: args.existingIds,
    });
    if (!result.ok) {
      setImportError(result.errors?.join(" ") ?? "Unknown validation error.");
      return;
    }

    const installResult = args.onInstall(result.theme!);
    if (!installResult.ok) {
      setImportError(installResult.error ?? "Failed to install theme.");
    }
  };

  return (
    <div className={sx(styles.importGrid)}>
      <div className={sx(styles.importRow)}>
        <Button
          size="sm"
          variant="outline"
          xstyle={styles.importButton}
          disabled={args.userThemeCount >= MAX_USER_THEMES}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className={sx(styles.iconSm)} />
          Import Theme JSON
        </Button>
        <span className={sx(styles.captionMuted)}>
          {args.userThemeCount} / {MAX_USER_THEMES} user themes
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className={sx(styles.hiddenInput)}
        onChange={handleFileChange}
      />

      {importError && (
        <p className={sx(styles.importErrorBox)}>{importError}</p>
      )}

      <p className={sx(styles.importHelp)}>
        Drop a{" "}
        <code className={sx(styles.code)}>.theme.json</code> file to install a
        community theme. The JSON must include{" "}
        <code className={sx(styles.code)}>id</code>,{" "}
        <code className={sx(styles.code)}>name</code>,{" "}
        <code className={sx(styles.code)}>baseMode</code>, and a{" "}
        <code className={sx(styles.code)}>tokens</code> map.
      </p>
    </div>
  );
}

const ThemeTokenRow = memo(function ThemeTokenRow(args: {
  token: ThemeTokenName;
  themeEditorMode: ThemeModeName;
}) {
  const updateSettings = useAppStore((state) => state.updateSettings);
  const overrideValue = useAppStore(
    (state) =>
      state.settings.themeOverrides[args.themeEditorMode][args.token] ?? "",
  );
  const effectiveValue =
    overrideValue || PRESET_THEME_TOKENS[args.themeEditorMode][args.token];

  return (
    <div className={sx(styles.tokenRow)}>
      <div>
        <p className={sx(styles.tokenName)}>
          {formatThemeTokenLabel(args.token)}
        </p>
        <p className={sx(styles.tokenPreset)}>
          Preset: {PRESET_THEME_TOKENS[args.themeEditorMode][args.token]}
        </p>
      </div>
      <span
        className={sx(styles.tokenSwatch)}
        style={{ backgroundColor: effectiveValue }}
        aria-hidden="true"
      />
      <DraftInput
        xstyle={styles.input40Mono}
        value={overrideValue}
        placeholder={PRESET_THEME_TOKENS[args.themeEditorMode][args.token]}
        onCommit={(nextValue) => {
          const themeOverrides = useAppStore.getState().settings.themeOverrides;
          updateSettings({
            patch: {
              themeOverrides: {
                ...themeOverrides,
                [args.themeEditorMode]: {
                  ...themeOverrides[args.themeEditorMode],
                  [args.token]: nextValue,
                },
              },
            },
          });
        }}
      />
      <Button
        size="sm"
        variant="quiet"
        onClick={() => {
          const themeOverrides = useAppStore.getState().settings.themeOverrides;
          updateSettings({
            patch: {
              themeOverrides: {
                ...themeOverrides,
                [args.themeEditorMode]: {
                  ...themeOverrides[args.themeEditorMode],
                  [args.token]: "",
                },
              },
            },
          });
        }}
      >
        Reset
      </Button>
    </div>
  );
});
