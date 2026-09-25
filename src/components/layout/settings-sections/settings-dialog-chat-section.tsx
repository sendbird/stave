import { ComposerControlPlacementList } from "@/components/ai-elements/prompt-input-control-menu";
import { useShallow } from "zustand/react/shallow";
import { Badge, Slider } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import {
  formatSteerQueueEnterActionLabel,
  normalizeSteerQueueEnterAction,
  STEER_QUEUE_ENTER_ACTION_OPTIONS,
} from "@/lib/steer-queue-shortcuts";
import {
  normalizeComposerLayoutMode,
  type ComposerLayoutMode,
} from "@/store/app-settings";
import { useAppStore } from "@/store/app.store";
import {
  ChoiceButtons,
  DraftInput,
  LabeledField,
  SectionStack,
  SelectField,
  SettingsCard,
  SwitchField,
} from "../settings-dialog.shared";

export function ChatSection() {
  const [
    chatStreamingEnabled,
    messageFontSize,
    messageCodeFontSize,
    messageFontFamily,
    messageMonoFontFamily,
    messageKoreanFontFamily,
    infoPanelScale,
    reasoningExpansionMode,
    showInterimMessages,
    showConversationTurnRail,
    turnActivityExpandedByDefault,
    composerLayout,
    composerControlPlacements,
    steerQueueEnterAction,
    midTurnSteeringEnabled,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.chatStreamingEnabled,
          state.settings.messageFontSize,
          state.settings.messageCodeFontSize,
          state.settings.messageFontFamily,
          state.settings.messageMonoFontFamily,
          state.settings.messageKoreanFontFamily,
          state.settings.infoPanelScale,
          state.settings.reasoningExpansionMode,
          state.settings.showInterimMessages,
          state.settings.showConversationTurnRail,
          state.settings.turnActivityExpandedByDefault,
          state.settings.composerLayout,
          state.settings.composerControlPlacements,
          state.settings.steerQueueEnterAction,
          state.settings.midTurnSteeringEnabled,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const normalizedSteerQueueEnterAction = normalizeSteerQueueEnterAction(
    steerQueueEnterAction,
  );

  return (
    <>
      <SectionStack>
        <SettingsCard
          title="Typography"
          description="Font sizes and families applied to the shared chat surface."
        >
          <LabeledField
            title="Message Font Size"
            description="Prose font size for chat messages. Line height scales proportionally."
          >
            <div className={sx(styles.sliderRow)}>
              <Slider
                aria-label="Message font size"
                min={12}
                max={24}
                step={1}
                value={messageFontSize}
                onValueChange={(value) =>
                  updateSettings({ patch: { messageFontSize: value } })
                }
                className={sx(styles.flex1)}
              />
              <span className={sx(styles.valueReadout)}>
                {messageFontSize}px
              </span>
            </div>
          </LabeledField>
          <LabeledField
            title="Code Font Size"
            description="Font size for inline code and code blocks in chat messages."
          >
            <div className={sx(styles.sliderRow)}>
              <Slider
                aria-label="Code font size"
                min={10}
                max={20}
                step={1}
                value={messageCodeFontSize}
                onValueChange={(value) =>
                  updateSettings({ patch: { messageCodeFontSize: value } })
                }
                className={sx(styles.flex1)}
              />
              <span className={sx(styles.valueReadout)}>
                {messageCodeFontSize}px
              </span>
            </div>
          </LabeledField>
          <LabeledField
            title="Font Family"
            description="Base sans-serif font for the app UI and chat messages. Pick a preset or type any installed family. Falls back to the Korean font, then sans-serif."
          >
            <div className={sx(styles.spaceY2)}>
              <ChoiceButtons
                value={messageFontFamily}
                onChange={(value) =>
                  updateSettings({ patch: { messageFontFamily: value } })
                }
                options={[
                  { value: "Geist Variable", label: "Geist" },
                  { value: "Inter Variable", label: "Inter" },
                ]}
              />
              <DraftInput
                value={messageFontFamily}
                xstyle={styles.input9}
                onCommit={(nextValue) =>
                  updateSettings({ patch: { messageFontFamily: nextValue } })
                }
              />
            </div>
          </LabeledField>
          <LabeledField
            title="Mono Font Family"
            description="Monospace font for inline code and code blocks in messages."
          >
            <DraftInput
              value={messageMonoFontFamily}
              xstyle={styles.input9}
              onCommit={(nextValue) =>
                updateSettings({ patch: { messageMonoFontFamily: nextValue } })
              }
            />
          </LabeledField>
          <LabeledField
            title="Korean Font Family"
            description="Fallback font for Korean (CJK) text in messages. Pretendard Variable is loaded by default."
          >
            <DraftInput
              value={messageKoreanFontFamily}
              xstyle={styles.input9}
              onCommit={(nextValue) =>
                updateSettings({
                  patch: { messageKoreanFontFamily: nextValue },
                })
              }
            />
          </LabeledField>
          <LabeledField
            title="Information Panel Scale"
            description="Zoom level for the workspace information panel. Affects text, icons, buttons, and spacing uniformly."
          >
            <div className={sx(styles.sliderRow)}>
              <Slider
                aria-label="Information panel scale"
                min={80}
                max={130}
                step={5}
                value={Math.round(infoPanelScale * 100)}
                onValueChange={(value) =>
                  updateSettings({
                    patch: { infoPanelScale: value / 100 },
                  })
                }
                className={sx(styles.flex1)}
              />
              <span className={sx(styles.valueReadout)}>
                {Math.round(infoPanelScale * 100)}%
              </span>
            </div>
          </LabeledField>
        </SettingsCard>
        <SettingsCard
          title="Behavior"
          description="Toggle chat features and display preferences."
        >
          <SwitchField
            title="Streaming UI"
            checked={chatStreamingEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { chatStreamingEnabled: checked } })
            }
          />
          <LabeledField
            title="Reasoning Expansion"
            description="Auto expands the reasoning trace while a turn is streaming, then collapses it again. Manual keeps it collapsed until you open it."
          >
            <ChoiceButtons<"auto" | "manual">
              value={reasoningExpansionMode}
              onChange={(value) =>
                updateSettings({ patch: { reasoningExpansionMode: value } })
              }
              options={[
                { value: "auto", label: "Auto" },
                { value: "manual", label: "Manual" },
              ]}
            />
          </LabeledField>
          <SwitchField
            title="Show Interim Messages"
            description="Show pre-final assistant text segments between execution steps. Hidden by default to keep the final response cleaner."
            checked={showInterimMessages}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { showInterimMessages: checked } })
            }
          />
          <SwitchField
            title="Show Conversation Turn Rail"
            description="Show the turn navigator on the right side of conversations with multiple eligible responses."
            checked={showConversationTurnRail}
            onCheckedChange={(checked) =>
              updateSettings({
                patch: { showConversationTurnRail: checked },
              })
            }
          />
          <SwitchField
            title="Expand Turn Activity"
            description="Keep the turn activity shelf above the prompt input expanded while a turn runs, so agents, tools, and todos stay visible. Turn this off to show only the headline row."
            checked={turnActivityExpandedByDefault}
            onCheckedChange={(checked) =>
              updateSettings({
                patch: { turnActivityExpandedByDefault: checked },
              })
            }
          />
        </SettingsCard>
        <SettingsCard
          title="Composer Controls"
          description="Choose where each prompt input control lives: pinned to the toolbar, tucked into the ⋯ tray, or off. You can also right-click the toolbar to edit this in place."
        >
          <LabeledField
            title="Composer Layout"
            description="Framed raises the input card and hangs four bars off it: turn activity above, workspace and runtime below, and the control shelves beside it. Classic is the previous stack, with every control in the toolbar row. A narrow composer falls back to Classic either way."
          >
            <ChoiceButtons<ComposerLayoutMode>
              value={normalizeComposerLayoutMode(composerLayout)}
              onChange={(value) =>
                updateSettings({ patch: { composerLayout: value } })
              }
              options={[
                { value: "framed", label: "Framed" },
                { value: "classic", label: "Classic" },
              ]}
            />
          </LabeledField>
          <ComposerControlPlacementList
            placements={composerControlPlacements}
            onChange={(next) =>
              updateSettings({ patch: { composerControlPlacements: next } })
            }
          />
        </SettingsCard>
        <SettingsCard
          title="Active Turn"
          description="Control what happens when you send a follow-up while an assistant turn is still running."
          titleAccessory={
            <Badge variant={midTurnSteeringEnabled ? "secondary" : "outline"}>
              {midTurnSteeringEnabled ? "Enabled" : "Disabled"}
            </Badge>
          }
        >
          <SwitchField
            title="Mid-Turn Steering"
            description="When off, follow-ups are queued until the current turn finishes. When on, supported providers can receive live steering messages."
            checked={midTurnSteeringEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { midTurnSteeringEnabled: checked } })
            }
          />
          <SelectField
            title="Active-Turn Keys"
            description="Choose which Enter action steers into the live turn and which queues for later."
            guide={
              <Badge variant="secondary">
                {formatSteerQueueEnterActionLabel(
                  normalizedSteerQueueEnterAction,
                )}
              </Badge>
            }
            value={normalizedSteerQueueEnterAction}
            disabled={!midTurnSteeringEnabled}
            onChange={(value) =>
              updateSettings({
                patch: {
                  steerQueueEnterAction: normalizeSteerQueueEnterAction(value),
                },
              })
            }
            options={STEER_QUEUE_ENTER_ACTION_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}
