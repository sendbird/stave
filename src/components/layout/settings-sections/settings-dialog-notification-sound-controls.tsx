import { useRef, useState } from "react";
import { FileAudio, Upload, X } from "lucide-react";
import { Badge, Slider } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { useTranslation, type I18nKey } from "@/i18n";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import {
  CUSTOM_AUDIO_ACCEPTED_TYPES,
  CUSTOM_AUDIO_MAX_SIZE_BYTES,
  NOTIFICATION_SOUND_PRESETS,
  readFileAsDataUrl,
  validateCustomAudioFile,
  type NotificationSoundPreset,
} from "@/lib/notifications/notification-sound";
import { ChoiceButtons, LabeledField, SwitchField } from "../settings-dialog.shared";

const NOTIFICATION_SOUND_PRESET_LABEL_KEYS = {
  chime: "settings:general.soundControls.presets.chime",
  bell: "settings:general.soundControls.presets.bell",
  pulse: "settings:general.soundControls.presets.pulse",
  bright: "settings:general.soundControls.presets.bright",
  harvest: "settings:general.soundControls.presets.harvest",
} as const satisfies Record<NotificationSoundPreset, I18nKey>;

export interface NotificationSoundControlsValue {
  enabled: boolean;
  mode: "preset" | "custom";
  preset: NotificationSoundPreset;
  volume: number;
  customAudioData: string | null;
  customAudioName: string | null;
}

export interface NotificationSoundControlsCopy {
  /** Label for the on/off toggle. */
  enableTitle: string;
  enableDescription: string;
  presetDescription: string;
  volumeDescription: string;
  /** aria-label for the volume slider — must be unique per card. */
  volumeAriaLabel: string;
  /**
   * Titles for the sub-fields. Because this editor is rendered once per sound
   * card, every field title becomes the accessible name of the control it
   * labels; they must be unique per card so screen readers (and role-based
   * queries) can tell the two "Source"/"Preset"/"Volume" groups apart.
   */
  sourceTitle: string;
  presetTitle: string;
  customAudioTitle: string;
  volumeTitle: string;
  previewTitle: string;
}

export function NotificationSoundControls({
  value,
  copy,
  onPatch,
  previewPlayers,
}: {
  value: NotificationSoundControlsValue;
  copy: NotificationSoundControlsCopy;
  onPatch: (patch: Partial<NotificationSoundControlsValue>) => void;
  previewPlayers: {
    playPreset: (options: {
      preset: NotificationSoundPreset;
      volume: number;
    }) => void;
    playCustom: (options: { dataUrl: string; volume: number }) => void;
  };
}) {
  const { t } = useTranslation(["settings", "common"]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const volumePercent = Math.round(value.volume * 100);

  const handleCustomAudioUpload = async (file: File) => {
    setUploadError(null);
    const error = validateCustomAudioFile(file);
    if (error) {
      setUploadError(error);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onPatch({
        mode: "custom",
        customAudioData: dataUrl,
        customAudioName: file.name,
      });
    } catch {
      setUploadError(t("general.soundControls.readFailed"));
    }
  };

  const handleRemoveCustomAudio = () => {
    setUploadError(null);
    onPatch({
      mode: "preset",
      customAudioData: null,
      customAudioName: null,
    });
  };

  const handleTestSound = () => {
    if (value.mode === "custom" && value.customAudioData) {
      previewPlayers.playCustom({
        dataUrl: value.customAudioData,
        volume: value.volume,
      });
    } else {
      previewPlayers.playPreset({
        preset: value.preset,
        volume: value.volume,
      });
    }
  };

  return (
    <>
      <SwitchField
        title={copy.enableTitle}
        description={copy.enableDescription}
        checked={value.enabled}
        onCheckedChange={(checked) => onPatch({ enabled: checked })}
      />
      {value.enabled ? (
        <>
          <LabeledField
            title={copy.sourceTitle}
            description={t("general.soundControls.sourceDescription")}
          >
            <ChoiceButtons
              value={value.mode}
              onChange={(next) =>
                onPatch({ mode: next as "preset" | "custom" })
              }
              options={[
                { value: "preset", label: t("general.soundControls.sourcePreset") },
                { value: "custom", label: t("common:labels.custom") },
              ]}
            />
          </LabeledField>
          {value.mode === "preset" ? (
            <LabeledField
              title={copy.presetTitle}
              description={copy.presetDescription}
            >
              <ChoiceButtons
                value={value.preset}
                onChange={(next) =>
                  onPatch({ preset: next as NotificationSoundPreset })
                }
                options={NOTIFICATION_SOUND_PRESETS.map((preset) => ({
                  value: preset,
                  label: t(NOTIFICATION_SOUND_PRESET_LABEL_KEYS[preset]),
                }))}
              />
            </LabeledField>
          ) : (
            <LabeledField
              title={copy.customAudioTitle}
              description={t("general.soundControls.customAudioDescription", {
                maxKb: CUSTOM_AUDIO_MAX_SIZE_BYTES / 1024,
              })}
            >
              <div className={sx(styles.stackSm)}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={CUSTOM_AUDIO_ACCEPTED_TYPES.join(",")}
                  className={sx(styles.hiddenInput)}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void handleCustomAudioUpload(file);
                    }
                    // Reset so the same file can be re-selected
                    e.target.value = "";
                  }}
                />
                {value.customAudioName ? (
                  <div className={sx(styles.audioNameRow)}>
                    <div className={sx(styles.audioNameChip)}>
                      <FileAudio className={sx(styles.audioIcon)} />
                      <span className={sx(styles.truncate)}>
                        {value.customAudioName}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className={sx(styles.buttonIconLeading)} />
                      {t("general.soundControls.replace")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRemoveCustomAudio}
                    >
                      <X className={sx(styles.buttonIconLeading)} />
                      {t("common:actions.remove")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className={sx(styles.buttonIconLeading)} />
                    {t("general.soundControls.upload")}
                  </Button>
                )}
                {uploadError ? (
                  <p className={sx(styles.errorText)}>{uploadError}</p>
                ) : null}
              </div>
            </LabeledField>
          )}
          <LabeledField
            title={copy.volumeTitle}
            description={copy.volumeDescription}
          >
            <div className={sx(styles.sliderRow)}>
              <Slider
                aria-label={copy.volumeAriaLabel}
                className={sx(styles.sliderFlex)}
                value={volumePercent}
                min={0}
                max={100}
                step={1}
                onValueChange={(nextValue) => {
                  onPatch({ volume: nextValue / 100 });
                }}
              />
              <Badge variant="outline" className={sx(styles.valueBadge)}>
                {volumePercent}%
              </Badge>
            </div>
          </LabeledField>
          <LabeledField
            title={copy.previewTitle}
            description={
              value.mode === "custom"
                ? t("general.soundControls.previewCustomDescription")
                : t("general.soundControls.previewPresetDescription")
            }
          >
            <Button
              size="sm"
              variant="outline"
              onClick={handleTestSound}
              disabled={value.mode === "custom" && !value.customAudioData}
            >
              {t("general.soundControls.testSound")}
            </Button>
          </LabeledField>
        </>
      ) : null}
    </>
  );
}
