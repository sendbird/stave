import { z } from "zod";

export const LENS_VIEWPORT_WIDTHS = ["fit", 390, 820, 1280] as const;
export const LensViewportWidthSchema = z.literal(LENS_VIEWPORT_WIDTHS);
export type LensViewportWidth = (typeof LENS_VIEWPORT_WIDTHS)[number];

export const LensViewportArgsSchema = z.object({
  workspaceId: z.string().min(1).max(200),
  lensSessionId: z.string().min(1).max(200).optional(),
  width: LensViewportWidthSchema.describe("Width in CSS pixels (390, 820, or 1280), or fit to follow the pane."),
}).strict();
export type LensViewportArgs = z.infer<typeof LensViewportArgsSchema>;

export type LensViewport = {
  innerWidth: number;
  innerHeight: number;
};

export type LensGuestViewportRequest = {
  requestId?: string;
  workspaceId: string;
  lensSessionId: string;
  webContentsId: number;
  width: LensViewportWidth;
};

export const LensGuestViewportResultSchema = z.object({
  requestId: z.string(),
  expectedWidth: z.number().int().positive().nullable(),
}).strict();

export type LensGuestViewportResult = z.infer<typeof LensGuestViewportResultSchema>;
