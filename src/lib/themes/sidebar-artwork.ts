export const SIDEBAR_ARTWORK_OPTIONS = [
  {
    value: "space-haze",
    label: "Space Haze",
    description: "Diffuse nebula fog with the calmest depth. Default.",
  },
  {
    value: "wave-aurora",
    label: "Wave + Aurora",
    description: "Long flowing bands with a brighter ambient sweep.",
  },
  {
    value: "gravity-paint",
    label: "Gravity Paint",
    description: "Painterly mineral plumes with a heavier art texture.",
  },
] as const;

export type SidebarArtworkMode =
  (typeof SIDEBAR_ARTWORK_OPTIONS)[number]["value"];

export const DEFAULT_SIDEBAR_ARTWORK_MODE: SidebarArtworkMode = "space-haze";

const SIDEBAR_ARTWORK_MODES = new Set<SidebarArtworkMode>(
  SIDEBAR_ARTWORK_OPTIONS.map((option) => option.value),
);

export function normalizeSidebarArtworkMode(
  value: unknown,
): SidebarArtworkMode {
  return typeof value === "string"
    && SIDEBAR_ARTWORK_MODES.has(value as SidebarArtworkMode)
    ? (value as SidebarArtworkMode)
    : DEFAULT_SIDEBAR_ARTWORK_MODE;
}

export function resolveSidebarArtworkClass(args: {
  mode: SidebarArtworkMode;
}) {
  switch (args.mode) {
    case "wave-aurora":
      return "sidebar-liquid-glass--wave-aurora";
    case "gravity-paint":
      return "sidebar-liquid-glass--gravity-paint";
    case "space-haze":
    default:
      return "sidebar-liquid-glass--space-haze";
  }
}
