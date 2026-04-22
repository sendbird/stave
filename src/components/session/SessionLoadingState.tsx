import { LoaderCircle } from "lucide-react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";

interface SessionLoadingStateProps {
  title: string;
  description: string;
  testId: string;
}

export function SessionLoadingState(args: SessionLoadingStateProps) {
  return (
    <section className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
      <Empty
        data-testid={args.testId}
        className="max-w-5xl items-stretch gap-5 rounded-[28px] border border-border/70 bg-card/65 p-6 text-left shadow-sm supports-backdrop-filter:backdrop-blur-sm"
      >
        <EmptyHeader className="max-w-none flex-row items-center gap-4">
          <EmptyMedia variant="icon" className="size-11 rounded-2xl bg-primary/10 text-primary">
            <LoaderCircle className="size-5 animate-spin" />
          </EmptyMedia>
          <div className="min-w-0 space-y-1">
            <EmptyTitle className="text-left text-base">{args.title}</EmptyTitle>
            <EmptyDescription className="text-left">
              {args.description}
            </EmptyDescription>
          </div>
        </EmptyHeader>
        <EmptyContent className="max-w-none items-stretch gap-4">
          <div className="space-y-3">
            <div className="flex justify-start">
              <Skeleton className="h-24 w-full max-w-3xl rounded-3xl bg-muted/75" />
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-14 w-[min(28rem,78%)] rounded-3xl bg-muted/60" />
            </div>
            <div className="flex justify-start">
              <Skeleton className="h-20 w-full max-w-2xl rounded-3xl bg-muted/70" />
            </div>
            <div className="flex items-center gap-2 px-1 pt-1">
              <Skeleton className="h-3 w-16 rounded-full bg-muted/70" />
              <Skeleton className="h-3 w-24 rounded-full bg-muted/55" />
            </div>
          </div>
        </EmptyContent>
      </Empty>
    </section>
  );
}
