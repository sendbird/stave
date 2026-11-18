import { useEffect, useState } from "react";
import { Image as ImageIcon, X } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { Lightbox } from "@/components/aui/components/Lightbox";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { sx } from "@/components/aui/utils/stylex";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { tarsMessageStyles as styles } from "./tars-message.styles";

/** An image the conversation can show: its name and a source the window already holds. */
export interface TarsShownImage { name: string; src: string }

/**
 * A saved image's preview read: `undefined` while it is read, the data URL
 * once it arrives, `null` when the bridge cannot read it (the message is gone,
 * or a bridge that predates previews), which shows the image as a file chip.
 */
export type TarsSavedImage = string | null | undefined;

/**
 * Images already read, by message and position. A saved attachment never
 * changes, so a read holds for the window's life; the conversation is read
 * again on every change and must not read its images again with it. Bounded
 * to the most recently shown, since each can be megabytes.
 */
const READ_LIMIT = 32;
const reads = new Map<string, { pending: Promise<string | null>; value: TarsSavedImage }>();

function readSavedImage(messageId: string, index: number): { pending: Promise<string | null>; value: TarsSavedImage } {
  const key = `${messageId}:${index}`;
  const hit = reads.get(key);
  if (hit) {
    reads.delete(key);
    reads.set(key, hit);
    return hit;
  }
  const read = typeof window === "undefined" ? undefined : window.api?.tars?.getAttachmentImage;
  const entry: { pending: Promise<string | null>; value: TarsSavedImage } = { pending: Promise.resolve(null), value: read ? undefined : null };
  entry.pending = read
    ? read({ messageId, index }).then((image) => { entry.value = image?.dataUrl ?? null; return entry.value; },
      // A failed read is not remembered: the next time the message is shown reads it again.
      () => { reads.delete(key); entry.value = null; return null; })
    : Promise.resolve(null);
  reads.set(key, entry);
  for (const oldest of reads.keys()) {
    if (reads.size <= READ_LIMIT) break;
    reads.delete(oldest);
  }
  return entry;
}

/** What is already known of a saved image without starting a read: a render reads nothing. */
function peekSavedImage(messageId: string, index: number): TarsSavedImage {
  const hit = reads.get(`${messageId}:${index}`);
  if (hit) return hit.value;
  return typeof window !== "undefined" && window.api?.tars?.getAttachmentImage ? undefined : null;
}

/** The previews of a sent message's images, by their positions among its attachments. */
export function useTarsSavedImages(messageId: string, indexes: readonly number[]): ReadonlyMap<number, TarsSavedImage> {
  const signature = indexes.join(",");
  const [images, setImages] = useState(() => new Map(indexes.map((index) => [index, peekSavedImage(messageId, index)] as const)));
  useEffect(() => {
    let current = true;
    const wanted = signature ? signature.split(",").map(Number) : [];
    const entries = wanted.map((index) => [index, readSavedImage(messageId, index)] as const);
    setImages(new Map(entries.map(([index, entry]) => [index, entry.value])));
    for (const [index, entry] of entries) {
      if (entry.value !== undefined) continue;
      void entry.pending.then((value) => {
        if (current) setImages((previous) => new Map(previous).set(index, value));
      });
    }
    return () => { current = false; };
  }, [messageId, signature]);
  return images;
}

/**
 * An attached image, small enough to sit in a row of them and large enough to
 * tell which one it is. Clicking it, or Enter and Space, opens it larger; its
 * name is its tooltip. In the composer it carries its remove button.
 */
export function TarsImageTile({ image, onOpen, onRemove, removeLabel }: {
  image: TarsShownImage; onOpen: () => void; onRemove?: () => void; removeLabel?: string;
}) {
  const { t } = useTranslation(["shell"]);
  return <span className={sx(styles.imageTile)} data-tars-attachment-image="ready">
    <Tooltip content={image.name}>
      <Button layout="host" type="button" xstyle={styles.imageButton} aria-label={t("shell:tars.conversation.attachments.openImage", { name: image.name })}
        onClick={onOpen} data-tars-attachment-open="">
        <img src={image.src} alt="" draggable={false} className={sx(styles.imagePixels)} />
      </Button>
    </Tooltip>
    {onRemove ? <span className={sx(styles.imageRemove)}>
      <Tooltip content={removeLabel}>
        <Button type="button" size="2xs" iconOnly variant="floating" aria-label={removeLabel ?? ""} onClick={onRemove} data-tars-attachment-remove="">
          <X aria-hidden="true" />
        </Button>
      </Tooltip>
    </span> : null}
  </span>;
}

/** A sent image while it is read: its tile's box, so the row keeps its shape. */
export function TarsImagePending({ name }: { name: string }) {
  const { t } = useTranslation(["shell"]);
  return <span role="img" aria-label={t("shell:tars.conversation.attachments.loadingImage", { name })} className={sx(styles.imagePending)}
    data-tars-attachment-image="loading">
    <ImageIcon aria-hidden="true" className={sx(styles.fileIcon)} />
  </span>;
}

/**
 * The images of one message, or of the composer, at full size: the app's
 * media viewer, with the others a step away by the arrow keys or its own
 * buttons. Escape, the close button or a click beside the image closes it,
 * and focus returns to the tile that opened it.
 */
export function TarsImageViewer({ images, index, onIndexChange }: {
  images: readonly TarsShownImage[]; index: number | null; onIndexChange: (index: number | null) => void;
}) {
  useTranslation();
  if (!images.length) return null;
  return <Lightbox open={index !== null} onOpenChange={(open) => { if (!open) onIndexChange(null); }}
    media={images.map((image) => ({ src: image.src, alt: image.name }))} index={Math.min(index ?? 0, images.length - 1)} onIndexChange={onIndexChange}
    hasZoom closeLabel={i18n.t("ui:imageLightbox.closePreview")} className={UI_LAYER_CLASS.lightbox} testId="tars-attachment-viewer" />;
}
