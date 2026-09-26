import { useState } from "react";
import { ArrowUpRight, CircleCheck, CircleDot, FileText, GitPullRequest, Link2, MonitorPlay, Ticket, X } from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { Button } from "@/components/ads/components/Button";
import { Switch } from "@/components/ads/components/Switch";
import { Tabs } from "@/components/ads/components/Tabs";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { Segmented } from "@/components/playbooks/Segmented";
import type { ProjectDetail, ProjectLibraryItem } from "@/lib/projects/api";
import type { ProjectMemory, ProjectSettings } from "@/lib/projects/domain";
import { missionTitle } from "./ProjectRows";
import { projectStyles as styles } from "./projects.styles";

type DetailTab = "memory" | "library" | "settings";

const LIBRARY_ICONS: Record<ProjectLibraryItem["kind"], typeof Link2> = {
  "pull-request": GitPullRequest,
  issue: Ticket,
  preview: MonitorPlay,
  document: FileText,
  link: Link2,
};

function TabLabel(props: { label: string; count?: number; attention?: boolean }) {
  return (
    <span className={sx(styles.tabLabel)}>
      {props.label}
      {props.count !== undefined ? <span className={sx(styles.tabCount)}>{props.count}</span> : null}
      {props.attention ? <span className={sx(styles.tabDot)} aria-label="Something to review" role="img" /> : null}
    </span>
  );
}

/** What the project learned, what it collected and what it may do, in three tabs. */
export function ProjectDetailTabs(props: {
  detail: ProjectDetail;
  busy: boolean;
  onSetMemoryStatus: (memory: ProjectMemory, status: ProjectMemory["status"] | "removed") => void;
  onUpdateSettings: (settings: Partial<ProjectSettings>) => void;
}) {
  const { detail } = props;
  const [tab, setTab] = useState<DetailTab>("memory");
  const candidates = detail.memories.filter((memory) => memory.status === "candidate").length;
  return (
    <Tabs.Root variant="line" value={tab} onValueChange={(value) => setTab(value as DetailTab)} xstyle={styles.lane}>
      <Tabs.List aria-label="Project details">
        <Tabs.Tab value="memory">
          <TabLabel label="Memory" count={detail.memories.length} attention={candidates > 0} />
        </Tabs.Tab>
        <Tabs.Tab value="library">
          <TabLabel label="Library" count={detail.library.length} />
        </Tabs.Tab>
        <Tabs.Tab value="settings">
          <TabLabel label="Settings" />
        </Tabs.Tab>
        <Tabs.Indicator />
      </Tabs.List>
      <Tabs.Panel value="memory" xstyle={styles.tabPanel}>
        <MemoryList detail={detail} busy={props.busy} onSetStatus={props.onSetMemoryStatus} />
      </Tabs.Panel>
      <Tabs.Panel value="library" xstyle={styles.tabPanel}>
        <LibraryList items={detail.library} />
      </Tabs.Panel>
      <Tabs.Panel value="settings" xstyle={styles.tabPanel}>
        <SettingsList settings={detail.project.settings} onUpdate={props.onUpdateSettings} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}

function MemoryList(props: {
  detail: ProjectDetail;
  busy: boolean;
  onSetStatus: (memory: ProjectMemory, status: ProjectMemory["status"] | "removed") => void;
}) {
  const { memories, missions } = props.detail;
  if (memories.length === 0) {
    return <p className={sx(styles.emptyLane)}>Decisions from finished missions and the coordinator's notes appear here.</p>;
  }
  const titleOf = (missionId: string | null) => {
    const mission = missionId ? missions.find((candidate) => candidate.missionId === missionId) : undefined;
    return mission ? missionTitle(mission) : null;
  };
  return (
    <ul className={sx(styles.rows)}>
      {memories.map((memory) => {
        const candidate = memory.status === "candidate";
        const source = titleOf(memory.sourceMissionId);
        return (
          <li key={memory.id} className={sx(styles.row, styles.rowCompact)}>
            <span className={sx(styles.rowMark)}>
              {candidate ? (
                <CircleDot aria-hidden className={sx(styles.icon, styles.toneWaiting)} />
              ) : (
                <CircleCheck aria-hidden className={sx(styles.icon, styles.toneDone)} />
              )}
            </span>
            <span className={sx(styles.rowText)}>
              <span className={sx(styles.memoryText)}>{memory.content}</span>
              <span className={sx(styles.rowMeta)}>
                {candidate ? <span className={sx(styles.rowWaiting)}>To review · </span> : null}
                {memory.kind === "decision" ? "Decision" : "Coordinator note"}
                {source ? ` · from “${source}”` : ""}
              </span>
            </span>
            <span className={sx(styles.rowActions)}>
              {candidate ? (
                <Button size="xs" variant="secondary" disabled={props.busy} onClick={() => props.onSetStatus(memory, "accepted")}>
                  Accept
                </Button>
              ) : null}
              <Tooltip content="Remove from project memory">
                <Button
                  size="xs"
                  variant="quiet"
                  iconOnly
                  aria-label="Remove from project memory"
                  disabled={props.busy}
                  onClick={() => props.onSetStatus(memory, "removed")}
                >
                  <X aria-hidden />
                </Button>
              </Tooltip>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function LibraryList({ items }: { items: readonly ProjectLibraryItem[] }) {
  if (items.length === 0) {
    return <p className={sx(styles.emptyLane)}>Pull requests, issues and previews from finished missions collect here.</p>;
  }
  return (
    <ul className={sx(styles.rows)}>
      {items.map((item) => {
        const Icon = LIBRARY_ICONS[item.kind];
        return (
          <li key={`${item.missionId}:${item.url}`} className={sx(styles.linkItem)}>
            <a className={sx(styles.row, styles.rowCompact, styles.rowLink, focusRing.ring, transition.colors)} href={item.url} target="_blank" rel="noreferrer">
              <span className={sx(styles.rowMark)}>
                <Icon aria-hidden className={sx(styles.icon, styles.iconMuted)} />
              </span>
              <span className={sx(styles.rowText)}>
                <span className={sx(styles.rowTitle)}>{item.label}</span>
                <span className={sx(styles.rowMeta)}>{item.missionTitle}</span>
              </span>
              <span className={sx(styles.rowActions)}>
                {item.verified ? (
                  <Badge size="sm" tone="success">
                    Verified
                  </Badge>
                ) : null}
                <ArrowUpRight aria-hidden className={sx(styles.icon, styles.iconMuted)} />
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function SettingRow(props: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <li className={sx(styles.settingRow)}>
      <span className={sx(styles.rowText)}>
        <span className={sx(styles.rowTitle)}>{props.label}</span>
        <span className={sx(styles.settingHint)}>{props.hint}</span>
      </span>
      {props.children}
    </li>
  );
}

function SettingsList(props: { settings: ProjectSettings; onUpdate: (settings: Partial<ProjectSettings>) => void }) {
  const { settings } = props;
  return (
    <ul className={sx(styles.rows)}>
      <SettingRow label="Missions at once" hint="How many of this project's missions may run side by side, each on its own worktree.">
        <Segmented
          aria-label="Missions at once"
          size="xs"
          value={String(settings.parallelLimit) as "1" | "2" | "3" | "4"}
          options={(["1", "2", "3", "4"] as const).map((value) => ({ value, label: value }))}
          onChange={(value) => props.onUpdate({ parallelLimit: Number(value) })}
        />
      </SettingRow>
      <SettingRow
        label="Ask before starting"
        hint="On: the coordinator proposes and you start each mission. Off: missions start on their own, up to the limit."
      >
        <Switch
          aria-label="Ask before starting a mission"
          checked={settings.askBeforeStarting}
          onCheckedChange={(checked) => props.onUpdate({ askBeforeStarting: checked })}
        />
      </SettingRow>
      <SettingRow
        label="Accept decisions automatically"
        hint="Decisions from finished missions become memory later missions follow. Off: you review each one first."
      >
        <Switch
          aria-label="Accept decisions automatically"
          checked={settings.autoAcceptDecisions}
          onCheckedChange={(checked) => props.onUpdate({ autoAcceptDecisions: checked })}
        />
      </SettingRow>
    </ul>
  );
}
