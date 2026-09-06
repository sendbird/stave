import { AlertTriangle } from "lucide-react";
import type { HTMLAttributes } from "react";
import { cx, sx } from "@/components/ads/utils/stylex";
import type { TruncationNotice } from "@/lib/truncation-visibility";
import { truncationWarningStyles as styles } from "./truncation-warning.styles";

export function TruncationWarningBanner({
  notice,
  className,
  compact = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  notice: TruncationNotice;
  compact?: boolean;
}) {
  return (
    <div
      role="note"
      className={cx(
        sx(
          styles.banner,
          compact ? styles.bannerCompact : styles.bannerRegular,
        ),
        className,
      )}
      {...props}
    >
      <AlertTriangle className={sx(styles.icon, compact && styles.iconCompact)} />
      <div className={sx(styles.body)}>
        <p className={sx(styles.title)}>{notice.title}</p>
        <p className={sx(styles.description)}>{notice.description}</p>
      </div>
    </div>
  );
}
