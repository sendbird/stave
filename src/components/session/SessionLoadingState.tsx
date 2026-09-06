import { ThinkingOrb } from "thinking-orbs";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { sx } from "@/components/ads/utils/stylex";
import { sessionLoadingStateStyles as styles } from "./session-loading-state.styles";

interface SessionLoadingStateProps {
  title: string;
  description: string;
  testId: string;
}

export function SessionLoadingState(args: SessionLoadingStateProps) {
  return (
    <section className={sx(styles.section)}>
      <Empty data-testid={args.testId} xstyle={styles.empty}>
        <EmptyHeader xstyle={styles.header}>
          <EmptyMedia variant="icon" xstyle={styles.media}>
            <ThinkingOrb
              state="working"
              size={64}
              theme="auto"
              aria-label={args.title}
            />
          </EmptyMedia>
          <div className={sx(styles.copy)}>
            <EmptyTitle xstyle={styles.title}>{args.title}</EmptyTitle>
            <EmptyDescription xstyle={styles.description}>
              {args.description}
            </EmptyDescription>
          </div>
        </EmptyHeader>
        <EmptyContent xstyle={styles.content}>
          <div className={sx(styles.lines)}>
            <div className={sx(styles.rowStart)}>
              <Skeleton className={sx(styles.bubbleLarge)} />
            </div>
            <div className={sx(styles.rowEnd)}>
              <Skeleton className={sx(styles.bubbleMedium)} />
            </div>
            <div className={sx(styles.rowStart)}>
              <Skeleton className={sx(styles.bubbleSmall)} />
            </div>
            <div className={sx(styles.metaRow)}>
              <Skeleton className={sx(styles.chipWide)} />
              <Skeleton className={sx(styles.chipWider)} />
            </div>
          </div>
        </EmptyContent>
      </Empty>
    </section>
  );
}
