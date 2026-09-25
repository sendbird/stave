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
  const accountBadge = getCodexAccountBadgeState(snapshot?.account ?? null);
  const metrics = useMemo(() => {
    if (!snapshot) return [];
    return [
      {
        label: "Models",
        value: String(codexModelCatalog.models.length),
        tone: codexModelCatalog.isDynamic ? "success" : "muted",
      },
      { label: "Plugins", value: String(snapshot.plugins.length) },
      { label: "Apps", value: String(snapshot.apps.length) },
      { label: "Threads", value: String(snapshot.threads.length) },
      {
        label: "Skills",
        value: String(
          snapshot.skills.reduce(
            (total, group) => total + group.skills.length,
            0,
          ),
        ),
      },
      {
        label: "Slash Commands",
        value: String(CODEX_CLI_SLASH_COMMANDS.length),
      },
    ] as Array<{
      label: string;
      value: string;
      tone?: "default" | "muted" | "success" | "warning";
    }>;
  }, [codexModelCatalog.isDynamic, codexModelCatalog.models.length, snapshot]);
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
              {snapshotState.status === "error"
                ? "Codex snapshot unavailable"
                : "Loading Codex snapshot"}
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
              title="Runtime summary"
              description="Live App Server data for the current workspace and Codex binary."
            >
              <div className={sx(codexStyles.lgTwoCol)}>
                <div className={sx(codexStyles.stack3)}>
                  <div className={sx(codexStyles.tile)}>
                    <div className={sx(codexStyles.rowCenterBetween)}>
                      <p className={sx(codexStyles.textSmMedium)}>Account</p>
                      <StatusPill
                        label={accountBadge.label}
                        tone={accountBadge.tone}
                      />
                    </div>
                    <div className={sx(codexStyles.mt2Space1SmMuted)}>
                      <p>Type: {snapshot.account?.type ?? "unknown"}</p>
                      <p>Email: {snapshot.account?.email ?? "unknown"}</p>
                      <p>Plan: {snapshot.account?.planType ?? "unknown"}</p>
                    </div>
                  </div>

                  <div className={sx(codexStyles.tile)}>
                    <div className={sx(codexStyles.rowCenterBetween)}>
                      <p className={sx(codexStyles.textSmMedium)}>
                        Model catalog
                      </p>
                      <div className={sx(codexStyles.rowCenterGap2)}>
                        <StatusPill
                          label={
                            codexModelCatalog.isDynamic
                              ? "live app server"
                              : "fallback"
                          }
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
                        "Using the configured Codex model catalog."}
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
                                  default
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
                      <p className={sx(codexStyles.textSmMedium)}>
                        Workspace scope
                      </p>
                      {workspaceCwd ? <StatusPill label="scoped" /> : null}
                    </div>
                    <div className={sx(codexStyles.mt2Space1BreakAllSmMuted)}>
                      <p>{workspaceCwd ?? "No workspace cwd available."}</p>
                      <p>
                        Binary:{" "}
                        {trimmedBinaryPath || "Default Codex executable"}
                      </p>
                    </div>
                  </div>

                  <div className={sx(codexStyles.tile)}>
                    <div className={sx(codexStyles.rowCenterBetween)}>
                      <p className={sx(codexStyles.textSmMedium)}>
                        Slash commands
                      </p>
                      <StatusPill
                        label={`${CODEX_CLI_SLASH_COMMANDS.length} built-in`}
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
              title="Section errors"
              description="Snapshot sections that failed independently while the rest of the App Server surface loaded."
            >
              {Object.entries(snapshotState.sectionErrors).length === 0 ? (
                <div className={sx(codexStyles.tileDashed)}>
                  No partial section failures.
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
            title="Rate limits"
            description="Current limit buckets and credit state reported by Codex."
          >
            {snapshot.rateLimits.length === 0 ? (
              <div className={sx(codexStyles.tileDashed)}>
                No rate-limit buckets returned by the App Server.
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
                          {limit.limitName ?? limit.limitId ?? "Unnamed bucket"}
                        </p>
                        <p className={sx(codexStyles.textXsMuted)}>
                          {limit.planType ?? "unknown plan"}
                        </p>
                      </div>
                      {limit.credits ? (
                        <StatusPill
                          label={
                            limit.credits.unlimited
                              ? "unlimited credits"
                              : limit.credits.hasCredits
                                ? `credits ${limit.credits.balance ?? "available"}`
                                : "no credits"
                          }
                          tone={
                            limit.credits.hasCredits ? "success" : "warning"
                          }
                        />
                      ) : null}
                    </div>

                    <div className={sx(codexStyles.mt3Space3)}>
                      {[
                        ["Primary", limit.primary] as const,
                        ["Secondary", limit.secondary] as const,
                      ]
                        .filter(([, bucket]) => bucket)
                        .map(([label, bucket]) => (
                          <div key={label} className={sx(codexStyles.space15)}>
                            <div className={sx(codexStyles.rateRow)}>
                              <span>{label}</span>
                              <span>
                                {formatPercent(bucket?.usedPercent)}
                                {bucket?.resetsAt
                                  ? ` · resets ${formatDateTime(bucket.resetsAt)}`
                                  : ""}
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
