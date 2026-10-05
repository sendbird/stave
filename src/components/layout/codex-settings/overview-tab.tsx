import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Loader,
} from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { AlertCircle, RefreshCcw } from "lucide-react";
import {
  CODEX_CLI_SLASH_COMMANDS,
  getCodexSlashCommandCatalogDetail,
} from "@/lib/providers/codex-command-catalog";
import type { CodexAppServerSnapshot } from "@/lib/providers/provider.types";
import type { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import { useMemo } from "react";
import { formatNumber } from "@/i18n/format";
import { codexStyles } from "../settings-dialog-codex-section.styles";
import {
  DenseMetric,
  DenseSection,
  StatusPill,
  formatDateTime,
  formatPercent,
  getPercentWidth,
  rateLimitFillStyle,
  getCodexAccountBadgeState,
  type SnapshotState,
} from "./shared";

type OverviewTabProps = {
  snapshot: CodexAppServerSnapshot | null;
  snapshotState: SnapshotState;
  codexModelCatalog: ReturnType<typeof useCodexModelCatalog>;
  workspaceCwd: string | undefined;
  trimmedBinaryPath: string;
};

export function OverviewTab({
  snapshot,
  snapshotState,
  codexModelCatalog,
  workspaceCwd,
  trimmedBinaryPath,
}: OverviewTabProps) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const accountBadge = getCodexAccountBadgeState(snapshot?.account ?? null);
  const metrics = useMemo(() => {
    if (!snapshot) return [];
    return [
      {
        label: t("settingsProviders:codexOverviewTab.metrics.models"),
        value: formatNumber(codexModelCatalog.models.length),
        tone: codexModelCatalog.isDynamic ? "success" : "muted",
      },
      { label: t("settingsProviders:codexOverviewTab.metrics.plugins"), value: formatNumber(snapshot.plugins.length) },
      { label: t("settingsProviders:codexOverviewTab.metrics.apps"), value: formatNumber(snapshot.apps.length) },
      { label: t("settingsProviders:codexOverviewTab.metrics.threads"), value: formatNumber(snapshot.threads.length) },
      {
        label: t("settingsProviders:codexOverviewTab.metrics.skills"),
        value: formatNumber(
          snapshot.skills.reduce((total, group) => total + group.skills.length, 0),
        ),
      },
      {
        label: t("settingsProviders:codexOverviewTab.metrics.slashCommands"),
        value: formatNumber(CODEX_CLI_SLASH_COMMANDS.length),
      },
    ] as Array<{
      label: string;
      value: string;
      tone?: "default" | "muted" | "success" | "warning";
    }>;
  }, [codexModelCatalog.isDynamic, codexModelCatalog.models.length, snapshot, t]);
  return (
    <>
      {!snapshot ? (
        <Empty xstyle={codexStyles.emptyRoot}>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {snapshotState.status === "error" ? (
                <AlertCircle className={sx(codexStyles.size5Icon)} />
              ) : (
                <Loader aria-hidden size="sm" variant="spinner" />
              )}
            </EmptyMedia>
            <EmptyTitle>
              {t(snapshotState.status === "error" ? "settingsProviders:codexOverviewTab.empty.unavailable" : "settingsProviders:codexOverviewTab.empty.loading")}
            </EmptyTitle>
            <EmptyDescription>{snapshotState.detail}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className={sx(codexStyles.stack4)}>
          <div className={sx(codexStyles.metricsGrid)}>
            {metrics.map((metric) => (
              <DenseMetric
                key={metric.label}
                label={metric.label}
                value={metric.value}
                tone={metric.tone}
              />
            ))}
          </div>

          <div className={sx(codexStyles.twoColGrid1)}>
            <DenseSection
              title={t("settingsProviders:codexOverviewTab.runtime.title")}
              description={t("settingsProviders:codexOverviewTab.runtime.description")}
            >
              <div className={sx(codexStyles.lgTwoCol)}>
                <div className={sx(codexStyles.stack3)}>
                  <div className={sx(codexStyles.tile)}>
                    <div className={sx(codexStyles.rowCenterBetween)}>
                      <p className={sx(codexStyles.textSmMedium)}>{t("settingsProviders:codexOverviewTab.runtime.account")}</p>
                      <StatusPill
                        label={t(accountBadge.labelKey)}
                        tone={accountBadge.tone}
                      />
                    </div>
                    <div className={sx(codexStyles.mt2Space1SmMuted)}>
                      <p>{t("settingsProviders:codexOverviewTab.runtime.accountType", { value: snapshot.account?.type ?? t("settingsProviders:codexOverviewTab.runtime.unknownValue") })}</p>
                      <p>{t("settingsProviders:codexOverviewTab.runtime.accountEmail", { value: snapshot.account?.email ?? t("settingsProviders:codexOverviewTab.runtime.unknownValue") })}</p>
                      <p>{t("settingsProviders:codexOverviewTab.runtime.accountPlan", { value: snapshot.account?.planType ?? t("settingsProviders:codexOverviewTab.runtime.unknownValue") })}</p>
                    </div>
                  </div>

                  <div className={sx(codexStyles.tile)}>
                    <div className={sx(codexStyles.rowCenterBetween)}>
                      <p className={sx(codexStyles.textSmMedium)}>{t("settingsProviders:codexOverviewTab.runtime.modelCatalog")}</p>
                      <div className={sx(codexStyles.rowCenterGap2)}>
                        <StatusPill
                          label={t(
                            codexModelCatalog.isDynamic
                              ? "settingsProviders:codexOverviewTab.runtime.catalogLive"
                              : "settingsProviders:codexOverviewTab.runtime.catalogFallback",
                          )}
                          tone={
                            codexModelCatalog.isDynamic ? "success" : "warning"
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          xstyle={codexStyles.h6Px15}
                          onClick={() => codexModelCatalog.refresh()}
                        >
                          <RefreshCcw
                            className={sx(
                              codexStyles.size3Icon,
                              codexModelCatalog.status === "loading" &&
                                codexStyles.iconSpin,
                            )}
                          />
                        </Button>
                      </div>
                    </div>
                    <p className={sx(codexStyles.textSmMutedMt2)}>
                      {codexModelCatalog.detail ||
                        t("settingsProviders:codexOverviewTab.runtime.catalogDefaultDetail")}
                    </p>
                    {codexModelCatalog.entries.length > 0 ? (
                      <div className={sx(codexStyles.mt3Space15)}>
                        {codexModelCatalog.entries.map((entry) => (
                          <div
                            key={entry.id}
                            className={sx(codexStyles.metricStartRowXs)}
                          >
                            <div className={sx(codexStyles.minW0)}>
                              <span className={sx(codexStyles.fontMediumFg)}>
                                {entry.displayName || entry.model}
                              </span>
                              {entry.description ? (
                                <span className={sx(codexStyles.mlSmMutedFg)}>
                                  {entry.description}
                                </span>
                              ) : null}
                            </div>
                            <div className={sx(codexStyles.shrink0RowGap15)}>
                              {entry.isDefault ? (
                                <Badge
                                  variant="outline"
                                  className={sx(codexStyles.badgeTiny)}
                                >
                                  {t("settingsProviders:codexOverviewTab.runtime.defaultModel")}
                                </Badge>
                              ) : null}
                              {entry.supportedReasoningEfforts.length > 0 ? (
                                <span className={sx(codexStyles.mutedFg)}>
                                  {entry.supportedReasoningEfforts.join("/")}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : codexModelCatalog.models.length > 0 ? (
                      <p className={sx(codexStyles.textXsMutedMt3)}>
                        {codexModelCatalog.models.join(", ")}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className={sx(codexStyles.stack3)}>
                  <div className={sx(codexStyles.tile)}>
                    <div className={sx(codexStyles.rowCenterBetween)}>
                      <p className={sx(codexStyles.textSmMedium)}>{t("settingsProviders:codexOverviewTab.runtime.workspaceScope")}</p>
                      {workspaceCwd ? <StatusPill label={t("settingsProviders:codexOverviewTab.runtime.scoped")} /> : null}
                    </div>
                    <div className={sx(codexStyles.mt2Space1BreakAllSmMuted)}>
                      <p>{workspaceCwd ?? t("settingsProviders:codexOverviewTab.runtime.noWorkspaceCwd")}</p>
                      <p>
                        {t("settingsProviders:codexOverviewTab.runtime.binary", { path: trimmedBinaryPath || t("settingsProviders:codexOverviewTab.runtime.defaultBinary") })}
                      </p>
                    </div>
                  </div>

                  <div className={sx(codexStyles.tile)}>
                    <div className={sx(codexStyles.rowCenterBetween)}>
                      <p className={sx(codexStyles.textSmMedium)}>{t("settingsProviders:codexOverviewTab.runtime.slashCommands")}</p>
                      <StatusPill
                        label={t("settingsProviders:codexOverviewTab.runtime.builtInCount", { total: CODEX_CLI_SLASH_COMMANDS.length })}
                      />
                    </div>
                    <p className={sx(codexStyles.textSmMutedMt2)}>
                      {getCodexSlashCommandCatalogDetail()}
                    </p>
                  </div>
                </div>
              </div>
            </DenseSection>

            <DenseSection
              title={t("settingsProviders:codexOverviewTab.sectionErrors.title")}
              description={t("settingsProviders:codexOverviewTab.sectionErrors.description")}
            >
              {Object.entries(snapshotState.sectionErrors).length === 0 ? (
                <div className={sx(codexStyles.tileDashed)}>
                  {t("settingsProviders:codexOverviewTab.sectionErrors.empty")}
                </div>
              ) : (
                <div className={sx(codexStyles.stack2)}>
                  {Object.entries(snapshotState.sectionErrors).map(
                    ([key, value]) => (
                      <div key={key} className={sx(codexStyles.tileDanger)}>
                        <p className={sx(codexStyles.textSmMedium)}>{key}</p>
                        <p className={sx(codexStyles.textSmMutedMt1)}>
                          {value}
                        </p>
                      </div>
                    ),
                  )}
                </div>
              )}
            </DenseSection>
          </div>

          <DenseSection
            title={t("settingsProviders:codexOverviewTab.rateLimits.title")}
            description={t("settingsProviders:codexOverviewTab.rateLimits.description")}
          >
            {snapshot.rateLimits.length === 0 ? (
              <div className={sx(codexStyles.tileDashed)}>
                {t("settingsProviders:codexOverviewTab.rateLimits.empty")}
              </div>
            ) : (
              <div className={sx(codexStyles.stack3)}>
                {snapshot.rateLimits.map((limit, index) => (
                  <div
                    key={`${limit.limitId ?? "limit"}:${index}`}
                    className={sx(codexStyles.tile)}
                  >
                    <div className={sx(codexStyles.rowWrapCenterBetween)}>
                      <div>
                        <p className={sx(codexStyles.textSmMedium)}>
                          {limit.limitName ?? limit.limitId ?? t("settingsProviders:codexOverviewTab.rateLimits.unnamedBucket")}
                        </p>
                        <p className={sx(codexStyles.textXsMuted)}>
                          {limit.planType ?? t("settingsProviders:codexOverviewTab.rateLimits.unknownPlan")}
                        </p>
                      </div>
                      {limit.credits ? (
                        <StatusPill
                          label={
                            limit.credits.unlimited
                              ? t("settingsProviders:codexOverviewTab.rateLimits.unlimitedCredits")
                              : !limit.credits.hasCredits
                                ? t("settingsProviders:codexOverviewTab.rateLimits.noCredits")
                                : limit.credits.balance != null
                                  ? t("settingsProviders:codexOverviewTab.rateLimits.creditsBalance", { balance: limit.credits.balance })
                                  : t("settingsProviders:codexOverviewTab.rateLimits.creditsAvailable")
                          }
                          tone={
                            limit.credits.hasCredits ? "success" : "warning"
                          }
                        />
                      ) : null}
                    </div>

                    <div className={sx(codexStyles.mt3Space3)}>
                      {[
                        ["primary", limit.primary] as const,
                        ["secondary", limit.secondary] as const,
                      ]
                        .filter(([, bucket]) => bucket)
                        .map(([bucketName, bucket]) => (
                          <div key={bucketName} className={sx(codexStyles.space15)}>
                            <div className={sx(codexStyles.rateRow)}>
                              <span>{t(`settingsProviders:codexOverviewTab.rateLimits.${bucketName}`)}</span>
                              <span>
                                {bucket?.resetsAt
                                  ? t("settingsProviders:codexOverviewTab.rateLimits.usedWithReset", { percent: formatPercent(bucket.usedPercent), time: formatDateTime(t, bucket.resetsAt) })
                                  : formatPercent(bucket?.usedPercent)}
                              </span>
                            </div>
                            <div className={sx(codexStyles.progressTrack)}>
                              <div
                                className={sx(
                                  codexStyles.progressFill,
                                  rateLimitFillStyle(bucket?.usedPercent),
                                )}
                                style={{
                                  width: `${getPercentWidth(bucket?.usedPercent)}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DenseSection>
        </div>
      )}
    </>
  );
}
