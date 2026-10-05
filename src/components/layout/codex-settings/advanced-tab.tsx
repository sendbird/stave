import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Input,
  Loader,
  Textarea,
} from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { Layers2 } from "lucide-react";
import type { CodexAppServerSnapshot } from "@/lib/providers/provider.types";
import { codexStyles } from "../settings-dialog-codex-section.styles";
import { DenseSection, ReadOnlyCodeBlock, StatusPill } from "./shared";

type AdvancedTabProps = {
  snapshot: CodexAppServerSnapshot | null;
  busyKey: string | null;
  singleConfigKeyPath: string;
  onSingleConfigKeyPathChange: (value: string) => void;
  singleMergeStrategy: string;
  onSingleMergeStrategyChange: (value: string) => void;
  singleConfigValue: string;
  onSingleConfigValueChange: (value: string) => void;
  batchConfigEdits: string;
  onBatchConfigEditsChange: (value: string) => void;
  onImportExternalConfig: () => void;
  onSingleConfigWrite: () => void;
  onBatchConfigWrite: () => void;
};

export function AdvancedTab({
  snapshot,
  busyKey,
  singleConfigKeyPath,
  onSingleConfigKeyPathChange,
  singleMergeStrategy,
  onSingleMergeStrategyChange,
  singleConfigValue,
  onSingleConfigValueChange,
  batchConfigEdits,
  onBatchConfigEditsChange,
  onImportExternalConfig,
  onSingleConfigWrite,
  onBatchConfigWrite,
}: AdvancedTabProps) {
  const { t } = useTranslation(I18N_NAMESPACES);
  return (
    <>
      {!snapshot ? null : (
        <div className={sx(codexStyles.twoColGridConfig)}>
          <div className={sx(codexStyles.stack4)}>
            <DenseSection
              title={t("settingsProviders:codexAdvancedTab.requirements.title")}
              description={t("settingsProviders:codexAdvancedTab.requirements.description")}
              action={
                snapshot.externalAgentConfigItems.length > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void onImportExternalConfig();
                    }}
                    disabled={busyKey === "config-import"}
                  >
                    {busyKey === "config-import" ? (
                      <Loader
                        aria-hidden
                        className={sx(codexStyles.mr1)}
                        size="xs"
                        variant="spinner"
                      />
                    ) : null}
                    {t("settingsProviders:codexAdvancedTab.requirements.importDetected")}
                  </Button>
                ) : null
              }
            >
              <div className={sx(codexStyles.stack3)}>
                <div className={sx(codexStyles.wrapGap2)}>
                  {(
                    snapshot.configRequirements?.allowedApprovalPolicies ?? []
                  ).map((value) => (
                    <StatusPill key={`approval:${value}`} label={t("settingsProviders:codexAdvancedTab.requirements.approval", { value })} />
                  ))}
                  {(snapshot.configRequirements?.allowedSandboxModes ?? []).map(
                    (value) => (
                      <StatusPill key={`sandbox:${value}`} label={t("settingsProviders:codexAdvancedTab.requirements.sandbox", { value })} />
                    ),
                  )}
                  {(
                    snapshot.configRequirements?.allowedWebSearchModes ?? []
                  ).map((value) => (
                    <StatusPill key={`search:${value}`} label={t("settingsProviders:codexAdvancedTab.requirements.search", { value })} />
                  ))}
                  {snapshot.configRequirements?.enforceResidency ? (
                    <StatusPill
                      label={t("settingsProviders:codexAdvancedTab.requirements.residency", { value: snapshot.configRequirements.enforceResidency })}
                    />
                  ) : null}
                </div>

                {snapshot.externalAgentConfigItems.length > 0 ? (
                  <div className={sx(codexStyles.tile)}>
                    <p className={sx(codexStyles.textSmMedium)}>
                      {t("settingsProviders:codexAdvancedTab.requirements.detectedExternal")}
                    </p>
                    <div className={sx(codexStyles.mt2Space2)}>
                      {snapshot.externalAgentConfigItems.map((item, index) => (
                        <div
                          key={`${item.itemType}:${item.description}:${index}`}
                          className={sx(codexStyles.smallTile)}
                        >
                          <p className={sx(codexStyles.textSmMedium)}>
                            {item.itemType}
                          </p>
                          <p className={sx(codexStyles.mt1TextXsMuted)}>
                            {item.description}
                          </p>
                          {item.cwd ? (
                            <p
                              className={sx(codexStyles.breakAllMicroMutedMt1)}
                            >
                              {item.cwd}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </DenseSection>

            <DenseSection
              title={t("settingsProviders:codexAdvancedTab.layers.title")}
              description={t("settingsProviders:codexAdvancedTab.layers.description")}
            >
              <Accordion multiple className={sx(codexStyles.wFullSpace3)}>
                {snapshot.config?.layers.map((layer, index) => (
                  <AccordionItem
                    key={`${layer.name}:${layer.version}:${index}`}
                    value={`${layer.name}:${layer.version}:${index}`}
                    className={sx(codexStyles.accordionItem)}
                  >
                    <AccordionTrigger className={sx(codexStyles.py3)}>
                      <div className={sx(codexStyles.accordionTriggerRow)}>
                        <Layers2 className={sx(codexStyles.icon4)} />
                        <span className={sx(codexStyles.accordionLayerName)}>
                          {layer.name}
                        </span>
                        {layer.version ? (
                          <StatusPill label={layer.version} />
                        ) : null}
                        {layer.disabledReason ? (
                          <StatusPill label={t("settingsProviders:codexAdvancedTab.layers.disabled")} tone="warning" />
                        ) : null}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className={sx(codexStyles.space2Pb3)}>
                      {layer.disabledReason ? (
                        <p className={sx(codexStyles.descAnywhere)}>
                          {layer.disabledReason}
                        </p>
                      ) : null}
                      <ReadOnlyCodeBlock
                        value={JSON.stringify(layer.config, null, 2)}
                      />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </DenseSection>
          </div>

          <div className={sx(codexStyles.stack4)}>
            <DenseSection
              title={t("settingsProviders:codexAdvancedTab.edits.title")}
              description={t("settingsProviders:codexAdvancedTab.edits.description")}
            >
              <div className={sx(codexStyles.stack4)}>
                <div className={sx(codexStyles.stack2)}>
                  <p className={sx(codexStyles.eyebrow)}>{t("settingsProviders:codexAdvancedTab.edits.single")}</p>
                  <Input
                    value={singleConfigKeyPath}
                    onChange={(event) =>
                      onSingleConfigKeyPathChange(event.target.value)
                    }
                    placeholder="features.apps"
                  />
                  <Input
                    value={singleMergeStrategy}
                    onChange={(event) =>
                      onSingleMergeStrategyChange(event.target.value)
                    }
                    placeholder={t("settingsProviders:codexAdvancedTab.edits.mergeStrategyPlaceholder")}
                  />
                  <Textarea
                    value={singleConfigValue}
                    onChange={(event) =>
                      onSingleConfigValueChange(event.target.value)
                    }
                    xstyle={codexStyles.configTextarea140}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      void onSingleConfigWrite();
                    }}
                    disabled={busyKey === "config-write-single"}
                  >
                    {busyKey === "config-write-single" ? (
                      <Loader
                        aria-hidden
                        className={sx(codexStyles.mr1)}
                        size="xs"
                        variant="spinner"
                      />
                    ) : null}
                    {t("settingsProviders:codexAdvancedTab.edits.applySingle")}
                  </Button>
                </div>

                <div className={sx(codexStyles.stack2)}>
                  <p className={sx(codexStyles.eyebrow)}>{t("settingsProviders:codexAdvancedTab.edits.batch")}</p>
                  <Textarea
                    value={batchConfigEdits}
                    onChange={(event) =>
                      onBatchConfigEditsChange(event.target.value)
                    }
                    xstyle={codexStyles.configTextarea220}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void onBatchConfigWrite();
                    }}
                    disabled={busyKey === "config-write-batch"}
                  >
                    {busyKey === "config-write-batch" ? (
                      <Loader
                        aria-hidden
                        className={sx(codexStyles.mr1)}
                        size="xs"
                        variant="spinner"
                      />
                    ) : null}
                    {t("settingsProviders:codexAdvancedTab.edits.applyBatch")}
                  </Button>
                </div>
              </div>
            </DenseSection>

            <DenseSection
              title={t("settingsProviders:codexAdvancedTab.merged.title")}
              description={t("settingsProviders:codexAdvancedTab.merged.description")}
            >
              <ReadOnlyCodeBlock
                value={JSON.stringify(snapshot.config?.config ?? {}, null, 2)}
                minHeight={280}
              />
            </DenseSection>
          </div>
        </div>
      )}
    </>
  );
}
