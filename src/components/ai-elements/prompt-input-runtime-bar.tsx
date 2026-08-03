import { cn } from "@/lib/utils";

export interface PromptInputRuntimeStatusItem {
  id: string;
  label: string;
  value: string;
  tone?: "default" | "warning";
}

interface PromptInputRuntimeBarProps {
  statusItems?: readonly PromptInputRuntimeStatusItem[];
  className?: string;
  withBorder?: boolean;
}

export interface PromptInputRuntimeProfile {
  label: "Safe" | "Custom" | "Elevated";
  tone: "default" | "custom" | "warning";
  description: string;
}

type RuntimeSectionId = "access" | "reasoning" | "execution";

const RUNTIME_SECTIONS = [
  { id: "access", label: "Access" },
  { id: "reasoning", label: "Reasoning" },
  { id: "execution", label: "Execution" },
] as const satisfies readonly {
  id: RuntimeSectionId;
  label: string;
}[];

const ACCESS_ITEM_IDS = new Set([
  "permissions",
  "sandbox",
  "unsandboxed",
  "dangerous-skip",
  "network",
  "approvals",
  "web-search",
  "setting-sources",
]);

const REASONING_ITEM_IDS = new Set([
  "effort",
  "thinking",
  "raw-reasoning",
  "summary",
  "summary-support",
  "fast-mode",
]);

function isEnabledRuntimeValue(value: string) {
  return ["on", "enabled", "yes", "true"].includes(value.trim().toLowerCase());
}

function isElevatedRuntimeItem(item: PromptInputRuntimeStatusItem) {
  if (
    (item.id === "dangerous-skip" || item.id === "unsandboxed") &&
    isEnabledRuntimeValue(item.value)
  ) {
    return true;
  }

  if (
    (item.id === "permissions" &&
      item.value
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "") === "bypasspermissions") ||
    (item.id === "approvals" && item.value.trim().toLowerCase() === "never")
  ) {
    return true;
  }

  if (item.id !== "sandbox") {
    return false;
  }

  return (
    item.tone === "warning" ||
    ["disabled", "danger full access", "full access"].includes(
      item.value.trim().toLowerCase(),
    )
  );
}

function isCustomRuntimeItem(item: PromptInputRuntimeStatusItem) {
  if (isElevatedRuntimeItem(item) || item.tone === "warning") {
    return true;
  }

  if (item.id.endsWith("-binary")) {
    return true;
  }

  if (
    ["plan-mode", "fast-mode", "raw-reasoning"].includes(item.id) &&
    isEnabledRuntimeValue(item.value)
  ) {
    return true;
  }

  if (item.id === "task-budget" || item.id === "advisor") {
    return item.value.trim().toLowerCase() !== "off";
  }

  if (item.id === "setting-sources") {
    return item.value.trim().toLowerCase() !== "project";
  }

  return false;
}

export function getPromptInputRuntimeProfile(
  statusItems: readonly PromptInputRuntimeStatusItem[],
): PromptInputRuntimeProfile {
  if (statusItems.some(isElevatedRuntimeItem)) {
    return {
      label: "Elevated",
      tone: "warning",
      description: "Expanded access is active for the next turn.",
    };
  }

  if (statusItems.some(isCustomRuntimeItem)) {
    return {
      label: "Custom",
      tone: "custom",
      description: "One or more runtime overrides are active.",
    };
  }

  return {
    label: "Safe",
    tone: "default",
    description: "The next turn uses the standard protected runtime.",
  };
}

function getRuntimeSectionId(
  item: PromptInputRuntimeStatusItem,
): RuntimeSectionId {
  if (ACCESS_ITEM_IDS.has(item.id)) {
    return "access";
  }
  if (REASONING_ITEM_IDS.has(item.id)) {
    return "reasoning";
  }
  return "execution";
}

export function PromptInputRuntimeBar(args: PromptInputRuntimeBarProps) {
  const statusItems = args.statusItems ?? [];

  if (statusItems.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        args.withBorder !== false && "border-t border-border/60",
        args.className,
      )}
    >
      <div className="divide-y divide-border/60">
        {RUNTIME_SECTIONS.map((section) => {
          const sectionItems = statusItems.filter(
            (item) => getRuntimeSectionId(item) === section.id,
          );
          if (sectionItems.length === 0) {
            return null;
          }

          return (
            <section
              key={section.id}
              aria-label={`${section.label} runtime settings`}
              className="px-5 py-3.5"
            >
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {section.label}
              </h3>
              <dl className="divide-y divide-border/45">
                {sectionItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid min-h-9 grid-cols-[minmax(0,1fr)_minmax(6rem,auto)] items-center gap-5 py-2 text-[13px]"
                  >
                    <dt className="min-w-0 text-muted-foreground">
                      {item.label}
                    </dt>
                    <dd
                      className={cn(
                        "max-w-48 truncate text-right font-medium text-foreground",
                        (item.tone === "warning" ||
                          isElevatedRuntimeItem(item)) &&
                          "text-warning",
                      )}
                      title={item.value}
                    >
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </div>
  );
}
