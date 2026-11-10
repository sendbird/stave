import * as stylex from "@stylexjs/stylex";

/**
 * The conversation's type scale: three sizes, each derived from the reader's
 * chat font size (Settings → Chat → Message font size), each with one fixed
 * line-height ratio.
 *
 * - `body` — the chat font size itself: replies, user bubbles, the composer.
 * - `secondary` — one step down the AUI scale (16 → 14): status rows,
 *   failures, tables, chips, the running strip.
 * - `meta` — two steps down (16 → 12): times, file details, table headers,
 *   code block labels.
 *
 * Headings step up from `body` (`chatHeadingScale`), and code glyphs follow
 * the separate code font size setting; everything else in the conversation
 * reads one of the three. The AUI caption and micro steps are the floors, so a
 * small chat font size never pushes secondary or meta text below them.
 *
 * The host that knows the chat font size sets the values inline with
 * `chatTypeScaleVars` (the markdown root, a message, the Tars column). They
 * are plain lengths there, so every descendant reads the host's size; the
 * defaults below are the scale at the setting's default, 16px.
 *
 * Variables rather than constants so later surfaces (cards, the tray) can
 * read the same steps.
 */
export const chatType = stylex.defineVars({
  "--chat-type-body": "var(--aui-font-size-lead)",
  "--chat-type-secondary": "var(--aui-font-size-body)",
  "--chat-type-meta": "var(--aui-font-size-caption)",
  /** 1.55: about 25px at 16px, a reading line for prose. */
  "--chat-type-body-leading": "1.55",
  /** `--aui-line-height-normal`: 20px at 14px. */
  "--chat-type-secondary-leading": "var(--aui-line-height-normal)",
  /** `--aui-line-height-tight`: about 16px at 12px. */
  "--chat-type-meta-leading": "var(--aui-line-height-tight)",
});
