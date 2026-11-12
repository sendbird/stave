import { GitHubIcon } from "../workspace-information/workspace-information-link-rows";
import { ServiceLinkIcon } from "@/components/ui/service-link-badge";
import type { TrackerSourceId } from "@/lib/tracker-issues/types";

export function TrackerSourceIcon({ source, className }: { source: TrackerSourceId; className?: string }) {
  return source === "github" ? <GitHubIcon className={className} />
    : <ServiceLinkIcon kind={source} className={className} />;
}
