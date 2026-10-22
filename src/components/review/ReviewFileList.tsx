import { i18n, useTranslation } from "@/i18n";
import { useRef } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import type { I18nKey } from "@/i18n";
import type { ReviewFile, ReviewFileOrigin, ReviewFileStatus } from "@/lib/review/review-scope";
import { reviewStyles as styles } from "./review.styles";

const STATUS_MARK: Record<ReviewFileStatus, string> = { added: "A", modified: "M", deleted: "D", renamed: "R", copied: "C" };
const STATUS_KEYS = {
  added: "review:files.status.added",
  modified: "review:files.status.modified",
  deleted: "review:files.status.deleted",
  renamed: "review:files.status.renamed",
  copied: "review:files.status.copied",
} as const satisfies Record<ReviewFileStatus, I18nKey>;
const GROUP_KEYS = {
  stage: "review:files.groups.stage",
  "after-stage": "review:files.groups.afterStage",
  unknown: "review:files.groups.unknown",
} as const satisfies Record<ReviewFileOrigin, I18nKey>;

function splitPath(path: string): { base: string; dir: string } {
  const index = path.lastIndexOf("/");
  return index < 0 ? { base: path, dir: "" } : { base: path.slice(index + 1), dir: path.slice(0, index) };
}

/**
 * The scope's changed files. A stage's files are grouped as its own, changed
 * after it, or not attributed. A file opened in Review is marked read, which
 * is not the same as the task being reviewed or the stage signed off.
 */
export function ReviewFileList(props: {
  files: readonly ReviewFile[];
  selected: string | null;
  read: readonly string[];
  onSelect: (file: ReviewFile) => void;
}) {
  useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const grouped = props.files.some((file) => file.origin !== undefined);
  const groups: Array<{ origin: ReviewFileOrigin | null; files: ReviewFile[] }> = grouped
    ? (["stage", "after-stage", "unknown"] as const).map((origin) => ({ origin, files: props.files.filter((file) => file.origin === origin) })).filter((group) => group.files.length)
    : [{ origin: null, files: [...props.files] }];
  const ordered = groups.flatMap((group) => group.files);
  const readCount = props.files.filter((file) => props.read.includes(file.path)).length;
  // Up and down move through the files the way the list reads, across groups.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const current = ordered.findIndex((file) => file.path === props.selected);
    const next = ordered[Math.min(ordered.length - 1, Math.max(0, current + (event.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    event.preventDefault();
    props.onSelect(next);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(`[data-review-path="${CSS.escape(next.path)}"]`)?.focus());
  };
  return (
    <div ref={listRef} className={sx(styles.section)} onKeyDown={onKeyDown}>
      <h3 className={sx(styles.regionTitle)}>
        {i18n.t("review:files.title")}
        <span className={sx(styles.regionAside)}>{i18n.t("review:files.readCount", { read: readCount, count: props.files.length })}</span>
      </h3>
      {props.files.length === 0 ? <p className={sx(styles.note)}>{i18n.t("review:files.none")}</p> : null}
      {groups.map((group) => (
        <section key={group.origin ?? "all"} className={sx(styles.section)} aria-label={group.origin ? i18n.t(GROUP_KEYS[group.origin]) : undefined}>
          {group.origin ? <h4 className={sx(styles.groupTitle)}>{i18n.t("review:files.groupWithCount", { group: i18n.t(GROUP_KEYS[group.origin]), count: group.files.length })}</h4> : null}
          <ul className={sx(styles.group)}>
            {group.files.map((file) => {
              const { base, dir } = splitPath(file.path);
              const read = props.read.includes(file.path);
              const status = i18n.t(STATUS_KEYS[file.status]);
              return (
                <li key={file.path}>
                  <Button
                    variant={props.selected === file.path ? "secondary" : "quiet"}
                    size="sm"
                    press="none"
                    xstyle={styles.fileRow}
                    data-review-path={file.path}
                    aria-current={props.selected === file.path || undefined}
                    aria-label={i18n.t(read ? "review:files.rowRead" : "review:files.row", { path: file.path, status })}
                    onClick={() => props.onSelect(file)}
                  >
                    <span aria-hidden className={sx(styles.fileStatus)} title={status}>{STATUS_MARK[file.status]}</span>
                    <span className={sx(styles.fileName)}>
                      <span className={sx(styles.fileBase)}>{base}</span>
                      {dir ? <span className={sx(styles.fileDir)}>{dir}</span> : null}
                    </span>
                    {file.additions !== null || file.deletions !== null ? (
                      <span aria-hidden className={sx(styles.fileCounts)}>+{file.additions ?? 0} −{file.deletions ?? 0}</span>
                    ) : null}
                    {read ? <Check aria-hidden className={sx(styles.fileRead)} /> : <span aria-hidden className={sx(styles.fileUnread)} />}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
