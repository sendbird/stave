import { I18N_NAMESPACES, useTranslation, type I18nKey } from "@/i18n";
import { ComposerControlPlacementList } from "@/components/ai-elements/prompt-input-control-menu";
import { useShallow } from "zustand/react/shallow";
import { Badge, Slider } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import {
  normalizeSteerQueueEnterAction,
  type SteerQueueEnterAction,
} from "@/lib/steer-queue-shortcuts";
import {
  normalizeComposerLayoutMode,
  type ComposerLayoutMode,
} from "@/store/app-settings";
import { useAppStore } from "@/store/app.store";
import { TurnActivityFields } from "./settings-dialog-turn-activity-fields";
import {
  ChoiceButtons,
  DraftInput,
  LabeledField,
  SectionStack,
  SelectField,
  SettingsCard,
  SwitchField,
} from "../settings-dialog.shared";

const STEER_QUEUE_ENTER_ACTION_LABEL_KEYS = {
  queue: "settings:chatSection.activeTurn.keys.queue",
  steer: "settings:chatSection.activeTurn.keys.steer",
} as const satisfies Record<SteerQueueEnterAction, I18nKey>;
const STEER_QUEUE_ENTER_ACTIONS = ["queue", "steer"] as const satisfies readonly SteerQueueEnterAction[];

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
          state.settings.composerLayout,
          state.settings.composerControlPlacements,
          state.settings.steerQueueEnterAction,
          state.settings.midTurnSteeringEnabled,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const normalizedSteerQueueEnterAction = normalizeSteerQueueEnterAction(steerQueueEnterAction);
  const { t } = useTranslation(I18N_NAMESPACES);

  return (
    <SectionStack>
      <SettingsCard
        title={t("settings:chatSection.typography.title")}
        description={t("settings:chatSection.typography.description")}
      >
        <LabeledField
          title={t("settings:chatSection.typography.messageFontSize.title")}
          description={t("settings:chatSection.typography.messageFontSize.description")}
        >
          <div className={sx(styles.sliderRow)}>
            <Slider
              aria-label={t("settings:chatSection.typography.messageFontSize.ariaLabel")}
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
              {/* i18n-ignore: CSS pixel unit readout */}
              {messageFontSize}px
            </span>
          </div>
        </LabeledField>
        <LabeledField
          title={t("settings:chatSection.typography.codeFontSize.title")}
          description={t("settings:chatSection.typography.codeFontSize.description")}
        >
          <div className={sx(styles.sliderRow)}>
            <Slider
              aria-label={t("settings:chatSection.typography.codeFontSize.ariaLabel")}
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
              {/* i18n-ignore: CSS pixel unit readout */}
              {messageCodeFontSize}px
            </span>
          </div>
        </LabeledField>
        <LabeledField
          title={t("settings:chatSection.typography.fontFamily.title")}
          description={t("settings:chatSection.typography.fontFamily.description")}
        >
          <div className={sx(styles.spaceY2)}>
            <ChoiceButtons
              value={messageFontFamily}
              onChange={(value) =>
                updateSettings({ patch: { messageFontFamily: value } })
              }
              options={[
                { value: "Geist Variable", label: "Geist" }, // i18n-ignore: font family name
                { value: "Inter Variable", label: "Inter" }, // i18n-ignore: font family name
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
          title={t("settings:chatSection.typography.monoFontFamily.title")}
          description={t("settings:chatSection.typography.monoFontFamily.description")}
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
          title={t("settings:chatSection.typography.koreanFontFamily.title")}
          description={t("settings:chatSection.typography.koreanFontFamily.description")}
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
          title={t("settings:chatSection.typography.infoPanelScale.title")}
          description={t("settings:chatSection.typography.infoPanelScale.description")}
        >
          <div className={sx(styles.sliderRow)}>
            <Slider
              aria-label={t("settings:chatSection.typography.infoPanelScale.ariaLabel")}
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
        title={t("settings:chatSection.behavior.title")}
        description={t("settings:chatSection.behavior.description")}
      >
        <SwitchField
          title={t("settings:chatSection.behavior.streaming.title")}
          description={t("settings:chatSection.behavior.streaming.description")}
          checked={chatStreamingEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ patch: { chatStreamingEnabled: checked } })
          }
        />
        <LabeledField
          title={t("settings:chatSection.behavior.reasoningExpansion.title")}
          description={t("settings:chatSection.behavior.reasoningExpansion.description")}
        >
          <ChoiceButtons<"auto" | "manual">
            value={reasoningExpansionMode}
            onChange={(value) =>
              updateSettings({ patch: { reasoningExpansionMode: value } })
            }
            options={[
              { value: "auto", label: t("common:labels.auto") },
              { value: "manual", label: t("settings:chatSection.behavior.reasoningExpansion.manual") },
            ]}
          />
        </LabeledField>
        <SwitchField
          title={t("settings:chatSection.behavior.interimMessages.title")}
          description={t("settings:chatSection.behavior.interimMessages.description")}
          checked={showInterimMessages}
          onCheckedChange={(checked) =>
            updateSettings({ patch: { showInterimMessages: checked } })
          }
        />
        <SwitchField
          title={t("settings:chatSection.behavior.turnRail.title")}
          description={t("settings:chatSection.behavior.turnRail.description")}
          checked={showConversationTurnRail}
          onCheckedChange={(checked) =>
            updateSettings({
              patch: { showConversationTurnRail: checked },
            })
          }
        />
        <TurnActivityFields />
      </SettingsCard>
      <SettingsCard
        title={t("settings:chatSection.composerControls.title")}
        description={t("settings:chatSection.composerControls.description")}
      >
        <LabeledField
          title={t("settings:chatSection.composerControls.layout.title")}
          description={t("settings:chatSection.composerControls.layout.description")}
        >
          <ChoiceButtons<ComposerLayoutMode>
            value={normalizeComposerLayoutMode(composerLayout)}
            onChange={(value) =>
              updateSettings({ patch: { composerLayout: value } })
            }
            options={[
              { value: "framed", label: t("settings:chatSection.composerControls.layout.framed") },
              { value: "classic", label: t("settings:chatSection.composerControls.layout.classic") },
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
        title={t("settings:chatSection.activeTurn.title")}
        description={t("settings:chatSection.activeTurn.description")}
        titleAccessory={
          <Badge variant={midTurnSteeringEnabled ? "secondary" : "outline"}>
            {midTurnSteeringEnabled ? t("common:status.enabled") : t("common:status.disabled")}
          </Badge>
        }
      >
        <SwitchField
          title={t("settings:chatSection.activeTurn.midTurnSteering.title")}
          description={t("settings:chatSection.activeTurn.midTurnSteering.description")}
          checked={midTurnSteeringEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ patch: { midTurnSteeringEnabled: checked } })
          }
        />
        <SelectField
          title={t("settings:chatSection.activeTurn.keys.title")}
          description={t("settings:chatSection.activeTurn.keys.description")}
          guide={
            <Badge variant="secondary">
              {t(STEER_QUEUE_ENTER_ACTION_LABEL_KEYS[normalizedSteerQueueEnterAction])}
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
          options={STEER_QUEUE_ENTER_ACTIONS.map((action) => ({
            value: action,
            label: t(STEER_QUEUE_ENTER_ACTION_LABEL_KEYS[action]),
          }))}
        />
      </SettingsCard>
    </SectionStack>
  );
}
