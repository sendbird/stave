export const UI_LAYER_VALUE = {
  resizer: 20,
  chrome: 30,
  sessionFloater: 35,
  floatingChrome: 40,
  muse: 60,
  dialog: 80,
  popover: 90,
  appMenu: 100,
  lightbox: 110,
} as const;

export const UI_LAYER_CLASS = {
  resizer: "z-20",
  chrome: "z-30",
  sessionFloater: "z-[35]",
  floatingChrome: "z-40",
  muse: "z-[60]",
  dialog: "z-[80]",
  popover: "z-[90]",
  appMenu: "z-[100]",
  lightbox: "z-[110]",
} as const;

/**
 * Elevation is reserved for content that physically floats above the app.
 * Keep the scale intentionally small: anchored controls and blocking surfaces.
 */
export const UI_ELEVATION_CLASS = {
  surface: "shadow-[0_1px_2px_oklch(0_0_0/0.07)]",
  raised:
    "shadow-[0_12px_32px_-16px_oklch(0_0_0/0.22),0_2px_8px_-3px_oklch(0_0_0/0.12)]",
  floating:
    "shadow-[0_18px_48px_-18px_oklch(0_0_0/0.28),0_4px_12px_-5px_oklch(0_0_0/0.16)]",
  modal:
    "shadow-[0_32px_80px_-24px_oklch(0_0_0/0.38),0_8px_24px_-8px_oklch(0_0_0/0.22)]",
} as const;
