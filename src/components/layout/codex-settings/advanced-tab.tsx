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
  return (
    <>
      {!snapshot ? null : (
        <div className={sx(codexStyles.twoColGridConfig)}>
          <div className={sx(codexStyles.stack4)}>
            <DenseSection
              title="Config requirements"
              description="Policy limits the App Server reports for approvals, sandbox, residency, and feature gates."
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
                    Import detected config
                  </Button>
                ) : null
              }
            >
              <div className={sx(codexStyles.stack3)}>
                <div className={sx(codexStyles.wrapGap2)}>
                  {(
                    snapshot.configRequirements?.allowedApprovalPolicies ?? []
                  ).map((value) => (
                    <StatusPill
                      key={`approval:${value}`}
                      label={`approval ${value}`}
                    />
                  ))}
                  {(snapshot.configRequirements?.allowedSandboxModes ?? []).map(
                    (value) => (
                      <StatusPill
                        key={`sandbox:${value}`}
                        label={`sandbox ${value}`}
                      />
                    ),
                  )}
                  {(
                    snapshot.configRequirements?.allowedWebSearchModes ?? []
                  ).map((value) => (
                    <StatusPill
                      key={`search:${value}`}
                      label={`search ${value}`}
                    />
                  ))}
                  {snapshot.configRequirements?.enforceResidency ? (
                    <StatusPill
                      label={`residency ${snapshot.configRequirements.enforceResidency}`}
                    />
                  ) : null}
                </div>

                {snapshot.externalAgentConfigItems.length > 0 ? (
                  <div className={sx(codexStyles.tile)}>
                    <p className={sx(codexStyles.textSmMedium)}>
                      Detected external configs
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
              title="Config layers"
              description="Merged config plus per-layer diagnostics returned by Codex."
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
                          <StatusPill label="disabled" tone="warning" />
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
              title="Advanced config edits"
              description="Raw JSON utilities for targeted Codex config changes. Most users should only inspect this area when diagnosing App Server behavior."
            >
              <div className={sx(codexStyles.stack4)}>
                <div className={sx(codexStyles.stack2)}>
                  <p className={sx(codexStyles.eyebrow)}>Single edit</p>
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
                    placeholder="Optional mergeStrategy"
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
                    Apply single edit
                  </Button>
                </div>

                <div className={sx(codexStyles.stack2)}>
                  <p className={sx(codexStyles.eyebrow)}>Batch edits</p>
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
                    Apply batch
                  </Button>
                </div>
              </div>
            </DenseSection>

            <DenseSection
              title="Merged advanced config"
              description="Read-only raw config payload returned by `config/read`."
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
